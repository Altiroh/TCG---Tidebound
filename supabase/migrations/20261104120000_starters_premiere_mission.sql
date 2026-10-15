-- ======================================================================
-- PREMIÈRE MISSION — les trois starters débloqués d'un coup (15/10/2026)
-- ======================================================================
--
-- ENTIÈREMENT REJOUABLE : chaque instruction tolère d'avoir déjà été
-- passée. À APPLIQUER À LA MAIN, AVANT de pousser le code qui l'appelle
-- (`features/onboarding/onboardingService.ts` → `grant_starter_decks`).
-- Sans elle, l'octroi échoue proprement (journal serveur) et le joueur ne
-- reçoit pas ses starters — rien d'autre ne casse.
--
-- DÉCISION DU PROPRIÉTAIRE (15/10/2026). Quand le tutoriel est TERMINÉ OU
-- PASSÉ, le joueur reçoit trois préconstruits d'un coup :
--   le-rempart-vivant, les-saboteurs-du-pont, l-assaut-des-marees.
-- Cette « première mission » REMPLACE le choix gratuit d'un préconstruit
-- (`claim_borrowed_deck`, source 'borrowed'). Les déblocages 'borrowed'
-- déjà en base restent valides — rien n'est supprimé ici, et
-- `claim_borrowed_deck` n'est pas retirée (le code ne l'appelle plus).
--
-- Les comptes existants (tutoriel déjà completed/skipped) sont rattrapés
-- PARESSEUSEMENT par le serveur, à la lecture de l'onboarding : pas de
-- reprise de données ici.
--
-- Après application : `npm run seed:cards` pour semer les trois listes
-- dans `system_decks` / `system_deck_cards`.

-- ======================================================================
-- 1. UNE TROISIÈME PORTE : source = 'starter'
-- ======================================================================
-- La contrainte d'origine est déclarée en ligne dans
-- `20260915120000_player_progression_meta.sql` ; Postgres l'a nommée
-- `player_deck_unlocks_source_check`. On retire TOUTE contrainte CHECK de
-- la table qui porte sur `source`, quel que soit son nom réel, puis on pose
-- la nôtre sous un nom fixe.
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'player_deck_unlocks'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.player_deck_unlocks drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.player_deck_unlocks
  add constraint player_deck_unlocks_source_check
  check (source in ('borrowed', 'precon_token', 'starter'));

-- ======================================================================
-- 2. L'OCTROI : grant_starter_decks
-- ======================================================================
-- Idempotent : `on conflict do nothing` sur la clé (user_id, deck_id). Un
-- tutoriel rejoué, un double clic ou le rattrapage à la lecture ne créent
-- jamais de doublon, et un deck déjà débloqué autrement (Jeton) reste noté
-- par sa porte d'origine.
--
-- Garde-fous, côté base :
--   - seuls les trois identifiants de starters sont acceptés (un bug
--     applicatif ne peut pas offrir un deck du rayon au Jeton) ;
--   - le tutoriel doit être terminé ou passé.
--
-- Renvoie `{ ok, granted: [ids NOUVELLEMENT accordés] }` — vide si tout
-- était déjà là : c'est ce qui permet au serveur d'annoncer la mission UNE
-- fois.
create or replace function public.grant_starter_decks(p_user_id uuid, p_deck_ids text[])
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_granted text[] := '{}';
  v_deck text;
begin
  perform public.assert_server_caller('grant_starter_decks');

  if p_deck_ids is null or not (p_deck_ids <@ array['le-rempart-vivant', 'les-saboteurs-du-pont', 'l-assaut-des-marees']::text[]) then
    return jsonb_build_object('ok', false, 'error', 'Seuls les starters de la première mission s''accordent ainsi.', 'granted', '[]'::jsonb);
  end if;

  select po.tutorial_status into v_status
  from public.player_onboarding po where po.user_id = p_user_id;

  if coalesce(v_status, 'not_started') not in ('completed', 'skipped') then
    return jsonb_build_object('ok', false, 'error', 'La première mission n''est pas encore accomplie.', 'granted', '[]'::jsonb);
  end if;

  foreach v_deck in array p_deck_ids loop
    insert into public.player_deck_unlocks (user_id, deck_id, source)
    values (p_user_id, v_deck, 'starter')
    on conflict (user_id, deck_id) do nothing;
    if found then
      v_granted := array_append(v_granted, v_deck);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'granted', to_jsonb(v_granted));
end;
$$;

revoke all on function public.grant_starter_decks(uuid, text[]) from public, anon, authenticated;
grant execute on function public.grant_starter_decks(uuid, text[]) to service_role;

-- ======================================================================
-- 3. LE RAYON AU JETON : ni starters, ni decks retirés
-- ======================================================================
-- Le serveur refuse déjà (`unlockPreconDeck`) ; la base refuse aussi, pour
-- qu'aucun chemin — panier du Market compris — ne dépense un Jeton sur un
-- starter ou sur un deck retiré du rayon (la-forteresse, epavistes,
-- a-bout-de-raison). Ceux qui les ont débloqués les GARDENT : rien n'est
-- supprimé de `player_deck_unlocks`.
create or replace function public.unlock_precon_deck(p_user_id uuid, p_deck_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_tokens integer;
begin
  perform public.assert_server_caller('unlock_precon_deck');

  if p_deck_id in ('le-rempart-vivant', 'les-saboteurs-du-pont', 'l-assaut-des-marees') then
    return jsonb_build_object('ok', false, 'error', 'Ce deck est offert par la première mission : il ne s''achète pas.');
  end if;

  if p_deck_id in ('la-forteresse', 'epavistes', 'a-bout-de-raison') then
    return jsonb_build_object('ok', false, 'error', 'Ce préconstruit a quitté le rayon.');
  end if;

  if exists (select 1 from public.player_deck_unlocks where user_id = p_user_id and deck_id = p_deck_id) then
    return jsonb_build_object('ok', false, 'error', 'Ce préconstruit est déjà débloqué.');
  end if;

  select pp.precon_tokens into v_tokens
  from public.player_progression pp where pp.user_id = p_user_id
  for update;

  if coalesce(v_tokens, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'Aucun Jeton de Préconstruit disponible.', 'tokens', coalesce(v_tokens, 0));
  end if;

  update public.player_progression
    set precon_tokens = player_progression.precon_tokens - 1, updated_at = now()
    where user_id = p_user_id;

  insert into public.player_deck_unlocks (user_id, deck_id, source)
  values (p_user_id, p_deck_id, 'precon_token');

  return jsonb_build_object('ok', true, 'deck_id', p_deck_id, 'tokens', v_tokens - 1);
end;
$$;

revoke all on function public.unlock_precon_deck(uuid, text) from public, anon, authenticated;
grant execute on function public.unlock_precon_deck(uuid, text) to service_role;
