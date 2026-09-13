-- Quêtes quotidiennes et hebdomadaires.
--
-- Cadrage : Notion "Boosters & économie de collection" (3 quotidiennes,
-- 2-3 hebdomadaires, `bot_progress_allowed`, validation et récompense
-- entièrement côté serveur). Le catalogue et le calibrage vivent en
-- TypeScript (`game/quests/catalog.ts`, testé) ; `quests` en est le miroir,
-- synchronisé par `npm run seed:cards` sur la clé `code`, comme `cards`.
--
-- Même principe que le reste de l'économie : aucune policy d'écriture pour
-- `authenticated`. L'attribution, la progression et la réclamation passent
-- par les trois fonctions ci-dessous, appelables par le seul serveur.

-- --- catalogue ----------------------------------------------------------------

alter table public.quests
  add column code text,
  add constraint quests_code_key unique (code);

-- --- quêtes attribuées : une ligne par joueur, quête et période --------------
--
-- Le schéma d'origine (`user_id, quest_id` en clé) ne permettait qu'une
-- seule occurrence d'une quête par joueur, pour toujours. Une quête
-- quotidienne revient pourtant d'un jour à l'autre : la période fait partie
-- de la clé. `period_key` vaut `d:AAAA-MM-JJ` ou `w:<lundi>` (UTC), cf.
-- `game/quests/rotation.ts`.

alter table public.player_quest_progress
  add column period_key text not null default 'legacy',
  add column assigned_at timestamptz not null default now();

alter table public.player_quest_progress drop constraint player_quest_progress_pkey;
alter table public.player_quest_progress add primary key (user_id, quest_id, period_key);
alter table public.player_quest_progress alter column period_key drop default;

create index player_quest_progress_user_period_idx on public.player_quest_progress (user_id, period_key);

-- --- idempotence de la progression par partie -------------------------------
--
-- Même rôle que `match_rewards` pour l'XP : une partie ne fait progresser
-- les quêtes d'un joueur qu'UNE fois, quelle que soit la façon dont sa fin
-- est observée (double soumission, reprise réseau).

create table public.match_quest_progress (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  progress jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.match_quest_progress enable row level security;

create policy "a user can read their own match quest progress"
  on public.match_quest_progress for select
  to authenticated
  using (user_id = auth.uid());

-- --- attribution ----------------------------------------------------------------
--
-- Le TIRAGE est fait en TypeScript (`selectQuestsForPeriod`, déterministe :
-- même joueur + même période = mêmes quêtes). Cette fonction n'écrit que si
-- le joueur n'a encore AUCUNE quête de ce type pour cette période : modifier
-- le catalogue en cours de journée n'ajoute donc jamais de quêtes à une
-- période déjà attribuée. Deux attributions concurrentes écrivent les mêmes
-- lignes ; la clé primaire rend la seconde sans effet.

create or replace function public.assign_player_quests(
  p_user_id uuid,
  p_quest_type text,
  p_period_key text,
  p_quest_codes text[]
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_inserted integer;
begin
  perform public.assert_server_caller('assign_player_quests');

  if exists (
    select 1
    from public.player_quest_progress pqp
    join public.quests q on q.id = pqp.quest_id
    where pqp.user_id = p_user_id and pqp.period_key = p_period_key and q.quest_type = p_quest_type
  ) then
    return jsonb_build_object('ok', true, 'assigned', 0);
  end if;

  insert into public.player_quest_progress (user_id, quest_id, period_key)
  select p_user_id, q.id, p_period_key
  from public.quests q
  where q.code = any (p_quest_codes) and q.quest_type = p_quest_type and q.is_enabled
  on conflict (user_id, quest_id, period_key) do nothing;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object('ok', true, 'assigned', v_inserted);
end;
$$;

revoke all on function public.assign_player_quests(uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.assign_player_quests(uuid, text, text, text[]) to service_role;

-- --- progression d'une partie terminée ------------------------------------------
--
-- `p_progress` : `{ objective_key: montant }`, calculé depuis le journal
-- d'événements de l'état final par `computeMatchQuestProgress`. Le filtrage
-- `bot_progress_allowed` est fait ICI, par quête : c'est la base qui connaît
-- la règle de chaque quête, pas l'appelant.
--
-- Seules les quêtes des périodes passées dans `p_period_keys` (période
-- courante au moment où la partie se termine) avancent, et jamais au-delà
-- de leur cible.

create or replace function public.record_match_quest_progress(
  p_match_id uuid,
  p_user_id uuid,
  p_vs_bot boolean,
  p_period_keys text[],
  p_progress jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_completed integer;
begin
  perform public.assert_server_caller('record_match_quest_progress');

  insert into public.match_quest_progress (match_id, user_id, progress)
  values (p_match_id, p_user_id, coalesce(p_progress, '{}'::jsonb))
  on conflict (match_id, user_id) do nothing;

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
        and p_progress ? q.objective_key
        and (p_progress ->> q.objective_key)::integer > 0
        and (not p_vs_bot or q.bot_progress_allowed)
      returning pqp.completed_at
  )
  select count(*) filter (where completed_at is not null) into v_completed from advanced;

  return jsonb_build_object('ok', true, 'recorded', true, 'completed', v_completed);
end;
$$;

revoke all on function public.record_match_quest_progress(uuid, uuid, boolean, text[], jsonb) from public, anon, authenticated;
grant execute on function public.record_match_quest_progress(uuid, uuid, boolean, text[], jsonb) to service_role;

-- --- réclamation --------------------------------------------------------------
--
-- Atomique et à usage unique : `for update` sérialise deux clics simultanés,
-- `claimed_at` empêche d'encaisser deux fois. Le montant est lu depuis
-- `quests`, jamais reçu de l'appelant. Une quête terminée reste réclamable
-- après la fin de sa période : ce qui a été accompli est acquis.

create or replace function public.claim_quest_reward(p_user_id uuid, p_quest_id uuid, p_period_key text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_completed_at timestamptz;
  v_claimed_at timestamptz;
  v_reward integer;
  v_booster text;
  v_balance integer;
begin
  perform public.assert_server_caller('claim_quest_reward');

  select pqp.completed_at, pqp.claimed_at into v_completed_at, v_claimed_at
  from public.player_quest_progress pqp
  where pqp.user_id = p_user_id and pqp.quest_id = p_quest_id and pqp.period_key = p_period_key
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Quête introuvable.');
  end if;
  if v_completed_at is null then
    return jsonb_build_object('ok', false, 'error', 'Cette quête n''est pas encore terminée.');
  end if;
  if v_claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Récompense déjà réclamée.');
  end if;

  select q.reward_currency, q.reward_booster_definition_id into v_reward, v_booster
  from public.quests q where q.id = p_quest_id;

  update public.player_quest_progress
    set claimed_at = now()
    where user_id = p_user_id and quest_id = p_quest_id and period_key = p_period_key;

  if coalesce(v_reward, 0) > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, v_reward)
    on conflict (user_id) do update set
      balance = player_currency.balance + v_reward,
      updated_at = now();

    insert into public.currency_transactions (user_id, amount, reason, reference_id)
    values (p_user_id, v_reward, 'quest_reward', p_quest_id);
  end if;

  if v_booster is not null then
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, v_booster, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1,
      updated_at = now();
  end if;

  select pc.balance into v_balance from public.player_currency pc where pc.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'tides_gained', coalesce(v_reward, 0),
    'booster_id', v_booster,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function public.claim_quest_reward(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_quest_reward(uuid, uuid, text) to service_role;
