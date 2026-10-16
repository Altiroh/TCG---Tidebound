-- ======================================================================
-- RETRAIT DE 7 PASSERELLES DU LOT 17 — 16/10/2026
-- ======================================================================
-- Cartographe du Large, Gardien des Balises, Boussole fendue, Campement
-- provisoire, Tour de guet mobile, Marée imprévisible et Terres inconnues :
-- sorties des pools à l'audit du 06/10/2026, jamais illustrées, elles
-- quittent le jeu (décision du 16/10/2026).
--
-- Même traitement que `20261028120000_retrait_corde_route_lot17.sql` :
-- lignes de `cards` conservées mais désactivées, possessions et lignes de
-- deck archivées puis retirées, références vivantes nettoyées, choix de
-- carte en attente nettoyés. Sans effet si ces cartes n'ont jamais été semées.
--
-- À APPLIQUER sans partie en cours. Rejouable.

insert into public.retired_cards (card_id, reason)
select c.id, 'Passerelle du Lot 17 sortie des pools le 06/10/2026, retirée du jeu le 16/10/2026.'
from public.cards c
where c.id in (
  'cartographe-du-large',
  'gardien-des-balises',
  'boussole-fendue',
  'campement-provisoire',
  'tour-de-guet-mobile',
  'maree-imprevisible',
  'terres-inconnues'
)
on conflict (card_id) do nothing;

-- ── Archive des possessions et des decks (une seule fois par ligne) ───
insert into public.retired_card_archive (source_table, user_id, card_id, quantity, original_row)
select 'player_cards', pc.user_id, pc.card_id, pc.quantity, to_jsonb(pc)
from public.player_cards pc
join public.retired_cards rc on rc.card_id = pc.card_id;

insert into public.retired_card_archive (source_table, user_id, card_id, quantity, original_row)
select 'player_deck_cards', pd.user_id, pdc.card_id, pdc.quantity, to_jsonb(pdc)
from public.player_deck_cards pdc
join public.player_decks pd on pd.id = pdc.deck_id
join public.retired_cards rc on rc.card_id = pdc.card_id;

-- ── Références vivantes ───────────────────────────────────────────────
delete from public.player_cards pc using public.retired_cards rc where pc.card_id = rc.card_id;
delete from public.player_deck_cards pdc using public.retired_cards rc where pdc.card_id = rc.card_id;
delete from public.system_deck_cards sdc using public.retired_cards rc where sdc.card_id = rc.card_id;
delete from public.booster_pool_cards bpc using public.retired_cards rc where bpc.card_id = rc.card_id;
delete from public.player_card_favorites f using public.retired_cards rc where f.card_id = rc.card_id;
delete from public.player_card_notebook_cards nc using public.retired_cards rc where nc.card_id = rc.card_id;

update public.profiles p set avatar_card_id = null
from public.retired_cards rc where p.avatar_card_id = rc.card_id;

update public.player_decks d set art_card_id = null
from public.retired_cards rc where d.art_card_id = rc.card_id;

update public.player_card_notebooks n set cover_card_id = null
from public.retired_cards rc where n.cover_card_id = rc.card_id;

-- ── Choix de carte en attente ─────────────────────────────────────────
update public.player_card_choices pcc
set offered_card_ids = array(
  select offered.card_id
  from unnest(pcc.offered_card_ids) as offered(card_id)
  where not exists (select 1 from public.retired_cards rc where rc.card_id = offered.card_id)
)
where pcc.resolved_at is null
  and exists (
    select 1 from public.retired_cards rc where rc.card_id = any (pcc.offered_card_ids)
  );

-- ── Désactivation au catalogue ────────────────────────────────────────
update public.cards c
set is_enabled = false, is_collectible = false, updated_at = now()
from public.retired_cards rc
where c.id = rc.card_id
  and (c.is_enabled or c.is_collectible);
