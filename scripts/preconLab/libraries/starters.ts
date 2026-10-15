import type { DeckList } from "@/game/cards/decks/types";
import { DECK_L_ASSAUT_DES_MAREES, DECK_LES_SABOTEURS_DU_PONT, DECK_LE_REMPART_VIVANT } from "@/game/cards/decks/starters";

/**
 * LES TROIS STARTERS, pour le labo. Les listes vivent dans
 * `game/cards/decks/starters.ts` (mesures dans son en-tête) :
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/starters.ts \
 *     --field scripts/preconLab/libraries/starters-champ.ts --games 60
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/starters.ts --games 60
 *   (et les deux avec --bot difficile --games 24)
 */
export const LIBRARY: DeckList[] = [DECK_LE_REMPART_VIVANT, DECK_LES_SABOTEURS_DU_PONT, DECK_L_ASSAUT_DES_MAREES];
