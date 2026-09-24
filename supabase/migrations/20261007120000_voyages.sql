-- TRAVERSÉES — suites de quêtes à paliers (audit du 24/09/2026).
--
-- Une Traversée est un voyage de cinq escales faites dans l'ordre ; chaque
-- escale bouclée monte la Traversée d'un palier, et chaque palier a sa
-- récompense à réclamer. Le catalogue (escales, objectifs, récompenses) vit
-- en TypeScript, `game/quests/voyages.ts` — comme la courbe d'XP de
-- `grant_match_progression`, tout y est calculé et testé ; ces fonctions ne
-- font qu'APPLIQUER, atomiquement et une seule fois.
--
-- Le code tolère l'absence de cette migration : sans elle, la Traversée
-- n'apparaît simplement pas, et rien d'autre ne change.
--
-- Idempotent : rejouable sans risque.

-- ======================================================================
-- 1. Progression par joueur et par Traversée
-- ======================================================================
create table if not exists public.player_voyages (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Identifiant du catalogue (`VoyageDefinition.id`), en texte libre : une
  -- quatrième Traversée ne doit pas demander de migration.
  voyage_id text not null,
  -- Escale en cours ET palier atteint : 0 au départ, 5 une fois bouclée.
  step_index smallint not null default 0 check (step_index between 0 and 5),
  step_progress integer not null default 0 check (step_progress >= 0),
  -- Valeurs distinctes déjà vues, pour une escale « avec N decks différents ».
  step_meta jsonb not null default '[]'::jsonb,
  -- Paliers réclamés, toujours les premiers : on ne réclame que ce qu'on a atteint.
  claimed_tiers smallint not null default 0 check (claimed_tiers >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, voyage_id),
  constraint player_voyages_claimed_reached check (claimed_tiers <= step_index)
);

alter table public.player_voyages enable row level security;

drop policy if exists "a user can read their own voyages" on public.player_voyages;
create policy "a user can read their own voyages"
  on public.player_voyages for select to authenticated using (user_id = auth.uid());

-- ======================================================================
-- 2. Idempotence par partie, et relevé pour l'écran de fin
-- ======================================================================
create table if not exists public.match_voyage_progress (
  match_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Ce que la partie a fait à l'escale : { voyage_id, step_index, before,
  -- after, target, completed_step }. Relu par l'écran de fin de partie.
  voyage_recap jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.match_voyage_progress enable row level security;

drop policy if exists "a user can read their own voyage recaps" on public.match_voyage_progress;
create policy "a user can read their own voyage recaps"
  on public.match_voyage_progress for select to authenticated using (user_id = auth.uid());

