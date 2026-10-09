import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";

/** Champ du labo : le rayon actuel sans La Veillée. */
export const LIBRARY = PRECON_DECK_LISTS.filter((d) => d.id !== "la-veillee");
