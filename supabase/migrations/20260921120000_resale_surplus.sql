-- ======================================================================
-- REVENTE DU SURPLUS
-- ======================================================================
-- « Revendre les doubles » ne gardait qu'UN exemplaire : un joueur pouvait
-- vendre la deuxième copie d'une carte que ses decks utilisent en deux
-- exemplaires. Désormais on ne revend que le SURPLUS — ce qui dépasse le
-- nombre maximal d'exemplaires qu'un deck peut contenir (`getMaxCopies`).
-- Au-delà, une copie ne peut servir à aucun deck : la vendre ne coûte rien.
--
--   1. `recycle_card` gagne `p_min_keep` : le nombre d'exemplaires à garder,
--      fourni par le serveur applicatif (le maximum vit dans le catalogue
--      TypeScript, comme le barème).
--   2. `recycle_surplus` revend le surplus de PLUSIEURS cartes en une seule
--      transaction : le bouton « Revendre le surplus » de la Collection.
--
-- Garanties tenues par la base :
--   - la possession est lue `for update` : deux reventes simultanées ne
--     vendent jamais le même exemplaire ;
--   - on ne descend jamais sous `p_min_keep` (et jamais sous 1) ;
--   - une quantité attendue est un PLAFOND : si la collection a changé entre
--     l'affichage du récapitulatif et la confirmation, on vend moins, jamais
--     plus que ce que le joueur a validé.
--
-- Entièrement idempotent : rejouable sans risque.

drop function if exists public.recycle_card(uuid, text, integer, integer);
-- Une version à cinq paramètres peut déjà exister (nommée ou non comme
-- ici) : un nom de paramètre ne se change pas par `create or replace`.
drop function if exists public.recycle_card(uuid, text, integer, integer, integer);

create or replace function public.recycle_card(
  p_user_id uuid,
  p_card_id text,
  p_quantity integer,
  p_unit_value integer,
  p_min_keep integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_owned integer;
  v_keep integer := greatest(coalesce(p_min_keep, 1), 1);
  v_total integer;
  v_balance integer;
begin
  perform public.assert_server_caller('recycle_card');

  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantité invalide.');
  end if;
  if p_unit_value is null or p_unit_value < 1 then
    return jsonb_build_object('ok', false, 'error', 'Valeur de revente invalide.');
  end if;

  if not exists (select 1 from public.cards c where c.id = p_card_id) then
    return jsonb_build_object('ok', false, 'error', 'Carte inconnue.');
  end if;

  select pc.quantity into v_owned
  from public.player_cards pc
  where pc.user_id = p_user_id and pc.card_id = p_card_id
  for update;

  if v_owned is null or v_owned - p_quantity < v_keep then
    return jsonb_build_object('ok', false, 'error', format('Seul le surplus se revend : tu gardes %s exemplaire(s) de cette carte.', v_keep));
  end if;

  v_total := p_unit_value * p_quantity;

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

  return jsonb_build_object('ok', true, 'tides_gained', v_total, 'balance', v_balance, 'remaining', v_owned - p_quantity);
end;
$$;

revoke all on function public.recycle_card(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.recycle_card(uuid, text, integer, integer, integer) to service_role;


/*
 * Surplus de plusieurs cartes, en une fois.
 *
 * `p_items` : [{ "card_id", "quantity", "unit_value", "keep" }] — quantité
 * attendue (plafond), valeur unitaire et exemplaires à garder, tous fixés
 * par le serveur applicatif depuis le catalogue.
 */
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

    v_sold := least(v_wanted, coalesce(v_owned, 0) - v_keep);
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
