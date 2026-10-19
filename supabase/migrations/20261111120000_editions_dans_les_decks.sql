-- ═══════════════════════════════════════════════════════════════════════
-- ÉDITIONS DANS LES DECKS (19/10/2026) — une variante PAR EXEMPLAIRE
--
-- Un deck peut embarquer, pour une même carte, une Classique et une Star
-- Foil, une Styled et une Full-Art… Chaque copie se montre en partie dans
-- sa variante.
--
-- `player_deck_card_editions` : les éditions RARES des exemplaires d'un
-- deck, avec leur quantité. Les copies qu'aucune ligne ne désigne sont
-- Classiques (`player_deck_cards.quantity` reste le total, la limite de la
-- carte porte sur toutes ses éditions).
--
-- Écriture par le joueur sur SES decks (même policy que `player_deck_cards`) ;
-- le serveur vérifie la possession de chaque édition avant d'écrire, et la
-- revérifie à l'entrée en partie.
-- Le code tolère l'absence de cette migration : tout reste Classique.
-- Entièrement idempotente : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.player_deck_card_editions (
  deck_id uuid not null references public.player_decks (id) on delete cascade,
  card_id text not null references public.cards (id),
  artwork text not null,
  finish text not null,
  quantity smallint not null,
  primary key (deck_id, card_id, artwork, finish),
  constraint player_deck_card_editions_artwork check (artwork in ('classique', 'styled', 'styled-fa')),
  constraint player_deck_card_editions_finish check (finish in ('classique', 'monochrome', 'foil', 'negative', 'prismatic', 'star-foil')),
  constraint player_deck_card_editions_rare check (not (artwork = 'classique' and finish = 'classique')),
  constraint player_deck_card_editions_quantity check (quantity > 0)
);

alter table public.player_deck_card_editions enable row level security;

drop policy if exists "a user can manage the editions of their own decks" on public.player_deck_card_editions;
create policy "a user can manage the editions of their own decks"
  on public.player_deck_card_editions for all
  to authenticated
  using (exists (select 1 from public.player_decks d where d.id = deck_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from public.player_decks d where d.id = deck_id and d.user_id = (select auth.uid())));
