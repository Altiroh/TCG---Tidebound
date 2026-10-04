import { DECK_LES_ALTERES, PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * Lot 16 — Les Altérés, sous chacun des six Navires (04/10/2026).
 *
 * Mesure de la coque : la liste de Notion est identique d'une variante à
 * l'autre, seul le Navire change. À jouer en mode champ, contre le rayon
 * sans les Altérés :
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/lot16Navires.ts \
 *     --field scripts/preconLab/libraries/rayonSansAlteres.ts --games 60
 *
 * Le champ vit dans `rayonSansAlteres.ts`.
 */
const NAVIRES = ["la-religieuse", "le-courlis", "lerrant", "le-brise-lames", "le-goliath", "la-verriere"] as const;

export const LIBRARY: DeckList[] = NAVIRES.map((shipId) => ({
  ...DECK_LES_ALTERES,
  id: `les-alteres-${shipId}`,
  name: `Les Altérés · ${shipId}`,
  shipId,
}));

/** Le rayon actuel, sans les Altérés : le champ contre lequel les variantes se mesurent. */
export const RAYON_SANS_ALTERES: DeckList[] = PRECON_DECK_LISTS.filter((deck) => deck.id !== DECK_LES_ALTERES.id);
