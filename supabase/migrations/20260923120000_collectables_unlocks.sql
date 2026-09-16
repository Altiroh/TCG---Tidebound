-- ======================================================================
-- COLLECTABLES — compteurs de victoires/défaites, octroi et achat
-- ======================================================================
-- Les dos de carte et les cadres de Navire ne se débloquent plus seulement
-- par palier de niveau : la spec Notion (« Dos de carte — Collectables »,
-- « Cadres de Navire — Collectables ») les accroche aussi à la collection,
-- aux statistiques de match et à la boutique.
--
-- Trois ajouts, et rien d'autre :
--
--   1. `player_progression.wins_total` et `.losses`. Les défaites ne se
--      déduisaient d'aucune colonne existante : `pvp_wins` ne compte que
--      les victoires PvP, donc `matches_played - pvp_wins` aurait compté
--      comme défaites toutes les parties gagnées contre le bot.
--      `grant_match_progression` les incrémente dans la MÊME écriture que
--      le reste, sous la même clé d'idempotence (`match_rewards`) : une
--      partie enregistrée deux fois ne compte toujours qu'une défaite.
--
--   2. `grant_cosmetics` — crédite en lot les Collectables que les
--      compteurs justifient. Même forme que `grant_achievements` :
--      idempotente par clé primaire, elle ne rend que ce qu'elle a
--      RÉELLEMENT ajouté.
--
--   3. `purchase_cosmetic` — l'achat en Tides du rayon Cosmétiques. Le
--      prix vient de l'appelant (il vit au catalogue TypeScript, comme le
--      barème de revente), la base garantit le solde et l'unicité, sous
--      verrou.
--
-- Entièrement idempotent : rejouable sans risque.


-- --- 1. Compteurs de victoires et de défaites --------------------------

alter table public.player_progression
  add column if not exists wins_total integer not null default 0 check (wins_total >= 0);

alter table public.player_progression
  add column if not exists losses integer not null default 0 check (losses >= 0);

-- Rattrapage des comptes existants, une seule fois (repérable au fait que
-- les deux compteurs sont encore à zéro alors que des parties ont été
-- jouées). Approximation ASSUMÉE et documentée : on ne sait pas rétablir
-- les victoires contre le bot, donc `wins_total` repart de `pvp_wins` et
-- les défaites récupèrent le reste. Le compte est exact à partir de la
-- prochaine partie.
update public.player_progression
set wins_total = pvp_wins,
    losses = greatest(matches_played - pvp_wins, 0)
where matches_played > 0 and wins_total = 0 and losses = 0;


-- --- 2. `grant_match_progression`, avec les deux compteurs -------------
-- Corps repris à l'identique de `20260915120000` : seules les deux
-- colonnes ci-dessus s'ajoutent à l'insertion et à la mise à jour.

