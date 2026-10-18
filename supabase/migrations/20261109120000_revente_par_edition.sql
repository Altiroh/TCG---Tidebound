-- ═══════════════════════════════════════════════════════════════════════
-- REVENTE PAR ÉDITION (18/10/2026) — Collection visuelle V2, phase 4
--
-- À appliquer APRÈS 20261108120000 (tables des éditions).
--
-- Une édition rare (Styled, Full-Art, finition) a son PROPRE prix de
-- revente, garanti au jeu (barème : `features/collection/recycleValue.ts`,
-- le montant est passé par le serveur comme pour `recycle_card`).
--
--  1. `recycle_edition` : revend des exemplaires d'UNE édition. Pour la
--     Classique, seuls les exemplaires qui ne sont d'aucune édition rare
--     sont vendables ; pour une édition rare, ceux de cette édition. Le
--     compte de la carte (`player_cards`) baisse avec, toujours.
--  2. `recycle_surplus` (« Revendre le surplus ») ne vend plus que des
--     Classiques : une édition rare ne part jamais dans une revente groupée.
--
-- `recycle_card` reste en place (anciens clients) mais le code ne l'appelle
-- plus : elle ignorait les éditions et pouvait vendre un exemplaire rare au
-- prix d'une Classique.
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.recycle_edition(
  p_user_id uuid,
  p_card_id text,
  p_artwork text,
  p_finish text,
  p_quantity integer,
  p_unit_value integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_owned integer;
  v_rares integer;
  v_available integer;
  v_total integer;
  v_balance integer;
  v_classique boolean := p_artwork = 'classique' and p_finish = 'classique';
begin
  perform public.assert_server_caller('recycle_edition');

  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantité invalide.');
  end if;
  if p_unit_value is null or p_unit_value < 1 then
    return jsonb_build_object('ok', false, 'error', 'Valeur de revente invalide.');
  end if;
  if not exists (select 1 from public.cards c where c.id = p_card_id) then
    return jsonb_build_object('ok', false, 'error', 'Carte inconnue.');
  end if;

  -- Verrou sur la carte d'abord, puis sur ses éditions : deux reventes
  -- simultanées ne vendent jamais le même exemplaire.
  select pc.quantity into v_owned
  from public.player_cards pc
  where pc.user_id = p_user_id and pc.card_id = p_card_id
  for update;

  if v_classique then
    select coalesce(sum(e.quantity), 0) into v_rares
    from public.player_card_editions e
    where e.user_id = p_user_id and e.card_id = p_card_id;
    v_available := coalesce(v_owned, 0) - v_rares;
  else
    select e.quantity into v_available
    from public.player_card_editions e
    where e.user_id = p_user_id and e.card_id = p_card_id and e.artwork = p_artwork and e.finish = p_finish
    for update;
    v_available := least(coalesce(v_available, 0), coalesce(v_owned, 0));
  end if;

  if v_available < p_quantity then
    return jsonb_build_object('ok', false, 'error', 'Tu ne possèdes pas autant d''exemplaires de cette édition.');
  end if;

  if not v_classique then
    update public.player_card_editions
      set quantity = player_card_editions.quantity - p_quantity
      where user_id = p_user_id and card_id = p_card_id and artwork = p_artwork and finish = p_finish;
    -- L'édition revendue n'est plus montrée en partie si plus aucun exemplaire ne reste.
    delete from public.player_card_display d
      where d.user_id = p_user_id and d.card_id = p_card_id and d.artwork = p_artwork and d.finish = p_finish
        and not exists (
          select 1 from public.player_card_editions e
          where e.user_id = p_user_id and e.card_id = p_card_id and e.artwork = p_artwork and e.finish = p_finish and e.quantity > 0
        );
  end if;

  update public.player_cards
    set quantity = player_cards.quantity - p_quantity, updated_at = now()
    where user_id = p_user_id and card_id = p_card_id;

  v_total := p_unit_value * p_quantity;

  insert into public.player_currency (user_id, balance)
  values (p_user_id, v_total)
  on conflict (user_id) do update set
    balance = player_currency.balance + v_total,
    updated_at = now()
  returning player_currency.balance into v_balance;

  insert into public.currency_transactions (user_id, amount, reason)
  values (p_user_id, v_total, 'card_recycle');

  return jsonb_build_object('ok', true, 'tides_gained', v_total, 'balance', v_balance, 'remaining', v_available - p_quantity);
end;
$$;

revoke all on function public.recycle_edition(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.recycle_edition(uuid, text, text, text, integer, integer) to service_role;


-- « Revendre le surplus » : les éditions rares ne sont jamais vendues.
create or replace function public.recycle_surplus(p_user_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_item jsonb;
  v_card text;
  v_wanted integer;
  v_unit integer;
  v_keep integer;
  v_owned integer;
  v_rares integer;
  v_sold integer;
  v_total integer := 0;
  v_count integer := 0;
  v_lines jsonb := '[]'::jsonb;
  v_balance integer;
begin
  perform public.assert_server_caller('recycle_surplus');

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Liste de revente invalide.');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_card := v_item->>'card_id';
    v_wanted := (v_item->>'quantity')::integer;
    v_unit := (v_item->>'unit_value')::integer;
    v_keep := greatest(coalesce((v_item->>'keep')::integer, 1), 1);
    if v_card is null or v_wanted is null or v_wanted < 1 or v_unit is null or v_unit < 1 then
      continue;
    end if;

    select pc.quantity into v_owned
    from public.player_cards pc
    where pc.user_id = p_user_id and pc.card_id = v_card
    for update;

    select coalesce(sum(e.quantity), 0) into v_rares
    from public.player_card_editions e
    where e.user_id = p_user_id and e.card_id = v_card;

    -- Ce qu'on garde se compte en Classiques : les éditions rares ne sont ni vendues ni comptées.
    v_sold := least(v_wanted, coalesce(v_owned, 0) - v_rares - v_keep);
    if v_sold is null or v_sold < 1 then
      continue;
    end if;

    update public.player_cards
      set quantity = player_cards.quantity - v_sold, updated_at = now()
      where user_id = p_user_id and card_id = v_card;

    v_total := v_total + v_sold * v_unit;
    v_count := v_count + v_sold;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('card_id', v_card, 'sold', v_sold, 'tides', v_sold * v_unit));
  end loop;

  if v_total > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, v_total)
    on conflict (user_id) do update set
      balance = player_currency.balance + v_total,
      updated_at = now()
    returning player_currency.balance into v_balance;

    insert into public.currency_transactions (user_id, amount, reason)
    values (p_user_id, v_total, 'card_recycle');
  else
    select balance into v_balance from public.player_currency where user_id = p_user_id;
  end if;

  return jsonb_build_object('ok', true, 'tides_gained', v_total, 'cards_sold', v_count, 'balance', coalesce(v_balance, 0), 'lines', v_lines);
end;
$$;

revoke all on function public.recycle_surplus(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.recycle_surplus(uuid, jsonb) to service_role;
