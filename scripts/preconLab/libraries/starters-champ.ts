import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * CHAMP DES STARTERS — le rayon CONSERVÉ (Notion « Préconstruits — Quality
 * Gate », 15/10/2026) : tout `PRECON_DECK_LISTS` sauf les trois listes
 * retirées (La Forteresse, Épavistes, À Bout de Raison) et sauf les
 * starters eux-mêmes, qui se mesurent contre ce champ.
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/starters.ts \
 *     --field scripts/preconLab/libraries/starters-champ.ts --games 60
 */
const EXCLUS = new Set([
  "la-forteresse",
  "epavistes",
  "a-bout-de-raison",
  "le-rempart-vivant",
  "les-saboteurs-du-pont",
  "l-assaut-des-marees",
]);

export const LIBRARY: DeckList[] = PRECON_DECK_LISTS.filter((deck) => !EXCLUS.has(deck.id));
