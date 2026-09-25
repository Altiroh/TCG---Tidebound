-- ======================================================================
-- HUB DE PROGRESSION — Coffre hebdomadaire, Maîtrises, Commanditaires
-- ======================================================================
-- Notion « Dynamique de progression — Maîtrises, Coffres, Audience &
-- Commanditaires ». Règles et valeurs : `game/progression/hub.ts`.
--
-- Ce qui est DÉRIVÉ n'est pas stocké : la progression du coffre (parties de
-- la semaine) et des Maîtrises (XP par Navire) se lit dans `match_rewards`
-- et `matches`. Seuls sont stockés :
--   - les RÉCLAMATIONS, une ligne par récompense prise (clé d'idempotence) ;
--   - l'INTÉRÊT des Commanditaires, qui se lit dans le journal d'une partie
--     et n'existe nulle part ailleurs une fois la partie archivée.

-- ---------------------------------------------------------------------
-- 1. Réclamations : coffre de la semaine, palier de Maîtrise, colis
-- ---------------------------------------------------------------------
create table if not exists public.player_progression_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('weekly_chest', 'mastery', 'sponsor_gift')),
  -- Coffre : n° de semaine ; Maîtrise : `<navire>:<niveau>` ; colis : `<commanditaire>:<palier>`.
  claim_key text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, kind, claim_key)
);

alter table public.player_progression_claims enable row level security;
drop policy if exists "a user can read their own progression claims" on public.player_progression_claims;
create policy "a user can read their own progression claims"
  on public.player_progression_claims for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. Intérêt des Commanditaires
-- ---------------------------------------------------------------------
create table if not exists public.player_sponsor_interest (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sponsor_id text not null,
  points integer not null default 0 check (points >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, sponsor_id)
);

alter table public.player_sponsor_interest enable row level security;
drop policy if exists "a user can read their own sponsor interest" on public.player_sponsor_interest;
create policy "a user can read their own sponsor interest"
  on public.player_sponsor_interest for select to authenticated using (user_id = (select auth.uid()));

-- Une partie ne compte qu'une fois par joueur, même si deux chemins observent sa fin.
create table if not exists public.player_sponsor_matches (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.player_sponsor_matches enable row level security;

-- ---------------------------------------------------------------------
-- 3. Réclamer une récompense du hub (atomique, une seule fois)
-- ---------------------------------------------------------------------
-- L'ÉLIGIBILITÉ (coffre plein, palier atteint) est vérifiée par le serveur
-- applicatif, qui lit la progression dérivée ; cette fonction garantit
-- l'unicité et l'octroi atomique.
create or replace function public.claim_progression_reward(
  p_user_id uuid,
  p_kind text,
  p_key text,
  p_tides integer default 0,
  p_booster_id text default null,
  p_card_id text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.assert_server_caller('claim_progression_reward');

  insert into public.player_progression_claims (user_id, kind, claim_key)
  values (p_user_id, p_kind, p_key)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Récompense déjà réclamée.');
  end if;

  if coalesce(p_tides, 0) > 0 then
    insert into public.player_currency (user_id, balance) values (p_user_id, p_tides)
    on conflict (user_id) do update set balance = player_currency.balance + p_tides, updated_at = now();
    insert into public.currency_transactions (user_id, amount, reason) values (p_user_id, p_tides, p_kind);
  end if;

  if p_booster_id is not null then
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, p_booster_id, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1, updated_at = now();
  end if;

  if p_card_id is not null then
    insert into public.player_cards (user_id, card_id, quantity) values (p_user_id, p_card_id, 1)
    on conflict (user_id, card_id) do update set
      quantity = player_cards.quantity + 1, updated_at = now();
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.claim_progression_reward(uuid, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.claim_progression_reward(uuid, text, text, integer, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 4. Ajouter l'intérêt qu'une partie a éveillé (idempotent par partie)
-- ---------------------------------------------------------------------
-- `p_points` : `{ "<commanditaire>": points, … }`, calculé par
-- `sponsorPointsForMatch` sur l'état final de la partie.
create or replace function public.record_sponsor_interest(
  p_user_id uuid,
  p_match_id uuid,
  p_points jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_entry record;
begin
  perform public.assert_server_caller('record_sponsor_interest');

  insert into public.player_sponsor_matches (match_id, user_id) values (p_match_id, p_user_id)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'recorded', false);
  end if;

  for v_entry in select key, value from jsonb_each_text(coalesce(p_points, '{}'::jsonb)) loop
    if v_entry.value::integer > 0 then
      insert into public.player_sponsor_interest (user_id, sponsor_id, points)
      values (p_user_id, v_entry.key, v_entry.value::integer)
      on conflict (user_id, sponsor_id) do update set
        points = player_sponsor_interest.points + excluded.points, updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'recorded', true);
end;
$$;

revoke all on function public.record_sponsor_interest(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_sponsor_interest(uuid, uuid, jsonb) to service_role;
