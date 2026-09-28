-- Audit de sécurité du 28/09/2026 — correctifs côté base.
--
-- Six failles, toutes exploitables avec la seule clé anon et une session :
--
--   1. MATCHMAKING. `claim_matchmaking_opponent()` était ouverte au rôle
--      `authenticated` : appelée en boucle, elle vidait la file (personne
--      n'était plus jamais apparié) et révélait l'identifiant et le deck de
--      chaque joueur en attente. La policy `for all` sur la file laissait en
--      plus le navigateur y écrire une fausse entrée (deck inexistant,
--      `queued_at` en 1970) qui éjectait chaque arrivant. La file n'est plus
--      écrite que par le serveur, et l'appariement exige que l'appelant y soit.
--
--   2. GARANTIE ABYSSALE. Le tirage est calculé en TypeScript à partir du
--      compteur `player_pity` lu SANS verrou : N ouvertures lancées en
--      parallèle juste avant le seuil touchaient chacune l'Abyssale garantie.
--      `open_booster` compare désormais, sous verrou, les compteurs sur
--      lesquels le tirage a été calculé avec ceux de la base, et refuse le
--      tirage s'ils ont bougé (comparer-puis-écrire). Le compteur de
--      nouveauté est écrit dans la même transaction, plus par un upsert à part.
--
--   3. MAÎTRISE DES NAVIRES. L'XP de maîtrise était rattachée au navire
--      ACTUEL du deck joué : changer le navire d'un deck après coup
--      reversait tout son historique au nouveau navire, réclamable à nouveau.
--      Le navire joué est désormais figé dans `matches` au démarrage de la
--      partie (lu dans l'état initial, qui fait autorité).
--
--   4. PROFILS. La policy UPDATE contournait `set_profile_identity` (pseudo
--      de n'importe quelle longueur, avatar d'une carte non possédée) ; la
--      lecture était ouverte à tous les comptes, et le pseudo par défaut
--      était la partie locale de l'e-mail. Désormais : aucune écriture
--      navigateur, lecture limitée à soi et à ses adversaires, pseudo borné
--      en base, pseudo par défaut neutre.
--
--   5. SUPPRESSION DE COMPTE. Elle effaçait les parties partagées, donc en
--      cascade l'historique, les récompenses et la progression de quêtes de
--      l'ADVERSAIRE. Les parties sont désormais anonymisées (`on delete set
--      null`) plutôt que supprimées.
--
-- Entièrement idempotente : rejouable sans risque.


-- ======================================================================
-- 1. MATCHMAKING
-- ======================================================================

drop policy if exists "a user can manage their own matchmaking queue entry" on public.matchmaking_queue;
drop policy if exists "a user can read their own matchmaking queue entry" on public.matchmaking_queue;
create policy "a user can read their own matchmaking queue entry"
  on public.matchmaking_queue for select
  to authenticated
  using (user_id = (select auth.uid()));

drop function if exists public.claim_matchmaking_opponent();

-- Désigne et retire de la file l'adversaire qui attend depuis le plus
-- longtemps. Réservée au serveur (`assert_server_caller`), qui passe
-- l'identité tirée de la session. L'appelant doit lui-même être en file :
-- on ne consomme pas l'entrée de quelqu'un sans s'engager à jouer contre lui.
create or replace function public.claim_matchmaking_opponent(p_user_id uuid)
returns table (opponent_user_id uuid, opponent_deck_id text)
language plpgsql
security definer set search_path = public
as $$
declare
  found record;
begin
  perform public.assert_server_caller('claim_matchmaking_opponent');

  if not exists (select 1 from public.matchmaking_queue q where q.user_id = p_user_id) then
    return;
  end if;

  -- Boucle d'une ligne plutôt que `select … into` : l'éditeur SQL de
  -- Supabase prend un `select … into` pour une création de table et coupe
  -- le corps de la fonction (vécu le 28/09/2026).
  for found in
    select q.user_id, q.deck_id
    from public.matchmaking_queue q
    where q.user_id <> p_user_id
    order by q.queued_at asc
    for update skip locked
    limit 1
  loop
    delete from public.matchmaking_queue where user_id = found.user_id;
    return query select found.user_id, found.deck_id;
    return;
  end loop;
end;
$$;

revoke all on function public.claim_matchmaking_opponent(uuid) from public, anon, authenticated;
grant execute on function public.claim_matchmaking_opponent(uuid) to service_role;


-- ======================================================================
-- 2. OUVERTURE DE BOOSTER : compteurs de garantie comparés sous verrou
-- ======================================================================

-- Déjà ajoutée par `20260925120000_new_card_pity.sql` ; répétée pour que
-- cette migration ne dépende pas de son passage.
alter table public.player_pity
  add column if not exists packs_since_new_card integer not null default 0;

drop function if exists public.open_booster(uuid, text, text[]);

-- `p_expected_*` : compteurs sur lesquels le tirage a été CALCULÉ. S'ils ne
-- sont plus ceux de la base, une autre ouverture est passée entre-temps :
-- le tirage est périmé et refusé, sans rien consommer.
-- `p_next_packs_since_new_card` : valeur du compteur « sans nouveauté »
-- après ce tirage (le tirage sait s'il a donné une carte absente de la
-- collection, la base non).
create or replace function public.open_booster(
  p_user_id uuid,
  p_booster_id text,
  p_card_ids text[],
  p_expected_packs_since_abyssal integer,
  p_expected_packs_since_new_card integer,
  p_next_packs_since_new_card integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
  v_expected integer;
  v_distinct_input integer;
  v_distinct_known integer;
  v_quantity integer;
  v_opening_id uuid;
  v_abyssal boolean;
  v_packs integer;
  v_since_abyssal integer;
  v_since_new integer;
begin
  perform public.assert_server_caller('open_booster');

  v_count := coalesce(array_length(p_card_ids, 1), 0);
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'Aucune carte à créditer.');
  end if;

  -- Affectations plutôt que `select … into` : l'éditeur SQL de Supabase
  -- prend un `select … into` pour une création de table et coupe le corps
  -- de la fonction (vécu le 28/09/2026).
  v_expected := (select bd.card_count from public.booster_definitions bd where bd.id = p_booster_id);
  if v_expected is null then
    return jsonb_build_object('ok', false, 'error', 'Booster inconnu.');
  end if;

  if v_count <> v_expected then
    return jsonb_build_object(
      'ok', false,
      'error', format('Tirage incomplet : %s carte(s) pour un booster de %s.', v_count, v_expected)
    );
  end if;

  v_distinct_input := (select count(*) from (select distinct t.card_id from unnest(p_card_ids) as t(card_id)) s);
  v_distinct_known := (
    select count(*)
    from public.cards c
    where c.id in (select distinct t.card_id from unnest(p_card_ids) as t(card_id))
  );

  if v_distinct_known <> v_distinct_input then
    return jsonb_build_object('ok', false, 'error', 'Carte inconnue dans le tirage.');
  end if;

  if p_next_packs_since_new_card is null or p_next_packs_since_new_card < 0 then
    return jsonb_build_object('ok', false, 'error', 'Compteur de nouveauté invalide.');
  end if;

  -- Consommation du booster, sérialisée : deux ouvertures simultanées ne
  -- peuvent pas consommer le même exemplaire. Ce verrou est pris EN
  -- PREMIER, toujours dans le même ordre (stock puis compteurs).
  perform 1
  from public.player_boosters pb
  where pb.user_id = p_user_id and pb.booster_definition_id = p_booster_id
  for update;
  v_quantity := (
    select pb.quantity from public.player_boosters pb
    where pb.user_id = p_user_id and pb.booster_definition_id = p_booster_id
  );

  if v_quantity is null or v_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Tu ne possèdes pas ce booster.');
  end if;

  -- Compteurs de garantie, sous verrou. Une ligne absente vaut 0 : on la
  -- crée pour pouvoir la verrouiller.
  insert into public.player_pity (user_id, booster_definition_id, packs_since_abyssal, packs_since_new_card)
  values (p_user_id, p_booster_id, 0, 0)
  on conflict (user_id, booster_definition_id) do nothing;

  perform 1
  from public.player_pity pp
  where pp.user_id = p_user_id and pp.booster_definition_id = p_booster_id
  for update;
  v_since_abyssal := (
    select pp.packs_since_abyssal from public.player_pity pp
    where pp.user_id = p_user_id and pp.booster_definition_id = p_booster_id
  );
  v_since_new := (
    select pp.packs_since_new_card from public.player_pity pp
    where pp.user_id = p_user_id and pp.booster_definition_id = p_booster_id
  );

  if v_since_abyssal is distinct from p_expected_packs_since_abyssal
     or v_since_new is distinct from p_expected_packs_since_new_card then
    return jsonb_build_object('ok', false, 'error', 'pity_conflict');
  end if;

  update public.player_boosters
    set quantity = player_boosters.quantity - 1, updated_at = now()
    where user_id = p_user_id and booster_definition_id = p_booster_id;

  v_opening_id := gen_random_uuid();
  insert into public.booster_openings (id, user_id, booster_definition_id)
  values (v_opening_id, p_user_id, p_booster_id);

  insert into public.booster_opening_cards (booster_opening_id, slot_index, card_id)
  select v_opening_id, t.idx::smallint, t.card_id
  from unnest(p_card_ids) with ordinality as t(card_id, idx);

  insert into public.player_cards (user_id, card_id, quantity)
  select p_user_id, t.card_id, count(*)::integer
  from unnest(p_card_ids) as t(card_id)
  group by t.card_id
  on conflict (user_id, card_id) do update set
    quantity = player_cards.quantity + excluded.quantity,
    updated_at = now();

  -- Pity Abyssal : recalculé depuis `cards`, jamais depuis l'appelant.
  v_abyssal := exists (
    select 1 from public.cards c where c.id = any (p_card_ids) and c.rarity = 'abyssal'
  );

  update public.player_pity
    set packs_since_abyssal = case when v_abyssal then 0 else player_pity.packs_since_abyssal + 1 end,
        packs_since_new_card = p_next_packs_since_new_card,
        updated_at = now()
    where user_id = p_user_id and booster_definition_id = p_booster_id;
  v_packs := (
    select pp.packs_since_abyssal from public.player_pity pp
    where pp.user_id = p_user_id and pp.booster_definition_id = p_booster_id
  );

  return jsonb_build_object(
    'ok', true,
    'opening_id', v_opening_id,
    'abyssal_pulled', v_abyssal,
    'packs_since_abyssal', v_packs
  );
end;
$$;

revoke all on function public.open_booster(uuid, text, text[], integer, integer, integer) from public, anon, authenticated;
grant execute on function public.open_booster(uuid, text, text[], integer, integer, integer) to service_role;


-- ======================================================================
-- 3. NAVIRE JOUÉ, FIGÉ DANS LA PARTIE
-- ======================================================================

alter table public.matches
  add column if not exists player1_ship_id text,
  add column if not exists player2_ship_id text;

-- Le navire vient de l'état INITIAL (`PlayerState.shipId`), écrit par le
-- serveur au démarrage : ni le deck modifié plus tard, ni le navigateur n'y
-- touchent. Déclenché à la création de l'état privé, qui accompagne
-- toujours le passage d'une partie en `active` (`create_active_match`,
-- `activate_waiting_match`).
create or replace function public.freeze_match_ships()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.matches m
    set player1_ship_id = coalesce(m.player1_ship_id, (
          select p ->> 'shipId' from jsonb_array_elements(new.state -> 'players') p
          where p ->> 'id' = m.player1_id::text limit 1)),
        player2_ship_id = coalesce(m.player2_ship_id, (
          select p ->> 'shipId' from jsonb_array_elements(new.state -> 'players') p
          where p ->> 'id' = m.player2_id::text limit 1))
    where m.id = new.match_id;
  return new;
end;
$$;

revoke all on function public.freeze_match_ships() from public, anon, authenticated;

drop trigger if exists freeze_match_ships on public.match_states;
create trigger freeze_match_ships
  after insert on public.match_states
  for each row execute function public.freeze_match_ships();

-- Parties existantes : l'état privé porte encore les navires d'origine.
update public.matches m
  set player1_ship_id = coalesce(m.player1_ship_id, (
        select p ->> 'shipId' from jsonb_array_elements(s.state -> 'players') p
        where p ->> 'id' = m.player1_id::text limit 1)),
      player2_ship_id = coalesce(m.player2_ship_id, (
        select p ->> 'shipId' from jsonb_array_elements(s.state -> 'players') p
        where p ->> 'id' = m.player2_id::text limit 1))
  from public.match_states s
  where s.match_id = m.id
    and (m.player1_ship_id is null or m.player2_ship_id is null);


-- ======================================================================
-- 4. PROFILS
-- ======================================================================

-- Écriture : uniquement par `set_profile_identity` (clé service_role).
drop policy if exists "a user can update their own profile" on public.profiles;

-- Lecture : son propre profil, et celui des joueurs contre qui on a joué
-- (pseudo affiché à la table). Plus d'annuaire de tous les comptes.
drop policy if exists "profiles are readable by any authenticated user" on public.profiles;
drop policy if exists "a user can read their own profile and their opponents" on public.profiles;
create policy "a user can read their own profile and their opponents"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.matches m
      where (m.player1_id = (select auth.uid()) and m.player2_id = profiles.id)
         or (m.player2_id = (select auth.uid()) and m.player1_id = profiles.id)
    )
  );

-- Pseudo par défaut, neutre : jamais dérivé de l'e-mail.
create or replace function public.default_display_name(p_user_id uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select 'Marin-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6));
$$;

-- Comptes existants : un pseudo égal à la partie locale de l'e-mail
-- l'exposait à tous les adversaires ; un pseudo hors bornes n'aurait jamais
-- passé `set_profile_identity`. Les deux repartent du pseudo neutre, que le
-- joueur peut changer depuis son profil.
update public.profiles p
  set display_name = public.default_display_name(p.id)
  from auth.users u
  where u.id = p.id
    and lower(p.display_name) = lower(split_part(u.email, '@', 1));

update public.profiles p
  set display_name = public.default_display_name(p.id)
  where p.display_name is null
     or char_length(btrim(p.display_name)) < 2
     or char_length(btrim(p.display_name)) > 24;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (char_length(btrim(display_name)) between 2 and 24);

-- Nouveau compte : même bornes que `set_profile_identity`, et pseudo neutre
-- à défaut. Le reste est inchangé (`20260915120000_player_progression_meta.sql`).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(v_name) < 2 or char_length(v_name) > 24 then
    v_name := public.default_display_name(new.id);
  end if;

  insert into public.profiles (id, display_name) values (new.id, v_name);

  insert into public.player_currency (user_id, balance) values (new.id, 150);
  insert into public.currency_transactions (user_id, amount, reason) values (new.id, 150, 'starter_grant');
  insert into public.player_onboarding (user_id, starter_currency_granted, starter_standard_booster_claimed)
    values (new.id, true, false);
  insert into public.player_progression (user_id) values (new.id);
  insert into public.player_login_rewards (user_id) values (new.id);

  return new;
end;
$$;


-- ======================================================================
-- 5. SUPPRESSION DE COMPTE : les parties partagées sont anonymisées
-- ======================================================================

alter table public.matches alter column player1_id drop not null;

-- Toute clé étrangère existante de ces colonnes vers `profiles` part, quel
-- que soit son nom : une seule oubliée suffirait à bloquer la suppression.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.matches'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and a.attname in ('player1_id', 'player2_id', 'winner_id')
  loop
    execute format('alter table public.matches drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.matches
  add constraint matches_player1_id_fkey foreign key (player1_id) references public.profiles (id) on delete set null,
  add constraint matches_player2_id_fkey foreign key (player2_id) references public.profiles (id) on delete set null,
  add constraint matches_winner_id_fkey foreign key (winner_id) references public.profiles (id) on delete set null;

-- Fonction utilitaire, appelée par `handle_new_user` (propriétaire) : pas
-- d'appel direct par l'API.
revoke all on function public.default_display_name(uuid) from public, anon, authenticated;
