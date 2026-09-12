-- État de partie privé : fin de la fuite d'information réseau, et fin des
-- écritures navigateur sur `matches`.
--
-- Deux failles corrigées ici.
--
-- 1. FUITE D'INFORMATION. `matches.state` contenait le `GameState` complet
--    (mains, ordre des decks, graine du générateur aléatoire) et la table est
--    publiée en Realtime : chaque participant recevait donc la main de son
--    adversaire à chaque coup, et pouvait prédire toutes les pioches et tous
--    les tirages aléatoires à venir. L'état complet déménage dans
--    `match_states`, que NI les joueurs NI Realtime ne peuvent lire. Le
--    client reçoit une vue projetée pour lui seul (`toPlayerView`,
--    `game/state/playerView.ts`) via une Server Action ; Realtime ne
--    transporte plus qu'un compteur de version, qui lui signale qu'il doit
--    la redemander.
--
-- 2. ÉCRITURE DIRECTE. La policy « participants can update their match »
--    laissait n'importe quel participant réécrire `matches.state` avec la
--    clé anon — donc son Ancrage, sa main, le vainqueur — sans jamais passer
--    par le moteur. Toutes les policies d'écriture sont supprimées : les
--    parties ne sont plus créées, rejointes ni jouées que par des Server
--    Actions (clé service_role) via les fonctions ci-dessous.
--
-- La policy « anyone authenticated can find a waiting match » disparaît
-- aussi : elle permettait de lister TOUTES les parties privées en attente,
-- donc leurs codes d'invitation. La recherche par code se fait désormais
-- côté serveur.

-- --- état complet, privé ---------------------------------------------------

create table public.match_states (
  match_id uuid primary key references public.matches (id) on delete cascade,
  -- `GameState` complet (`game/state/types.ts`). Jamais lu par un client.
  state jsonb not null,
  -- Verrou optimiste : un coup n'est enregistré que s'il a été calculé à
  -- partir de la version courante. Deux coups soumis en même temps ne
  -- peuvent donc pas s'écraser l'un l'autre.
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table public.match_states enable row level security;
-- Aucune policy : seules les fonctions `security definer` et la clé
-- service_role y accèdent. Volontairement absente de la publication Realtime.

insert into public.match_states (match_id, state)
select m.id, m.state from public.matches m where m.state is not null
on conflict (match_id) do nothing;

-- --- matches : métadonnées publiques seulement ------------------------------

alter table public.matches
  -- Recopie de `match_states.version` : c'est la seule chose que Realtime
  -- diffuse au sujet de l'état. Quand elle change, le client redemande sa vue.
  add column state_version integer not null default 0,
  -- Difficulté du bot pour une partie `mode = 'bot'` (le bot n'a pas de
  -- profil : `player2_id` reste null, `player2_deck_id` porte son deck).
  add column bot_difficulty text check (bot_difficulty in ('facile', 'moyen', 'difficile'));

update public.matches m
  set state_version = 1
  where exists (select 1 from public.match_states s where s.match_id = m.id);

alter table public.matches drop column state;

drop policy if exists "anyone authenticated can find a waiting match by invite code" on public.matches;
drop policy if exists "a user can create a match as player1" on public.matches;
drop policy if exists "participants can update their match, including joining an open one" on public.matches;
-- Reste : « players can read their own matches » (lecture des métadonnées,
-- nécessaire à Realtime pour l'écran d'attente et le signal de version).

-- --- création d'une partie déjà commencée (bot, matchmaking) ----------------

create or replace function public.create_active_match(
  p_match_id uuid,
  p_invite_code text,
  p_mode text,
  p_player1_id uuid,
  p_player1_deck_id text,
  p_player2_id uuid,
  p_player2_deck_id text,
  p_bot_difficulty text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.assert_server_caller('create_active_match');

  insert into public.matches (
    id, invite_code, mode, is_vs_bot, player1_id, player1_deck_id, player2_id, player2_deck_id,
    bot_difficulty, status, state_version
  )
  values (
    p_match_id, p_invite_code, p_mode, p_mode = 'bot', p_player1_id, p_player1_deck_id, p_player2_id,
    p_player2_deck_id, p_bot_difficulty, 'active', 1
  );

  insert into public.match_states (match_id, state) values (p_match_id, p_state);

  return jsonb_build_object('ok', true, 'version', 1);
end;
$$;

revoke all on function public.create_active_match(uuid, text, text, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_active_match(uuid, text, text, uuid, text, uuid, text, text, jsonb) to service_role;

-- --- rejoindre une partie privée en attente ---------------------------------
--
-- Atomique : passer la partie en `active` et créer son état doivent réussir
-- ensemble. `status = 'waiting' and player2_id is null` dans le WHERE règle
-- la course entre deux joueurs qui rejoignent le même code au même moment.

create or replace function public.activate_waiting_match(
  p_match_id uuid,
  p_player2_id uuid,
  p_player2_deck_id text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.assert_server_caller('activate_waiting_match');

  update public.matches
    set player2_id = p_player2_id,
        player2_deck_id = p_player2_deck_id,
        status = 'active',
        state_version = 1,
        updated_at = now()
    where id = p_match_id and status = 'waiting' and player2_id is null and player1_id <> p_player2_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cette partie n''est plus disponible.');
  end if;

  insert into public.match_states (match_id, state) values (p_match_id, p_state);
  return jsonb_build_object('ok', true, 'version', 1);
end;
$$;

revoke all on function public.activate_waiting_match(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_waiting_match(uuid, uuid, text, jsonb) to service_role;

-- --- enregistrer un coup ------------------------------------------------------
--
-- `p_expected_version` est la version à partir de laquelle le serveur a
-- calculé `p_state`. Si elle a changé entre-temps (autre coup, double clic),
-- rien n'est écrit et l'appelant doit recharger : c'est ce qui empêche un
-- coup calculé sur un état périmé d'effacer le précédent.

create or replace function public.commit_match_state(
  p_match_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_status text,
  p_winner_id uuid
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_version integer;
  v_status text;
begin
  perform public.assert_server_caller('commit_match_state');

  if p_status not in ('active', 'finished') then
    return jsonb_build_object('ok', false, 'error', 'Statut invalide.');
  end if;

  -- Verrouille la ligne de métadonnées : une partie terminée ou abandonnée
  -- ne peut plus recevoir de coup, même calculé juste avant.
  select m.status into v_status from public.matches m where m.id = p_match_id for update;
  if v_status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'error', 'Cette partie n''est pas en cours.');
  end if;

  update public.match_states
    set state = p_state, version = match_states.version + 1, updated_at = now()
    where match_id = p_match_id and version = p_expected_version
    returning match_states.version into v_version;

  if v_version is null then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;

  update public.matches
    set state_version = v_version,
        status = p_status,
        winner_id = p_winner_id,
        finished_at = case when p_status = 'finished' then coalesce(matches.finished_at, now()) else matches.finished_at end,
        updated_at = now()
    where id = p_match_id;

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

revoke all on function public.commit_match_state(uuid, integer, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.commit_match_state(uuid, integer, jsonb, text, uuid) to service_role;
