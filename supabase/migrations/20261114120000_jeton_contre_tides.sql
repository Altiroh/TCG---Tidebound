-- Market, rayon Monnaie (27/10/2026) : des Tides contre des Jetons de
-- Préconstruit. Le prix vient du SERVEUR applicatif (`PRECON_TOKEN_PRICE_TIDES`,
-- `game/economy/constants.ts`), jamais du navigateur ; la fonction n'est
-- appelable que par la clé service_role.
--
-- Atomique : le solde est lu `for update` (deux achats simultanés ne
-- dépensent pas deux fois les mêmes Tides), le débit, la trace et le crédit
-- de Jetons sont écrits ensemble, ou pas du tout.

create or replace function public.purchase_precon_tokens(
  p_user_id uuid,
  p_quantity integer,
  p_unit_price integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance integer;
  v_cost integer;
  v_tokens integer;
begin
  perform public.assert_server_caller('purchase_precon_tokens');

  if p_quantity is null or p_quantity < 1 or p_quantity > 5 then
    return jsonb_build_object('ok', false, 'error', 'Quantité invalide.');
  end if;
  if p_unit_price is null or p_unit_price < 1 then
    return jsonb_build_object('ok', false, 'error', 'Prix invalide.');
  end if;
  v_cost := p_quantity * p_unit_price;

  select balance into v_balance
  from public.player_currency
  where user_id = p_user_id
  for update;

  if coalesce(v_balance, 0) < v_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_funds');
  end if;

  update public.player_currency
    set balance = balance - v_cost, updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.currency_transactions (user_id, amount, reason)
  values (p_user_id, -v_cost, 'precon_token_purchase');

  insert into public.player_progression (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.player_progression
    set precon_tokens = player_progression.precon_tokens + p_quantity, updated_at = now()
    where user_id = p_user_id
    returning precon_tokens into v_tokens;

  return jsonb_build_object('ok', true, 'balance', v_balance, 'tokens', v_tokens, 'spent', v_cost);
end;
$$;

revoke all on function public.purchase_precon_tokens(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.purchase_precon_tokens(uuid, integer, integer) to service_role;
