-- Correctif de sécurité — fonctions serveur de progression/boosters.
--
-- À appliquer sur une base où
-- `20260912200000_progression_and_boosters.sql` a DÉJÀ été exécutée.
--
-- Ce que ça corrige. La migration d'origine révoquait EXECUTE pour `public`
-- et `authenticated`, mais pas pour `anon` : Supabase applique
-- `alter default privileges in schema public grant all on functions to
-- anon, authenticated, service_role`, si bien que les quatre fonctions
-- restaient appelables avec la clé anon — qui est publique. N'importe qui
-- pouvait donc s'octroyer boosters, Tides et XP sur n'importe quel compte
-- en passant le `p_user_id` de son choix.
--
-- Deux corrections, volontairement redondantes :
--   1. la révocation couvre désormais `anon` ;
--   2. chaque fonction vérifie elle-même le rôle de l'appelant
--      (`assert_server_caller`), ce qui la protège même si un grant
--      réapparaissait plus tard.
--
-- Entièrement idempotent : rien que des `create or replace` et des
-- `revoke`/`grant`. Peut être relancé sans risque.


-- --- garde-fou d'appel serveur --------------------------------------------
--
-- Les quatre fonctions qui suivent créditent des cartes, des Tides ou de
-- l'XP, et prennent leur cible en PARAMÈTRE (`p_user_id`) parce qu'elles
-- sont appelées par des Server Actions, où `auth.uid()` est nul. Leur
-- sécurité repose donc entièrement sur le fait que seul le serveur puisse
-- les appeler.
--
-- Le REVOKE ne suffit pas à lui seul : Supabase installe
-- `alter default privileges in schema public grant all on functions to
-- anon, authenticated, service_role`, donc toute fonction créée dans
-- `public` reçoit automatiquement un EXECUTE pour `anon`. La clé anon
-- étant publique (elle part dans le navigateur), n'importe qui pourrait
-- alors s'octroyer boosters, Tides et XP sur n'importe quel compte. Et un
-- DROP/CREATE ultérieur ferait réapparaître ce grant.
--
-- D'où cette vérification À L'INTÉRIEUR des fonctions, indépendante de
-- l'état des privilèges.
create or replace function public.assert_server_caller(p_fn text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
begin
  -- Rôle porté par le JWT de la requête PostgREST. NULL pour une connexion
  -- SQL directe (éditeur Supabase, psql, migration) : on laisse passer, ces
  -- accès sont déjà privilégiés. `nullif` évite un cast de chaîne vide.
  v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';

  if v_role is not null and v_role <> 'service_role' then
    raise exception '%: appel réservé au serveur (rôle « % » refusé)', p_fn, v_role
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_server_caller(text) from public, anon, authenticated;
grant execute on function public.assert_server_caller(text) to service_role;


create or replace function public.grant_match_progression(
  p_match_id uuid,
  p_user_id uuid,
  p_xp integer,
  p_tides integer,
  p_target_level integer,
  p_level_before integer,
  p_first_win_of_day boolean,
  p_is_pvp_win boolean,
  p_boosters jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_booster text;
  v_xp_total bigint;
  v_level integer;
  v_inserted boolean := false;
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.assert_server_caller('grant_match_progression');

  if p_xp < 0 or p_tides < 0 then
    raise exception 'grant_match_progression: montants négatifs refusés (xp=%, tides=%)', p_xp, p_tides;
  end if;

  -- Clé d'idempotence. Si la ligne existe déjà, cette partie a déjà payé :
  -- on ressort l'état courant sans rien re-créditer.
  insert into public.match_rewards (
    match_id, user_id, xp_granted, tides_granted, level_before, level_after, first_win_of_day
  )
  values (p_match_id, p_user_id, p_xp, p_tides, p_level_before, p_target_level, p_first_win_of_day)
  on conflict (match_id, user_id) do nothing;

  v_inserted := found;

  if not v_inserted then
    select pp.xp_total, pp.level into v_xp_total, v_level
    from public.player_progression pp
    where pp.user_id = p_user_id;

    return jsonb_build_object(
      'granted', false,
      'xp_total', coalesce(v_xp_total, 0),
      'level', coalesce(v_level, 1)
    );
  end if;

  insert into public.player_progression (user_id, xp_total, level, matches_played, pvp_wins, last_pvp_win_day)
  values (
    p_user_id,
    p_xp,
    greatest(1, p_target_level),
    1,
    case when p_is_pvp_win then 1 else 0 end,
    case when p_is_pvp_win then v_today else null end
  )
  on conflict (user_id) do update set
    xp_total = player_progression.xp_total + p_xp,
    level = greatest(player_progression.level, p_target_level),
    matches_played = player_progression.matches_played + 1,
    pvp_wins = player_progression.pvp_wins + case when p_is_pvp_win then 1 else 0 end,
    last_pvp_win_day = case when p_is_pvp_win then v_today else player_progression.last_pvp_win_day end,
    updated_at = now()
  returning player_progression.xp_total, player_progression.level into v_xp_total, v_level;

  if p_tides > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, p_tides)
    on conflict (user_id) do update set
      balance = player_currency.balance + p_tides,
      updated_at = now();

    insert into public.currency_transactions (user_id, amount, reason, reference_id)
    values (p_user_id, p_tides, 'match_reward', p_match_id);
  end if;

  -- Boosters de palier. `jsonb_array_elements_text` plutôt qu'un
  -- `unnest(text[])` : l'appelant passe déjà du JSON, et les doublons
  -- doivent être conservés.
  for v_booster in select t.value from jsonb_array_elements_text(coalesce(p_boosters, '[]'::jsonb)) as t(value) loop
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, v_booster, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1,
      updated_at = now();
  end loop;

  return jsonb_build_object('granted', true, 'xp_total', v_xp_total, 'level', v_level);
end;
$$;

-- Jamais appelable depuis le navigateur : seule une Server Action avec la
-- clé service_role peut octroyer de la progression.
revoke all on function public.grant_match_progression(uuid, uuid, integer, integer, integer, integer, boolean, boolean, jsonb) from public, anon, authenticated;
-- Le revoke sur public retire aussi le droit par défaut de service_role :
-- on le redonne explicitement, sinon la Server Action ne peut plus appeler
-- sa propre fonction.
grant execute on function public.grant_match_progression(uuid, uuid, integer, integer, integer, integer, boolean, boolean, jsonb) to service_role;


create or replace function public.purchase_booster(p_user_id uuid, p_booster_id text, p_quantity integer default 1)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_price integer;
  v_purchasable boolean;
  v_enabled boolean;
  v_balance integer;
  v_cost integer;
begin
  perform public.assert_server_caller('purchase_booster');

  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantité invalide.');
  end if;

  select bd.price_currency, bd.is_purchasable, bd.is_enabled
    into v_price, v_purchasable, v_enabled
  from public.booster_definitions bd
  where bd.id = p_booster_id;

  if v_price is null or v_purchasable is not true or v_enabled is not true then
    return jsonb_build_object('ok', false, 'error', 'Ce booster n''est pas en vente.');
  end if;

  v_cost := v_price * p_quantity;

  select pc.balance into v_balance
  from public.player_currency pc
  where pc.user_id = p_user_id
  for update;

  if v_balance is null then
    insert into public.player_currency (user_id, balance) values (p_user_id, 0)
    on conflict (user_id) do nothing;
    v_balance := 0;
  end if;

  if v_balance < v_cost then
    return jsonb_build_object('ok', false, 'error', 'Solde de Tides insuffisant.', 'balance', v_balance);
  end if;

  update public.player_currency
    set balance = player_currency.balance - v_cost, updated_at = now()
    where user_id = p_user_id
    returning player_currency.balance into v_balance;

  insert into public.currency_transactions (user_id, amount, reason)
  values (p_user_id, -v_cost, 'booster_purchase');

  insert into public.player_boosters (user_id, booster_definition_id, quantity)
  values (p_user_id, p_booster_id, p_quantity)
  on conflict (user_id, booster_definition_id) do update set
    quantity = player_boosters.quantity + p_quantity,
    updated_at = now();

  return jsonb_build_object('ok', true, 'balance', v_balance, 'spent', v_cost);
end;
$$;

revoke all on function public.purchase_booster(uuid, text, integer) from public, anon, authenticated;
-- Le revoke sur public retire aussi le droit par défaut de service_role :
-- on le redonne explicitement, sinon la Server Action ne peut plus appeler
-- sa propre fonction.
grant execute on function public.purchase_booster(uuid, text, integer) to service_role;


create or replace function public.open_booster(p_user_id uuid, p_booster_id text, p_card_ids text[])
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
begin
  perform public.assert_server_caller('open_booster');

  v_count := coalesce(array_length(p_card_ids, 1), 0);
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'Aucune carte à créditer.');
  end if;

  select bd.card_count into v_expected from public.booster_definitions bd where bd.id = p_booster_id;
  if v_expected is null then
    return jsonb_build_object('ok', false, 'error', 'Booster inconnu.');
  end if;

  -- Un décalage de format signale un pool incomplet côté tirage, pas une
  -- ouverture légitime : mieux vaut refuser que consommer le booster du
  -- joueur pour lui créditer un paquet tronqué.
  if v_count <> v_expected then
    return jsonb_build_object(
      'ok', false,
      'error', format('Tirage incomplet : %s carte(s) pour un booster de %s.', v_count, v_expected)
    );
  end if;

  -- Comparaison sur les ids DISTINCTS : un doublon légitime dans le booster
  -- ne doit pas faire échouer la validation.
  select count(*) into v_distinct_input from (select distinct t.card_id from unnest(p_card_ids) as t(card_id)) s;
  select count(*) into v_distinct_known
  from public.cards c
  where c.id in (select distinct t.card_id from unnest(p_card_ids) as t(card_id));

  if v_distinct_known <> v_distinct_input then
    return jsonb_build_object('ok', false, 'error', 'Carte inconnue dans le tirage.');
  end if;

  -- Consommation du booster, sérialisée : deux ouvertures simultanées ne
  -- peuvent pas consommer le même exemplaire.
  select pb.quantity into v_quantity
  from public.player_boosters pb
  where pb.user_id = p_user_id and pb.booster_definition_id = p_booster_id
  for update;

  if v_quantity is null or v_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Tu ne possèdes pas ce booster.');
  end if;

  update public.player_boosters
    set quantity = player_boosters.quantity - 1, updated_at = now()
    where user_id = p_user_id and booster_definition_id = p_booster_id;

  insert into public.booster_openings (user_id, booster_definition_id)
  values (p_user_id, p_booster_id)
  returning booster_openings.id into v_opening_id;

  insert into public.booster_opening_cards (booster_opening_id, slot_index, card_id)
  select v_opening_id, t.idx::smallint, t.card_id
  from unnest(p_card_ids) with ordinality as t(card_id, idx);

  -- Collection : un doublon dans le même booster doit ajouter 2, d'où
  -- l'agrégation avant l'upsert.
  insert into public.player_cards (user_id, card_id, quantity)
  select p_user_id, t.card_id, count(*)::integer
  from unnest(p_card_ids) as t(card_id)
  group by t.card_id
  on conflict (user_id, card_id) do update set
    quantity = player_cards.quantity + excluded.quantity,
    updated_at = now();

  -- Pity : recalculé depuis `cards`, jamais depuis l'appelant.
  select exists (
    select 1 from public.cards c where c.id = any (p_card_ids) and c.rarity = 'abyssal'
  ) into v_abyssal;

  insert into public.player_pity (user_id, booster_definition_id, packs_since_abyssal)
  values (p_user_id, p_booster_id, case when v_abyssal then 0 else 1 end)
  on conflict (user_id, booster_definition_id) do update set
    packs_since_abyssal = case when v_abyssal then 0 else player_pity.packs_since_abyssal + 1 end,
    updated_at = now()
  returning player_pity.packs_since_abyssal into v_packs;

  return jsonb_build_object(
    'ok', true,
    'opening_id', v_opening_id,
    'abyssal_pulled', v_abyssal,
    'packs_since_abyssal', v_packs
  );
