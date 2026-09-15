-- ═══════════════════════════════════════════════════════════════════════
-- ILLUSTRATION CHOISIE D'UN DECK
--
-- La plaque d'un deck tirait son image d'une règle : la carte la plus
-- CHÈRE du deck. Déterministe et jamais vide, mais imposée — deux decks
-- bâtis autour de la même grosse carte se ressemblaient, et on ne pouvait
-- pas mettre en avant celle qui fait vraiment l'identité du deck.
--
-- `art_card_id` porte le choix explicite. `null` = pas de choix, la règle
-- reprend la main : un deck existant garde donc exactement l'image qu'il a
-- aujourd'hui, et un deck vidé de sa carte vedette ne se retrouve pas nu.
--
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.player_decks
  add column if not exists art_card_id text;

-- Référence le catalogue : une carte retirée du jeu ne peut pas rester
-- affichée. `on delete set null` — perdre son illustration ne doit pas
-- emporter le deck, la règle par défaut reprend simplement la main.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_decks_art_card_id_fkey') then
    alter table public.player_decks
      add constraint player_decks_art_card_id_fkey
      foreign key (art_card_id) references public.cards(id) on delete set null;
  end if;
end $$;
