-- ======================================================================
-- REVENTE LIBRE — le joueur choisit combien, la base ne lui oppose plus
-- de plancher
-- ======================================================================
-- `20260921120000` avait restreint la revente au SURPLUS : ce qui dépasse
-- le nombre maximal d'exemplaires qu'un deck peut contenir. L'intention
-- était bonne (ne pas rendre un deck injouable par mégarde) mais la règle
-- allait trop loin : un joueur qui VEUT vendre une carte qu'il ne jouera
-- jamais se retrouvait sans bouton, sans explication utile, et sans
-- recours. La garde-fou devient une CONFIRMATION à l'écran (et un
-- avertissement quand la vente descend sous ce que ses decks utilisent),
-- pas un refus de la base.
--
-- Ce qui change, et rien d'autre :
--   `recycle_card` plafonnait `p_min_keep` à 1 — impossible de descendre
--   sous un exemplaire, même en passant 0. Le plancher passe à 0. La
--   valeur par défaut reste 1 quand l'appelant ne dit rien : un appel qui
--   oublie le paramètre continue de protéger le dernier exemplaire.
--
-- `recycle_surplus` n'est PAS touchée : le bouton « Revendre le surplus »
-- de la Collection reste, lui, une opération de ménage — il ne doit jamais
-- entamer ce qu'un deck peut jouer.
--
-- Entièrement idempotent : rejouable sans risque.

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
  -- Plancher à 0 : c'est l'appelant qui décide s'il protège un exemplaire.
  -- `coalesce(..., 1)` garde l'ancien comportement pour un appel qui ne
  -- passe pas le paramètre.
  v_keep integer := greatest(coalesce(p_min_keep, 1), 0);
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
    return jsonb_build_object(
      'ok', false,
      'error', case
        when v_keep > 0 then format('Tu dois garder au moins %s exemplaire(s) de cette carte.', v_keep)
        else 'Tu ne possèdes pas autant d''exemplaires.'
      end
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

  return jsonb_build_object('ok', true, 'tides_gained', v_total, 'balance', v_balance, 'remaining', v_owned - p_quantity);
end;
$$;

revoke all on function public.recycle_card(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.recycle_card(uuid, text, integer, integer, integer) to service_role;
