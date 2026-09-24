/** Le rayon actuel, renommé pour affronter la proposition sans collision de noms. */
import type { DeckList } from "@/game/cards/decks/types";
import { LIBRARY as V0 } from "@/scripts/preconLab/libraries/v0";

export const LIBRARY: DeckList[] = V0.map((d) => ({ ...d, id: `ancien-${d.id}`, name: `(ancien) ${d.name}` }));
