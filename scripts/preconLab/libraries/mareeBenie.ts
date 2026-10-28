import { DECK_LA_COMMUNION_DES_PROFONDEURS, DECK_L_EQUIPAGE_FELIN } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * Lots 20 et 21 — La Marée Bénie : les deux préconstruits, sous plusieurs
 * Navires (28/10/2026). La liste ne change pas d'une variante à l'autre,
 * seule la coque. À jouer en mode champ :
 *
 *   NAVIRES=le-brise-lames,le-courlis npx tsx scripts/preconLab/lab.ts \
 *     --lib scripts/preconLab/libraries/mareeBenie.ts \
 *     --field scripts/preconLab/libraries/mareeBenieChamp.ts --games 30
 *
 * Sans `NAVIRES`, chaque deck joue sous son propre Navire.
 */
const NAVIRES = process.env.NAVIRES?.split(",");

export const LIBRARY: DeckList[] = [DECK_LA_COMMUNION_DES_PROFONDEURS, DECK_L_EQUIPAGE_FELIN].flatMap((deck) =>
  NAVIRES ? NAVIRES.map((shipId) => ({ ...deck, id: `${deck.id}-${shipId}`, name: `${deck.name} · ${shipId}`, shipId })) : [deck]
);
