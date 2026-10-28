import { PRECON_DECKS, isOpenDeck } from "@/game/cards/decks/catalog";
import { DECK_LA_COMMUNION_DES_PROFONDEURS, DECK_L_EQUIPAGE_FELIN } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * Le champ des préconstruits de La Marée Bénie (28/10/2026) : le rayon
 * ouvert, tel qu'un joueur le rencontre, sans les deux decks mesurés.
 */
const MESURES = new Set([DECK_LA_COMMUNION_DES_PROFONDEURS.id, DECK_L_EQUIPAGE_FELIN.id]);

export const LIBRARY: DeckList[] = PRECON_DECKS.filter((deck) => isOpenDeck(deck) && !MESURES.has(deck.id));