-- ======================================================================
-- 3. Appliquer l'avancement d'une partie
-- ======================================================================
-- Écriture CONDITIONNELLE : le serveur a calculé le nouvel état à partir de
-- `p_expected_*`. Si la ligne a bougé entre-temps (deux parties terminées
-- au même instant), rien n'est écrit, l'idempotence de la partie est
-- relâchée, et le serveur relit puis recommence une fois.
create or replace function public.apply_voyage_progress(
  p_match_id uuid,
  p_user_id uuid,
  p_voyage_id text,
  p_expected_step smallint,
  p_expected_progress integer,
  p_step_index smallint,
  p_step_progress integer,
  p_step_meta jsonb,
  p_recap jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_step smallint;
  v_progress integer;
  v_recap jsonb;
begin
  perform public.assert_server_caller('apply_voyage_progress');

  insert into public.match_voyage_progress (match_id, user_id, voyage_recap)
  values (p_match_id, p_user_id, coalesce(p_recap, '{}'::jsonb))
  on conflict (match_id, user_id) do nothing;

  if not found then
    select mvp.voyage_recap into v_recap
    from public.match_voyage_progress mvp
    where mvp.match_id = p_match_id and mvp.user_id = p_user_id;
    return jsonb_build_object('ok', true, 'recorded', false, 'recap', coalesce(v_recap, '{}'::jsonb));
  end if;

  insert into public.player_voyages (user_id, voyage_id)
  values (p_user_id, p_voyage_id)
  on conflict (user_id, voyage_id) do nothing;

  select pv.step_index, pv.step_progress into v_step, v_progress
  from public.player_voyages pv
  where pv.user_id = p_user_id and pv.voyage_id = p_voyage_id
  for update;

  if v_step <> p_expected_step or v_progress <> p_expected_progress then
    delete from public.match_voyage_progress where match_id = p_match_id and user_id = p_user_id;
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;

  update public.player_voyages
    set step_index = p_step_index,
        step_progress = p_step_progress,
        step_meta = coalesce(p_step_meta, '[]'::jsonb),
        completed_at = case when p_step_index >= 5 then coalesce(completed_at, now()) else completed_at end,
        updated_at = now()
    where user_id = p_user_id and voyage_id = p_voyage_id;

  return jsonb_build_object('ok', true, 'recorded', true, 'recap', coalesce(p_recap, '{}'::jsonb));
end;
$$;

revoke all on function public.apply_voyage_progress(uuid, uuid, text, smallint, integer, smallint, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_voyage_progress(uuid, uuid, text, smallint, integer, smallint, integer, jsonb, jsonb) to service_role;

-- ======================================================================
-- 4. Réclamer un palier
-- ======================================================================
-- Toujours le PROCHAIN palier (`claimed_tiers + 1`), et jamais au-delà de
-- celui atteint. Les montants viennent du catalogue TypeScript, par le
-- serveur seul (`assert_server_caller`).
create or replace function public.claim_voyage_tier(
  p_user_id uuid,
  p_voyage_id text,
  p_tier smallint,
  p_xp integer,
  p_tides integer,
  p_booster_id text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_step smallint;
  v_claimed smallint;
  v_balance integer;
begin
  perform public.assert_server_caller('claim_voyage_tier');

  select pv.step_index, pv.claimed_tiers into v_step, v_claimed
  from public.player_voyages pv
  where pv.user_id = p_user_id and pv.voyage_id = p_voyage_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Traversée pas encore commencée.');
  end if;
  if p_tier <> v_claimed + 1 then
    return jsonb_build_object('ok', false, 'error', 'Ce palier est déjà réclamé, ou un palier précédent attend.');
  end if;
  if p_tier > v_step then
    return jsonb_build_object('ok', false, 'error', 'Ce palier n''est pas encore atteint.');
  end if;

  update public.player_voyages
    set claimed_tiers = p_tier, updated_at = now()
    where user_id = p_user_id and voyage_id = p_voyage_id;

  if coalesce(p_tides, 0) > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, p_tides)
    on conflict (user_id) do update set
      balance = player_currency.balance + p_tides,
      updated_at = now();

    insert into public.currency_transactions (user_id, amount, reason)
    values (p_user_id, p_tides, 'voyage_reward');
  end if;

  -- Le passage de niveau éventuel est rattrapé à la partie suivante, comme
  -- pour les quêtes : le niveau est toujours recalculé depuis l'XP cumulée.
  if coalesce(p_xp, 0) > 0 then
    insert into public.player_progression (user_id, xp_total) values (p_user_id, p_xp)
    on conflict (user_id) do update set xp_total = player_progression.xp_total + p_xp, updated_at = now();
  end if;

  if p_booster_id is not null then
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, p_booster_id, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1,
      updated_at = now();
  end if;

  select pc.balance into v_balance from public.player_currency pc where pc.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'tier', p_tier,
    'tides_gained', coalesce(p_tides, 0),
    'xp_gained', coalesce(p_xp, 0),
    'booster_id', p_booster_id,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function public.claim_voyage_tier(uuid, text, smallint, integer, integer, text) from public, anon, authenticated;
grant execute on function public.claim_voyage_tier(uuid, text, smallint, integer, integer, text) to service_role;