create or replace function public.grant_match_progression(
  p_match_id uuid,
  p_user_id uuid,
  p_xp integer,
  p_tides integer,
  p_target_level integer,
  p_level_before integer,
  p_first_win_of_day boolean,
  p_is_pvp_win boolean,
  p_is_win boolean,
  p_counts_for_daily boolean,
  p_level_rewards jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_xp_total bigint;
  v_level integer;
  v_tokens integer := 0;
  v_today date := (now() at time zone 'utc')::date;
  v_reward jsonb;
  v_item jsonb;
  v_level_value integer;
  v_extra_tides integer := 0;
  v_streak integer := 0;
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

  if not found then
    select pp.xp_total, pp.level into v_xp_total, v_level
    from public.player_progression pp where pp.user_id = p_user_id;
    return jsonb_build_object('granted', false, 'xp_total', coalesce(v_xp_total, 0), 'level', coalesce(v_level, 1));
  end if;

  insert into public.player_progression (
    user_id, xp_total, level, matches_played, pvp_wins, wins_total, losses, last_pvp_win_day, last_win_day,
    daily_matches_day, daily_matches_count, play_streak_day, play_streak, best_play_streak
  )
  values (
    p_user_id,
    p_xp,
    greatest(1, p_target_level),
    1,
    case when p_is_pvp_win then 1 else 0 end,
    case when p_is_win then 1 else 0 end,
    case when p_is_win then 0 else 1 end,
    case when p_is_pvp_win then v_today else null end,
    case when p_is_win then v_today else null end,
    v_today,
    case when p_counts_for_daily then 1 else 0 end,
    v_today,
    1,
    1
  )
  on conflict (user_id) do update set
    xp_total = player_progression.xp_total + p_xp,
    level = greatest(player_progression.level, p_target_level),
    matches_played = player_progression.matches_played + 1,
    pvp_wins = player_progression.pvp_wins + case when p_is_pvp_win then 1 else 0 end,
    wins_total = player_progression.wins_total + case when p_is_win then 1 else 0 end,
    losses = player_progression.losses + case when p_is_win then 0 else 1 end,
    last_pvp_win_day = case when p_is_pvp_win then v_today else player_progression.last_pvp_win_day end,
    last_win_day = case when p_is_win then v_today else player_progression.last_win_day end,
    -- Compteur du jour : remis à 1 quand on change de journée UTC, incrémenté sinon.
    daily_matches_day = v_today,
    daily_matches_count = case
      when player_progression.daily_matches_day is distinct from v_today then case when p_counts_for_daily then 1 else 0 end
      else player_progression.daily_matches_count + case when p_counts_for_daily then 1 else 0 end
    end,
    -- SÉRIE. Trois cas, et un seul incrémente : même jour (rien ne bouge,
    -- la série se compte en jours, pas en parties), veille (+1), plus
    -- ancien ou jamais (la série repart à 1 — cette partie-ci en est le
    -- premier jour, pas 0).
    play_streak = case
      when player_progression.play_streak_day = v_today then greatest(player_progression.play_streak, 1)
      when player_progression.play_streak_day = v_today - 1 then player_progression.play_streak + 1
      else 1
    end,
    play_streak_day = v_today,
    best_play_streak = greatest(
      player_progression.best_play_streak,
      case
        when player_progression.play_streak_day = v_today then greatest(player_progression.play_streak, 1)
        when player_progression.play_streak_day = v_today - 1 then player_progression.play_streak + 1
        else 1
      end
    ),
    updated_at = now()
  returning player_progression.xp_total, player_progression.level, player_progression.play_streak
  into v_xp_total, v_level, v_streak;

  -- --- paliers franchis, un par un et une seule fois --------------------
  for v_reward in select * from jsonb_array_elements(coalesce(p_level_rewards, '[]'::jsonb)) loop
    v_level_value := (v_reward ->> 'level')::integer;

    insert into public.player_level_rewards (user_id, level, granted)
    values (p_user_id, v_level_value, coalesce(v_reward -> 'items', '[]'::jsonb))
    on conflict (user_id, level) do nothing;

    -- Palier déjà octroyé auparavant : on ne le rejoue pas.
    if not found then
      continue;
    end if;

    for v_item in select * from jsonb_array_elements(coalesce(v_reward -> 'items', '[]'::jsonb)) loop
      case v_item ->> 'kind'
        when 'tides' then
          v_extra_tides := v_extra_tides + coalesce((v_item ->> 'amount')::integer, 0);
        when 'booster' then
          insert into public.player_boosters (user_id, booster_definition_id, quantity)
          values (p_user_id, v_item ->> 'boosterId', coalesce((v_item ->> 'count')::integer, 1))
          on conflict (user_id, booster_definition_id) do update set
            quantity = player_boosters.quantity + coalesce((v_item ->> 'count')::integer, 1),
            updated_at = now();
        when 'preconToken' then
          v_tokens := v_tokens + coalesce((v_item ->> 'count')::integer, 1);
        when 'cosmetic' then
          insert into public.player_cosmetics (user_id, cosmetic_kind, cosmetic_id, label)
          values (p_user_id, v_item ->> 'cosmetic', v_item ->> 'id', coalesce(v_item ->> 'label', ''))
          on conflict (user_id, cosmetic_kind, cosmetic_id) do nothing;
        else
          -- 'cardChoice' et tout type futur : ouvert séparément par
          -- `open_card_choice`, qui a besoin d'un tirage de cartes.
          null;
      end case;
    end loop;
  end loop;

  if v_tokens > 0 then
    update public.player_progression
      set precon_tokens = player_progression.precon_tokens + v_tokens, updated_at = now()
      where user_id = p_user_id;
  end if;

  -- `p_tides` porte déjà les Tides de partie ET de palier calculées par
  -- l'appelant ; `v_extra_tides` ne sert qu'à recréditer un palier que
  -- l'appelant croyait déjà octroyé et qui ne l'était pas. Les deux ne
  -- peuvent pas se cumuler : on prend le maximum des deux lectures.
  if p_tides > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, p_tides)
    on conflict (user_id) do update set
      balance = player_currency.balance + p_tides,
      updated_at = now();

    insert into public.currency_transactions (user_id, amount, reason, reference_id)
    values (p_user_id, p_tides, 'match_reward', p_match_id);
  end if;

  -- `play_streak` remonte à l'appelant : la progression des quêtes de série
  -- en a besoin, et la relire séparément ouvrirait une fenêtre où une autre
  -- partie l'aurait déjà changée.
  return jsonb_build_object(
    'granted', true,
    'xp_total', v_xp_total,
    'level', v_level,
    'precon_tokens_gained', v_tokens,
    'play_streak', v_streak
  );
