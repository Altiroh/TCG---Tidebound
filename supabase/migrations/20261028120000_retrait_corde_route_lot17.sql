-- ======================================================================
-- RETRAIT DE 2 CARTES DU LOT 17 — nettoyage du 06/10/2026
-- ======================================================================
-- Corde de rappel (`corde-de-rappel-legere`, redondante avec la Corde de
-- Rappel du Nécessaire du Marin) et Route barrée (redondante avec les
-- réponses aux Landes, Lever l'Ancre en tête) ont quitté le code
-- (Notion « Boosters & économie » § Nettoyage du Lot 17).
--
-- Même traitement que les retraits précédents (à passer APRÈS
-- `20261022120000_retrait_28_cartes.sql`, qui crée les tables) : lignes de
-- `cards` conservées mais désactivées, possessions et lignes de deck
-- archivées puis retirées, références vivantes nettoyées, choix de carte en
-- attente remplacés. Sans effet si ces cartes n'ont jamais été semées.
--
-- À APPLIQUER sans partie en cours. Rejouable.

-- ── Liste des cartes retirées ─────────────────────────────────────────
create table if not exists public.retired_cards (
  card_id text primary key references public.cards (id),
  retired_at timestamptz not null default now(),
  reason text not null
);

alter table public.retired_cards enable row level security;

insert into public.retired_cards (card_id, reason)
select c.id, 'Nettoyage du Lot 17 du 06/10/2026 — carte écartée (redondante).'
from public.cards c
where c.id in (
  'corde-de-rappel-legere',
  'route-barree'
)
on conflict (card_id) do nothing;

-- ── Archive des possessions et des decks ──────────────────────────────
create table if not exists public.retired_card_archive (
  id bigint generated always as identity primary key,
  source_table text not null,
  user_id uuid,
  card_id text not null,
  quantity integer,
  -- La ligne d'origine telle quelle, pour pouvoir la restaurer ou la
  -- compenser sans deviner ses autres colonnes.
  original_row jsonb not null,
  archived_at timestamptz not null default now()
);

create index if not exists retired_card_archive_user_idx on public.retired_card_archive (user_id);

alter table public.retired_card_archive enable row level security;
-- Pas de policy : réservé à la clé service_role.

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
-- Une carte retirée est ôtée des propositions NON tranchées (le choix
-- garde ses autres cartes). En SQL simple, sans bloc procédural (`do`) :
-- l'éditeur SQL du tableau de bord coupait le bloc et refusait la requête.
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