end;
$$;

revoke all on function public.open_booster(uuid, text, text[]) from public, anon, authenticated;
-- Le revoke sur public retire aussi le droit par défaut de service_role :
-- on le redonne explicitement, sinon la Server Action ne peut plus appeler
-- sa propre fonction.
grant execute on function public.open_booster(uuid, text, text[]) to service_role;


create or replace function public.recycle_card(p_user_id uuid, p_card_id text, p_quantity integer default 1)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_owned integer;
  v_rarity public.card_rarity;
  v_unit integer;
  v_total integer;
  v_balance integer;
begin
  perform public.assert_server_caller('recycle_card');

  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantité invalide.');
  end if;

  select c.rarity into v_rarity from public.cards c where c.id = p_card_id;
  if v_rarity is null then
    return jsonb_build_object('ok', false, 'error', 'Carte inconnue.');
  end if;

  select pc.quantity into v_owned
  from public.player_cards pc
  where pc.user_id = p_user_id and pc.card_id = p_card_id
  for update;

  if v_owned is null or v_owned < p_quantity then
    return jsonb_build_object('ok', false, 'error', 'Tu ne possèdes pas assez d''exemplaires.');
  end if;

  v_unit := case v_rarity
    when 'common' then 5
    when 'uncommon' then 15
    when 'rare' then 45
    when 'abyssal' then 120
  end;
  v_total := v_unit * p_quantity;

  update public.player_cards
    set quantity = player_cards.quantity - p_quantity, updated_at = now()
    where user_id = p_user_id and card_id = p_card_id;

  insert into public.player_currency (user_id, balance)
  values (p_user_id, v_total)
  on conflict (user_id) do update set
    balance = player_currency.balance + v_total,
    updated_at = now()
  returning player_currency.balance into v_balance;

  insert into public.currency_transactions (user_id, amount, reason)
  values (p_user_id, v_total, 'card_recycle');

  return jsonb_build_object('ok', true, 'tides_gained', v_total, 'balance', v_balance);
end;
$$;

revoke all on function public.recycle_card(uuid, text, integer) from public, anon, authenticated;
-- Le revoke sur public retire aussi le droit par défaut de service_role :
-- on le redonne explicitement, sinon la Server Action ne peut plus appeler
-- sa propre fonction.
grant execute on function public.recycle_card(uuid, text, integer) to service_role;
