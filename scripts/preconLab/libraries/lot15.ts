import { DECK_CAVALERIE, DECK_EQUIPAGE_DE_VERRE, DECK_SENTINELLES_CHROMATIQUES, PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * Les trois decks du Lot 15 — préconstruits depuis le 24/09/2026 : ils font
 * désormais partie du rayon, qui sert de champ tel quel.
 */
export const LOT15: DeckList[] = [DECK_EQUIPAGE_DE_VERRE, DECK_CAVALERIE, DECK_SENTINELLES_CHROMATIQUES];

export const LIBRARY: DeckList[] = [...PRECON_DECK_LISTS];
