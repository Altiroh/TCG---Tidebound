-- ═══════════════════════════════════════════════════════════════════════
-- IDENTITÉ DU PROFIL ET REVENTE DE CARTES
--
-- Deux sujets, une seule migration parce qu'ils partagent la même
-- exigence : ce que le navigateur envoie n'est jamais cru sur parole.
--
--   1. `profiles.avatar_card_id` — l'illustration de profil, choisie parmi
--      les cartes que le joueur POSSÈDE. La possession est vérifiée en base
--      (`set_profile_identity`), pas à l'écran.
--
--   2. `recycle_card` — réécrite. Elle était CASSÉE : sa variable de rareté
--      était déclarée `public.card_rarity`, un type supprimé par
--      `20260916120000` (conversion en `text` + contrainte). La fonction ne
--      compilait donc plus, et tout appel échouait. Ses montants étaient en
--      plus périmés (5/15/45/120, sans `epic` ni `legendary` : la valeur
--      serait sortie NULL sur une carte Épique) et sans rapport avec
--      `RECYCLE_VALUE`, qui les dérive désormais du prix du booster.
--
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════


-- --- 1. Illustration de profil -----------------------------------------
--
-- Référence `cards(id)` : une carte retirée du catalogue ne peut pas rester
-- affichée en avatar. `on delete set null` plutôt que `cascade` — perdre son
-- avatar n'a aucune raison de supprimer le profil.
alter table public.profiles
  add column if not exists avatar_card_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_card_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_card_id_fkey
      foreign key (avatar_card_id) references public.cards(id) on delete set null;
  end if;
end $$;


/*
 * Pseudo et avatar, en une écriture.
 *
 * Les deux sont facultatifs : passer `null` laisse la valeur en place, ce
 * qui permet de ne changer que l'un des deux sans relire l'autre d'abord —
 * entre la lecture et l'écriture, un autre onglet aurait pu le modifier.
 * `p_clear_avatar` distingue « ne touche pas à l'avatar » de « retire-le ».
 *
 * Le pseudo est NORMALISÉ ici (espaces rognés) et sa longueur contrôlée :
 * c'est la dernière barrière avant la colonne, et la seule que le client ne
 * peut pas contourner.
 */
create or replace function public.set_profile_identity(
  p_user_id uuid,
  p_display_name text default null,
  p_avatar_card_id text default null,
  p_clear_avatar boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
  v_avatar text;
begin
  perform public.assert_server_caller('set_profile_identity');

  if p_display_name is not null then
    v_name := btrim(p_display_name);
    if char_length(v_name) < 2 or char_length(v_name) > 24 then
      return jsonb_build_object('ok', false, 'error', 'Le pseudo doit faire entre 2 et 24 caractères.');
    end if;
  end if;

  if p_avatar_card_id is not null then
    -- POSSESSION : le joueur doit avoir la carte, pas seulement la connaître.
    -- `quantity > 0` et pas seulement l'existence de la ligne : recycler son
    -- dernier exemplaire laisse une ligne à 0.
    if not exists (
      select 1 from public.player_cards pc
      where pc.user_id = p_user_id and pc.card_id = p_avatar_card_id and pc.quantity > 0
    ) then
      return jsonb_build_object('ok', false, 'error', 'Tu ne possèdes pas cette carte.');
    end if;
    v_avatar := p_avatar_card_id;
  end if;

  update public.profiles
    set display_name = coalesce(v_name, profiles.display_name),
        avatar_card_id = case
          when p_clear_avatar then null
          else coalesce(v_avatar, profiles.avatar_card_id)
        end
    where id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Profil introuvable.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_profile_identity(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.set_profile_identity(uuid, text, text, boolean) to service_role;


-- --- 2. Revente de cartes ----------------------------------------------
--
-- L'ancienne signature est remplacée telle quelle (`create or replace` ne
-- suffit pas : le type de retour ne change pas, mais la liste des paramètres
-- si). On la supprime d'abord, au besoin.
drop function if exists public.recycle_card(uuid, text, integer);

/*
 * Revend des exemplaires EN DOUBLE contre des Tides.
 *
 * Le montant unitaire vient de l'appelant (`RECYCLE_VALUE`, dérivé du prix
 * du booster dans `game/boosters/constants.ts`) et non d'un barème gravé
 * ici : c'est précisément le barème en dur qui avait dérivé — il ignorait
 * les raretés Épique et Légendaire ajoutées depuis, et une carte Épique
 * serait repartie avec une valeur NULL. Même principe que
 * `grant_match_progression`, où le serveur calcule et la base garantit
 * l'intégrité.
 *
 * Ce que la base garantit, elle, et que personne ne peut contourner :
 *   - la carte existe et le montant est positif ;
 *   - le joueur possède assez d'exemplaires — lu `for update`, donc deux
 *     reventes simultanées ne peuvent pas vendre le même exemplaire deux
 *     fois ;
 *   - il lui en RESTE AU MOINS UN. On ne revend que ses doubles : un deck
 *     sauvegardé ne peut pas devenir injouable parce qu'on a vendu la carte
 *     qu'il contient, et une revente ne peut pas être un regret définitif.
 */
create or replace function public.recycle_card(
  p_user_id uuid,
  p_card_id text,
  p_quantity integer,
  p_unit_value integer
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

  if not exists (select 1 from public.cards c where c.id = p_card_id) then
    return jsonb_build_object('ok', false, 'error', 'Carte inconnue.');
  end if;

  select pc.quantity into v_owned
  from public.player_cards pc
  where pc.user_id = p_user_id and pc.card_id = p_card_id
  for update;

  if v_owned is null or v_owned - p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Tu dois garder au moins un exemplaire de chaque carte.');
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

revoke all on function public.recycle_card(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.recycle_card(uuid, text, integer, integer) to service_role;
