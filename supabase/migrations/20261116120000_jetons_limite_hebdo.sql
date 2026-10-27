-- Market, rayon Monnaie (27/10/2026, suite) : le Jeton de Préconstruit passe à
-- 1 000 Tides et se limite à 3 achats par SEMAINE (lundi 00:00 UTC, comme les
-- quêtes hebdomadaires). Le prix et la limite viennent du serveur applicatif
-- (`PRECON_TOKEN_PRICE_TIDES`, `PRECON_TOKENS_WEEKLY_LIMIT`,
-- `game/economy/constants.ts`) ; le COMPTE, lui, se tient ici, au même
-- endroit que le débit : deux achats simultanés ne passent pas la limite.
--
-- Remplace `purchase_precon_tokens(uuid, integer, integer)` de la migration
-- 20261114120000 (supprimée ci-dessous) par une version à 4 arguments.

create table if not exists public.precon_token_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price > 0),
  created_at timestamptz not null default now()
);

create index if not exists precon_token_purchases_user_created_idx
  on public.precon_token_purchases (user_id, created_at);

alter table public.precon_token_purchases enable row level security;

drop policy if exists "precon_token_purchases_select_own" on public.precon_token_purchases;
create policy "precon_token_purchases_select_own"
  on public.precon_token_purchases for select
  using (auth.uid() = user_id);

drop function if exists public.purchase_precon_tokens(uuid, integer, integer);

create or replace function public.purchase_precon_tokens(
  p_user_id uuid,
  p_quantity integer,
  p_unit_price integer,
  p_weekly_limit integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance integer;
  v_cost integer;
  v_tokens integer;
  v_week_start timestamptz := date_trunc('week', now() at time zone 'utc') at time zone 'utc';
  v_bought integer;
begin
  perform public.assert_server_caller('purchase_precon_tokens');

  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantité invalide.');
  end if;
  if p_unit_price is null or p_unit_price < 1 or p_weekly_limit is null or p_weekly_limit < 1 then
    return jsonb_build_object('ok', false, 'error', 'Prix invalide.');
  end if;
  v_cost := p_quantity * p_unit_price;

  -- Le verrou du solde sérialise les achats d'un même joueur : le compte de
  -- la semaine, lu juste après, ne peut pas être doublé par un achat parallèle.
  select balance into v_balance
  from public.player_currency
  where user_id = p_user_id
  for update;

  select coalesce(sum(quantity), 0) into v_bought
  from public.precon_token_purchases
  where user_id = p_user_id and created_at >= v_week_start;

  if v_bought + p_quantity > p_weekly_limit then
    return jsonb_build_object('ok', false, 'error', 'weekly_limit', 'remaining', greatest(p_weekly_limit - v_bought, 0));
  end if;

  if coalesce(v_balance, 0) < v_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds');
  end if;

  update public.player_currency
    set balance = balance - v_cost, updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.currency_transactions (user_id, amount, reason)
  values (p_user_id, -v_cost, 'precon_token_purchase');

  insert into public.precon_token_purchases (user_id, quantity, unit_price)
  values (p_user_id, p_quantity, p_unit_price);

  insert into public.player_progression (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.player_progression
    set precon_tokens = player_progression.precon_tokens + p_quantity, updated_at = now()
    where user_id = p_user_id
    returning precon_tokens into v_tokens;

  return jsonb_build_object(
    'ok', true,
    'balance', v_balance,
    'tokens', v_tokens,
    'spent', v_cost,
    'remaining', p_weekly_limit - v_bought - p_quantity
  );
end;
$$;

revoke all on function public.purchase_precon_tokens(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.purchase_precon_tokens(uuid, integer, integer, integer) to service_role;
