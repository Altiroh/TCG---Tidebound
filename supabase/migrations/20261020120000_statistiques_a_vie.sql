-- ======================================================================
-- STATISTIQUES À VIE — compteurs permanents alimentés par les parties,
-- et achat d'un Collectable en Jetons de Préconstruit
-- ======================================================================
-- Les exploits et les Collectables se jugent sur des COMPTEURS PERSISTÉS
-- (`game/achievements/catalog.ts`, `game/cosmetics/unlock.ts`). Jusqu'ici,
-- ces compteurs ne savaient rien de ce qui se passe PENDANT une partie :
-- victoires, défaites, niveau, collection. Les nouveaux dos de carte (« Le
-- Puits sans fond » : cinq unités adverses détruites en même temps ; « Le
-- Rassemblement » : couler l'adversaire d'un tir de Navire) et la centaine
-- d'exploits qui suit ont besoin du reste.
--
-- Trois ajouts :
--
--   1. `player_lifetime_stats` — UNE LIGNE PAR JOUEUR ET PAR CLÉ, avec deux
--      colonnes : `total` (somme de toutes les parties) et `record` (la
--      meilleure partie). Choisi plutôt qu'un jsonb par joueur :
--        - la mise à jour est un seul `insert … on conflict do update` par
--          clé, `total + x` et `greatest(record, x)` calculés par la base
--          sous le verrou de la ligne — pas de lecture-modification-écriture
--          d'un document entier, donc rien à perdre entre deux parties qui
--          se terminent en même temps ;
--        - une clé nouvelle ne demande aucune migration : elle naît à la
--          première partie qui la produit ;
--        - une clé se lit (et s'agrège entre joueurs, un jour) avec un
--          simple `where stat_key = …`.
--      Les clés et leur nature (cumul ou record) vivent au catalogue
--      TypeScript (`game/quests/matchStats.ts`) ; la base ne fait que les
--      additionner et en garder le maximum.
--
--   2. `record_match_lifetime_stats` — IDEMPOTENTE PAR PARTIE, exactement
--      comme `record_match_quest_progress` : la première écriture pose une
--      ligne dans `match_lifetime_stats` (clé `match_id + user_id`) ; si la
--      ligne existait déjà, la partie a déjà compté et rien ne bouge.
--
--   3. `purchase_cosmetic_tokens` — l'achat d'un Collectable en Jetons de
--      Préconstruit (« La Consigne », 3 Jetons). Même contrat que
--      `purchase_cosmetic` (prix fourni par le serveur applicatif, qui le
--      relit au catalogue ; la base garantit solde, unicité, atomicité).
--
-- La propriétaire applique les migrations À LA MAIN : tant que celle-ci ne
-- l'est pas, l'application dégrade proprement (lecture isolée des
-- statistiques, appel d'écriture qui échoue sans casser la fin de partie,
-- achat en Jetons refusé avec un message générique).
--
-- Entièrement idempotente : rejouable sans risque.


-- --- 1. Compteurs à vie ------------------------------------------------

create table if not exists public.player_lifetime_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Clé du catalogue `MATCH_STATS` (ex: 'destroy_enemy_units').
  stat_key text not null check (stat_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- Somme de toutes les parties. Sans objet pour une clé de nature
  -- « record » (l'application ne la lit pas), mais tenue quand même : une
  -- seule règle d'écriture pour toutes les clés.
  total bigint not null default 0 check (total >= 0),
  -- Meilleure valeur sur UNE partie.
  record bigint not null default 0 check (record >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, stat_key)
);

alter table public.player_lifetime_stats enable row level security;

drop policy if exists "a user can read their own lifetime stats" on public.player_lifetime_stats;
create policy "a user can read their own lifetime stats"
  on public.player_lifetime_stats for select
  to authenticated
  using (user_id = auth.uid());

-- Clé d'idempotence : une partie ne compte qu'une fois par joueur. Le
-- relevé envoyé est conservé tel quel — utile pour comprendre après coup
-- d'où vient un compteur.
create table if not exists public.match_lifetime_stats (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stats jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.match_lifetime_stats enable row level security;

drop policy if exists "a user can read their own match lifetime stats" on public.match_lifetime_stats;
create policy "a user can read their own match lifetime stats"
  on public.match_lifetime_stats for select
  to authenticated
  using (user_id = auth.uid());


-- --- 2. Enregistrement d'une partie ---------------------------------------
/*
 * `p_stats` : { "clé": valeur, … } — la contribution de CETTE partie,
 * calculée par `computeMatchStats` depuis le journal d'événements. Chaque
 * valeur s'ajoute au `total` de sa clé et relève son `record` si elle le
 * dépasse.
 *
 * Défensive sur la forme, comme tout ce qui écrit un compteur : une clé mal
 * formée, une valeur non entière, négative ou absurde (> 1 000 000 pour une
 * seule partie) est ignorée plutôt que d'empoisonner le compteur à vie.
 * Au-delà de 200 clés, la partie est refusée en bloc.
 *
 * Retour : `recorded` dit si la partie vient d'être comptée (false = déjà
 * comptée auparavant, rien n'a bougé) — l'appelant ne resynchronise les
 * exploits et Collectables que dans le premier cas.
 */
create or replace function public.record_match_lifetime_stats(
  p_user_id uuid,
  p_match_id uuid,
  p_stats jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_entry record;
  v_value bigint;
  v_applied integer := 0;
begin
  perform public.assert_server_caller('record_match_lifetime_stats');

  -- Sans identifiant de partie, rien ne protège du double comptage : refusé.
  if p_user_id is null or p_match_id is null then
    return jsonb_build_object('ok', false, 'error', 'Partie ou joueur manquant.');
  end if;

  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Relevé invalide.');
  end if;

  if (select count(*) from jsonb_object_keys(p_stats)) > 200 then
    return jsonb_build_object('ok', false, 'error', 'Relevé trop volumineux.');
  end if;

  insert into public.match_lifetime_stats (match_id, user_id, stats)
  values (p_match_id, p_user_id, p_stats)
  on conflict (match_id, user_id) do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'recorded', false, 'applied', 0);
  end if;

  for v_entry in select key, value from jsonb_each(p_stats) loop
    continue when v_entry.key !~ '^[a-z][a-z0-9_]{0,63}$';
    continue when jsonb_typeof(v_entry.value) <> 'number';
    continue when (v_entry.value #>> '{}') !~ '^[0-9]+$';
    v_value := (v_entry.value #>> '{}')::bigint;
    continue when v_value <= 0 or v_value > 1000000;

    insert into public.player_lifetime_stats as s (user_id, stat_key, total, record)
    values (p_user_id, v_entry.key, v_value, v_value)
    on conflict (user_id, stat_key) do update set
      total = s.total + excluded.total,
      record = greatest(s.record, excluded.record),
      updated_at = now();

    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('ok', true, 'recorded', true, 'applied', v_applied);
end;
$$;

revoke all on function public.record_match_lifetime_stats(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_match_lifetime_stats(uuid, uuid, jsonb) to service_role;


-- --- 3. Achat d'un Collectable en Jetons de Préconstruit ------------------
/*
 * Même contrat que `purchase_cosmetic` (Tides), dans l'autre monnaie du
 * Market : le prix vient de l'appelant, qui le relit au catalogue
 * (`unlock: { kind: "purchaseTokens", priceTokens }`) — jamais du client.
 *
 * Ordre voulu : le verrou sur la ligne de progression est pris AVANT de
 * vérifier la possession. Deux achats simultanés du même Collectable se
 * sérialisent donc sur ce verrou, et le second voit la ligne écrite par le
 * premier : jamais deux débits pour un seul objet.
 */
create or replace function public.purchase_cosmetic_tokens(
  p_user_id uuid,
  p_cosmetic_kind text,
  p_cosmetic_id text,
  p_label text,
  p_price_tokens integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_tokens integer;
begin
  perform public.assert_server_caller('purchase_cosmetic_tokens');

  if p_price_tokens is null or p_price_tokens < 1 then
    return jsonb_build_object('ok', false, 'error', 'Prix invalide.');
  end if;

  select pp.precon_tokens into v_tokens
  from public.player_progression pp
  where pp.user_id = p_user_id
  for update;

  if exists (
    select 1 from public.player_cosmetics
    where user_id = p_user_id and cosmetic_kind = p_cosmetic_kind and cosmetic_id = p_cosmetic_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;

  if coalesce(v_tokens, 0) < p_price_tokens then
    return jsonb_build_object('ok', false, 'error', 'insufficient_tokens', 'tokens', coalesce(v_tokens, 0));
  end if;

  update public.player_progression
    set precon_tokens = player_progression.precon_tokens - p_price_tokens, updated_at = now()
    where user_id = p_user_id
    returning precon_tokens into v_tokens;

  insert into public.player_cosmetics (user_id, cosmetic_kind, cosmetic_id, label)
  values (p_user_id, p_cosmetic_kind, p_cosmetic_id, coalesce(p_label, ''));

  return jsonb_build_object('ok', true, 'tokens', v_tokens, 'cosmetic_id', p_cosmetic_id);
end;
$$;

revoke all on function public.purchase_cosmetic_tokens(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.purchase_cosmetic_tokens(uuid, text, text, text, integer) to service_role;
