-- Récapitulatif de quêtes en fin de partie.
--
-- `record_match_quest_progress` savait COMBIEN de quêtes avaient basculé,
-- pas LESQUELLES ni de combien. L'écran de fin de partie ne pouvait donc
-- rien montrer : ni la jauge qui se remplit, ni même le fait qu'une quête a
-- avancé sans se terminer.
--
-- Le relevé est calculé par DIFFÉRENCE avec un instantané pris au début de
-- la fonction, plutôt qu'en collectant les valeurs passe par passe. Deux
-- raisons : `UPDATE ... RETURNING` ne donne pas l'ancienne valeur avant
-- PostgreSQL 18, et la méta-quête « terminer N journalières » avance dans
-- une quatrième passe — une collecte par passe l'aurait oubliée.
--
-- Il est ensuite PERSISTÉ sur la ligne de `match_quest_progress`, déjà
-- écrite pour l'idempotence. L'écran de fin peut donc le relire après un
-- rafraîchissement, et la même partie ne produit jamais deux relevés
-- différents.
--
-- Idempotent : rejouable sans risque.

alter table public.match_quest_progress
  add column if not exists quest_recap jsonb not null default '[]'::jsonb;

create or replace function public.record_match_quest_progress(
  p_match_id uuid,
  p_user_id uuid,
  p_vs_bot boolean,
  p_period_keys text[],
  p_progress jsonb,
  p_sets jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_completed integer := 0;
  v_set_completed integer := 0;
  v_max_completed integer := 0;
  v_meta_completed integer := 0;
  -- Journalières qui viennent de basculer : c'est ce que compte la
  -- méta-quête « Terminer N quêtes journalières ».
  v_daily_completed integer := 0;
  v_daily_from_sets integer := 0;
  v_daily_from_max integer := 0;
  -- Progression de chaque quête AVANT cette partie, indexée par
  -- « quest_id|period_key ».
  v_before jsonb;
  v_recap jsonb;
begin
  perform public.assert_server_caller('record_match_quest_progress');

  insert into public.match_quest_progress (match_id, user_id, progress)
  values (p_match_id, p_user_id, coalesce(p_progress, '{}'::jsonb))
  on conflict (match_id, user_id) do nothing;

  if not found then
    -- Partie déjà comptabilisée : on ressort le relevé DÉJÀ établi, pour
    -- qu'un rafraîchissement de l'écran de fin montre la même chose.
    select mqp.quest_recap into v_recap
    from public.match_quest_progress mqp
    where mqp.match_id = p_match_id and mqp.user_id = p_user_id;

    return jsonb_build_object('ok', true, 'recorded', false, 'completed', 0, 'recap', coalesce(v_recap, '[]'::jsonb));
  end if;

  select coalesce(jsonb_object_agg(pqp.quest_id::text || '|' || pqp.period_key, pqp.progress_value), '{}'::jsonb)
  into v_before
  from public.player_quest_progress pqp
  where pqp.user_id = p_user_id and pqp.period_key = any (p_period_keys);

  -- --- objectifs cumulatifs --------------------------------------------
  with advanced as (
    update public.player_quest_progress pqp
      set progress_value = least(q.target_value, pqp.progress_value + (p_progress ->> q.objective_key)::integer),
          completed_at = case
            when pqp.progress_value + (p_progress ->> q.objective_key)::integer >= q.target_value then now()
            else null
          end
      from public.quests q
      where q.id = pqp.quest_id
        and pqp.user_id = p_user_id
        and pqp.period_key = any (p_period_keys)
        and pqp.completed_at is null
        and coalesce(q.progress_kind, 'sum') = 'sum'
        and p_progress ? q.objective_key
        and (p_progress ->> q.objective_key)::integer > 0
        and (not p_vs_bot or q.bot_progress_allowed)
      returning pqp.completed_at, q.quest_type
  )
  select
    count(*) filter (where completed_at is not null),
    count(*) filter (where completed_at is not null and quest_type = 'daily')
  into v_completed, v_daily_completed
  from advanced;

  -- --- objectifs d'ensemble ---------------------------------------------
  -- Union de l'ensemble mémorisé et des valeurs apportées par la partie,
  -- puis recomptage : une valeur déjà vue ne fait donc jamais avancer.
  with merged as (
    select
      pqp.quest_id,
      pqp.period_key,
      q.target_value,
      q.quest_type,
      (
        select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
        from (
          select jsonb_array_elements_text(pqp.progress_meta) as value
          union
          select jsonb_array_elements_text(p_sets -> q.objective_key) as value
        ) as combined
      ) as next_meta
    from public.player_quest_progress pqp
    join public.quests q on q.id = pqp.quest_id
    where pqp.user_id = p_user_id
      and pqp.period_key = any (p_period_keys)
      and pqp.completed_at is null
      and q.progress_kind = 'set'
      and p_sets ? q.objective_key
      and (not p_vs_bot or q.bot_progress_allowed)
  ),
  advanced_sets as (
    update public.player_quest_progress pqp
      set progress_meta = m.next_meta,
          progress_value = least(m.target_value, jsonb_array_length(m.next_meta)),
          completed_at = case when jsonb_array_length(m.next_meta) >= m.target_value then now() else null end
      from merged m
      where pqp.user_id = p_user_id and pqp.quest_id = m.quest_id and pqp.period_key = m.period_key
      returning pqp.completed_at, m.quest_type
  )
  select
    count(*) filter (where completed_at is not null),
    count(*) filter (where completed_at is not null and quest_type = 'daily')
  into v_set_completed, v_daily_from_sets
  from advanced_sets;

  -- --- objectifs de MAXIMUM ---------------------------------------------
  -- La valeur reçue est un ÉTAT du compte (une série de jours), pas un
  -- incrément : on garde la plus grande vue pendant la période.
  with advanced_max as (
    update public.player_quest_progress pqp
      set progress_value = least(q.target_value, greatest(pqp.progress_value, (p_progress ->> q.objective_key)::integer)),
          completed_at = case
            when greatest(pqp.progress_value, (p_progress ->> q.objective_key)::integer) >= q.target_value then now()
            else null
          end
      from public.quests q
      where q.id = pqp.quest_id
        and pqp.user_id = p_user_id
        and pqp.period_key = any (p_period_keys)
        and pqp.completed_at is null
        and q.progress_kind = 'max'
        and p_progress ? q.objective_key
        and (p_progress ->> q.objective_key)::integer > 0
        and (not p_vs_bot or q.bot_progress_allowed)
      returning pqp.completed_at, q.quest_type
  )
  select
    count(*) filter (where completed_at is not null),
    count(*) filter (where completed_at is not null and quest_type = 'daily')
  into v_max_completed, v_daily_from_max
  from advanced_max;

  v_daily_completed := v_daily_completed + v_daily_from_sets + v_daily_from_max;

  -- --- méta-quête : « Terminer N quêtes journalières » -------------------
  -- Elle se nourrit des passes ci-dessus, et doit donc venir APRÈS elles.
  if v_daily_completed > 0 then
    with advanced_meta as (
      update public.player_quest_progress pqp
        set progress_value = least(q.target_value, pqp.progress_value + v_daily_completed),
            completed_at = case when pqp.progress_value + v_daily_completed >= q.target_value then now() else null end
        from public.quests q
        where q.id = pqp.quest_id
          and pqp.user_id = p_user_id
          and pqp.period_key = any (p_period_keys)
          and pqp.completed_at is null
          and q.objective_key = 'complete_daily_quests'
          and (not p_vs_bot or q.bot_progress_allowed)
        returning pqp.completed_at
    )
    select count(*) filter (where completed_at is not null) into v_meta_completed from advanced_meta;
  end if;

  -- --- relevé : ce qui a bougé, et de combien ---------------------------
  -- Comparaison avec l'instantané de départ : toute quête dont la valeur a
  -- changé y figure, TERMINÉE OU NON. Voir une jauge avancer sans se
  -- remplir fait partie de ce qu'on veut montrer.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', q.code,
        'name', coalesce(q.name, q.code),
        'category', q.category,
        'quest_type', q.quest_type,
        'before', coalesce((v_before ->> (pqp.quest_id::text || '|' || pqp.period_key))::integer, 0),
        'after', pqp.progress_value,
        'target', q.target_value,
        'completed', pqp.completed_at is not null,
        'reward_tides', q.reward_currency,
        'reward_xp', coalesce(q.reward_xp, 0),
        'reward_booster_id', q.reward_booster_definition_id
      )
      -- Les quêtes qui viennent de se terminer d'abord : c'est ce que le
      -- joueur attend de voir en premier.
      order by (pqp.completed_at is not null) desc, q.quest_type, q.code
    ),
    '[]'::jsonb
  )
  into v_recap
  from public.player_quest_progress pqp
  join public.quests q on q.id = pqp.quest_id
  where pqp.user_id = p_user_id
    and pqp.period_key = any (p_period_keys)
    and coalesce((v_before ->> (pqp.quest_id::text || '|' || pqp.period_key))::integer, 0) is distinct from pqp.progress_value;

  update public.match_quest_progress
  set quest_recap = v_recap
  where match_id = p_match_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'recorded', true,
    'completed', v_completed + v_set_completed + v_max_completed + v_meta_completed,
    'dailies_completed', v_daily_completed,
    'recap', v_recap
  );
end;
$$;

revoke all on function public.record_match_quest_progress(uuid, uuid, boolean, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_match_quest_progress(uuid, uuid, boolean, text[], jsonb, jsonb) to service_role;
