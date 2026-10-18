-- ═══════════════════════════════════════════════════════════════════════
-- FINITION FOIL (18/10/2026) — Collection visuelle V2
--
-- Les finitions rares deviennent cinq : Monochrome, Foil, Negative, Prisma
-- (id `prismatic`, inchangé) et Star Foil, désormais la plus rare
-- (`game/cosmetics/finishes.ts`). Seule la contrainte de
-- `player_card_finishes` change : elle refusait 'foil', et
-- `add_card_finishes` aurait rejeté en bloc toutes les finitions d'une
-- ouverture qui en contenait une.
--
-- À appliquer AVANT de pousser le code qui tire la Foil.
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.player_card_finishes
  drop constraint if exists player_card_finishes_finish;

alter table public.player_card_finishes
  add constraint player_card_finishes_finish
  check (finish in ('monochrome', 'foil', 'negative', 'prismatic', 'star-foil'));
