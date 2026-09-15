-- ═══════════════════════════════════════════════════════════════════════
-- REVENTE : L'EXCÉDENT, PAS LE DOUBLE
--
-- `recycle_card` gardait « au moins un exemplaire ». Elle rendait donc
-- vendable un 2ᵉ exemplaire dont un deck a parfaitement l'usage : la limite
-- du jeu est de trois copies pour la plupart des cartes, moins pour
-- certaines. Vendre son 2ᵉ exemplaire d'une carte jouée en triple est une
-- erreur qu'aucun achat ne rattrape — la base la rendait possible.
--
-- Le seuil à conserver arrive désormais en PARAMÈTRE (`p_min_keep`), lu du
-- catalogue par `features/collection/recycleValue.ts` : c'est la donnée
-- `maxCopies` de la carte, propre à chacune. Même principe que le montant
-- unitaire — le serveur calcule, la base garantit. Un second barème (ou une
-- seconde table de limites) gravé ici finirait par diverger, ce qui est
-- exactement ce qui était arrivé au barème.
--
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

-- La liste des paramètres change : `create or replace` ne suffit pas.
drop function if exists public.recycle_card(uuid, text, integer, integer);

/*
 * Revend des exemplaires EN TROP contre des Tides.
 *
 * Ce que la base garantit, et que personne ne peut contourner :
 *   - la carte existe, le montant est positif, le seuil est cohérent ;
 *   - le joueur possède assez d'exemplaires — lu `for update`, donc deux
 *     reventes simultanées ne peuvent pas vendre le même exemplaire deux
 *     fois ;
 *   - il lui en RESTE AU MOINS `p_min_keep`. Un deck sauvegardé ne peut
 *     donc pas devenir injouable parce qu'on a vendu ce qu'il contient.
 */
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
  -- Un seuil nul ou négatif viderait la collection : refusé net plutôt que
  -- corrigé en silence, un appelant qui envoie ça a un bug.
  if p_min_keep is null or p_min_keep < 1 then
    return jsonb_build_object('ok', false, 'error', 'Seuil de conservation invalide.');
  end if;

  if not exists (select 1 from public.cards c where c.id = p_card_id) then
    return jsonb_build_object('ok', false, 'error', 'Carte inconnue.');
  end if;

  select pc.quantity into v_owned
  from public.player_cards pc
  where pc.user_id = p_user_id and pc.card_id = p_card_id
  for update;

  if v_owned is null or v_owned - p_quantity < p_min_keep then
    return jsonb_build_object(
      'ok', false,
      'error', format('Tu dois garder au moins %s exemplaire%s de cette carte.', p_min_keep, case when p_min_keep > 1 then 's' else '' end)
    );
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
