-- ======================================================================
-- DECKS — un deck PAR DÉFAUT par joueur
-- ======================================================================
-- Le joueur marque un de ses decks comme « par défaut » : c'est lui qui est
-- présélectionné à l'écran Jouer (local et en ligne). Un seul à la fois,
-- garanti par l'index partiel unique : le code désactive l'ancien avant de
-- poser le nouveau (`setDefaultDeck`), l'index rattrape toute course.
--
-- Un deck mis à la corbeille perd son statut (fait par l'application au
-- moment de la suppression) : un deck invisible ne peut pas être « celui
-- qu'on joue ».
--
-- Entièrement idempotent : rejouable sans risque.

alter table public.player_decks
  add column if not exists is_default boolean not null default false;

comment on column public.player_decks.is_default is
  'Deck présélectionné à l''écran Jouer. Un seul par joueur (index partiel unique).';

create unique index if not exists player_decks_one_default_idx
  on public.player_decks (user_id)
  where is_default;