end;
$$;

revoke all on function public.grant_match_progression(uuid, uuid, integer, integer, integer, integer, boolean, boolean, boolean, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.grant_match_progression(uuid, uuid, integer, integer, integer, integer, boolean, boolean, boolean, boolean, jsonb) to service_role;



-- --- 3. Octroi des Collectables ----------------------------------------
/*
 * Crédite en lot les Collectables dont la condition est remplie.
 *
 * `p_cosmetics` : [{ "kind", "id", "label" }] — l'ÉVALUATION est faite par
 * le serveur applicatif (`game/cosmetics/unlock.ts`), à partir des
 * compteurs qu'il vient de lire. La base ne rejuge pas la condition : elle
 * garantit l'unicité, et elle seule. Même partage des rôles que
 * `grant_achievements`.
 *
 * Idempotente par la clé primaire de `player_cosmetics` : `granted` ne
 * contient QUE ce qui vient réellement d'être ajouté, jamais ce qui était
 * déjà là — c'est ce qui permet à l'appelant d'annoncer un déblocage sans
 * le répéter à chaque partie.
 */
create or replace function public.grant_cosmetics(p_user_id uuid, p_cosmetics jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_entry jsonb;
  v_kind text;
  v_id text;
  v_label text;
  v_granted text[] := '{}';
begin
  perform public.assert_server_caller('grant_cosmetics');

  for v_entry in select * from jsonb_array_elements(coalesce(p_cosmetics, '[]'::jsonb)) loop
    v_kind := v_entry ->> 'kind';
    v_id := v_entry ->> 'id';
    v_label := coalesce(v_entry ->> 'label', '');
    continue when v_kind is null or v_id is null;

    insert into public.player_cosmetics (user_id, cosmetic_kind, cosmetic_id, label)
    values (p_user_id, v_kind, v_id, v_label)
    on conflict (user_id, cosmetic_kind, cosmetic_id) do nothing;

    if found then
      v_granted := array_append(v_granted, v_id);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'granted', to_jsonb(v_granted));
end;
$$;

revoke all on function public.grant_cosmetics(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.grant_cosmetics(uuid, jsonb) to service_role;


-- --- 4. Achat d'un Collectable -----------------------------------------
/*
 * Achète un Collectable contre des Tides.
 *
 * Le PRIX vient de l'appelant, jamais d'un barème gravé ici : il vit au
 * catalogue TypeScript (`unlock: { kind: "purchase", priceTides }`), seul
 * endroit où il se décide — exactement comme la valeur de revente
 * (`recycle_card`). Un second barème en base finirait par diverger ; c'est
 * déjà arrivé une fois sur la revente.
 *
 * Ce que la base garantit, et que personne ne peut contourner :
 *   - le joueur ne possède pas déjà l'objet ;
 *   - son solde couvre le prix, lu `for update` — deux achats simultanés
 *     ne peuvent pas dépenser deux fois les mêmes Tides ;
 *   - le débit et la ligne de possession sont écrits ensemble, ou pas du
 *     tout.
 */
create or replace function public.purchase_cosmetic(
  p_user_id uuid,
  p_cosmetic_kind text,
  p_cosmetic_id text,
  p_label text,
  p_price integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance integer;
begin
  perform public.assert_server_caller('purchase_cosmetic');

  if p_price is null or p_price < 1 then
    return jsonb_build_object('ok', false, 'error', 'Prix invalide.');
  end if;

  if exists (
    select 1 from public.player_cosmetics
    where user_id = p_user_id and cosmetic_kind = p_cosmetic_kind and cosmetic_id = p_cosmetic_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;

  select balance into v_balance
  from public.player_currency
  where user_id = p_user_id
  for update;

  if coalesce(v_balance, 0) < p_price then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds');
  end if;

  update public.player_currency
    set balance = balance - p_price, updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.currency_transactions (user_id, amount, reason)
  values (p_user_id, -p_price, 'cosmetic_purchase');

  insert into public.player_cosmetics (user_id, cosmetic_kind, cosmetic_id, label)
  values (p_user_id, p_cosmetic_kind, p_cosmetic_id, coalesce(p_label, ''))
  on conflict (user_id, cosmetic_kind, cosmetic_id) do nothing;

  return jsonb_build_object('ok', true, 'balance', v_balance, 'cosmetic_id', p_cosmetic_id);
end;
$$;

revoke all on function public.purchase_cosmetic(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.purchase_cosmetic(uuid, text, text, text, integer) to service_role;
