-- ======================================================================
-- QUÊTE « NOUVEL ÉQUIPAGE » — débloquer un préconstruit
-- ======================================================================
-- Le 09/10/2026, l'accès libre aux préconstruits est fermé : un
-- préconstruit se débloque (deck offert à l'arrivée, ou Jeton de
-- Préconstruit) avant de se jouer, et le bouton « Essayer » disparaît. La
-- journalière « Essai en mer » (`daily_precon_trial_1`, essayer un
-- préconstruit contre le bot) n'a donc plus d'objet ; elle est remplacée
-- dans la rotation par « Nouvel équipage » (`daily_unlock_precon_1`,
-- objectif `unlock_precon_decks`). La rotation est tirée côté application
-- (`selectQuestsForPeriod`) : l'ancienne quête n'est simplement plus
-- attribuée, sa ligne reste pour l'historique.
--
-- Jusqu'ici, une quête n'avançait QU'EN FIN DE PARTIE
-- (`record_match_quest_progress`, idempotente par partie, clé étrangère vers
-- `matches`). Un déblocage n'est pas une partie : il lui faut sa propre
-- écriture.
--
--   1. `quest_event_progress` — clé d'idempotence d'un ÉVÉNEMENT hors partie
--      (`user_id + event_key`, ex. `unlock:<deck_id>`) : un même déblocage
--      ne compte qu'une fois, même si l'appel est rejoué.
--   2. `record_quest_event_progress` — crédite des objectifs cumulatifs
--      (`sum`) sur les quêtes de la période en cours, puis la méta-quête
--      « Terminer N quêtes journalières » si une journalière vient de
--      basculer. Même contrat que la partie : la réclamation reste
--      `claim_quest_reward`.
--   3. La ligne de la quête `daily_unlock_precon_1` (sinon l'attribution,
--      qui référence `quests.code`, l'ignorerait). `npm run seed:sql` la
--      produirait aussi ; elle est posée ici pour ne pas dépendre d'un seed.
--
-- La propriétaire applique les migrations À LA MAIN : tant que celle-ci ne
-- l'est pas, le déblocage fonctionne comme avant et la quête n'avance pas
-- (l'appel échoue, se journalise, et rien d'autre ne casse).
--
-- Entièrement idempotente : rejouable sans risque.


-- --- 1. Idempotence des événements -------------------------------------

create table if not exists public.quest_event_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 160),
  progress jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

alter table public.quest_event_progress enable row level security;


-- --- 2. Crédit d'un événement ---------------------------------------------
/*
 * `p_progress` : { "objective_key": montant } — seules les quêtes de nature
 * `sum` avancent (un événement n'a ni ensemble, ni record). Retour :
 * `recorded` = l'événement vient d'être compté ; `completed` = quêtes
 * terminées par lui.
 */
create or replace function public.record_quest_event_progress(
  p_user_id uuid,
  p_event_key text,
  p_period_keys text[],
  p_progress jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_completed integer := 0;
  v_daily_completed integer := 0;
begin
  perform public.assert_server_caller('record_quest_event_progress');

  if p_user_id is null or p_event_key is null or p_progress is null or jsonb_typeof(p_progress) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Événement invalide.');
  end if;

  insert into public.quest_event_progress (user_id, event_key, progress)
  values (p_user_id, p_event_key, p_progress)
  on conflict (user_id, event_key) do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'recorded', false, 'completed', 0);
  end if;

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
        and jsonb_typeof(p_progress -> q.objective_key) = 'number'
        and (p_progress ->> q.objective_key)::integer > 0
      returning pqp.completed_at, q.quest_type
  )
  select
    count(*) filter (where completed_at is not null),
    count(*) filter (where completed_at is not null and quest_type = 'daily')
  into v_completed, v_daily_completed
  from advanced;

  -- Méta-quête « Terminer N quêtes journalières » : une journalière
  -- terminée hors partie compte comme une autre.
  if v_daily_completed > 0 then
    update public.player_quest_progress pqp
      set progress_value = least(q.target_value, pqp.progress_value + v_daily_completed),
          completed_at = case when pqp.progress_value + v_daily_completed >= q.target_value then now() else null end
      from public.quests q
      where q.id = pqp.quest_id
        and pqp.user_id = p_user_id
        and pqp.period_key = any (p_period_keys)
        and pqp.completed_at is null
        and q.objective_key = 'complete_daily_quests';
  end if;

  return jsonb_build_object('ok', true, 'recorded', true, 'completed', v_completed);
end;
$$;

revoke all on function public.record_quest_event_progress(uuid, text, text[], jsonb) from public, anon, authenticated;
grant execute on function public.record_quest_event_progress(uuid, text, text[], jsonb) to service_role;


-- --- 3. La quête ------------------------------------------------------------

insert into public.quests (
  code, name, category, progress_kind, quest_type, objective_key, target_value,
  reward_currency, reward_xp, reward_booster_definition_id, bot_progress_allowed, period, is_enabled
)
values (
  'daily_unlock_precon_1', 'Nouvel équipage', 'decks', 'sum', 'daily', 'unlock_precon_decks', 1,
  30, 150, null, true, 'daily', true
)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  progress_kind = excluded.progress_kind,
  objective_key = excluded.objective_key,
  target_value = excluded.target_value,
  reward_currency = excluded.reward_currency,
  reward_xp = excluded.reward_xp,
  is_enabled = true;
