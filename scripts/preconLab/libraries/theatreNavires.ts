import type { DeckList } from "@/game/cards/decks/types";
import { doubles, LISTE_V2, LISTE_V3, LISTE_V3_LEGERE, masquePioche, THEATRE_AVANT as T } from "@/scripts/preconLab/libraries/theatre";

/**
 * LE THÉÂTRE ENGLOUTI — seconde passe : liste, coques, et la retouche
 * « à son arrivée ET quand il est détruit » (29/09/2026). « liste 3
 * légère, Religieuse » (49 %, contre 31 %) est devenue le préconstruit.
 *
 *   npx tsx scripts/preconLab/lab.ts --setup scripts/preconLab/libraries/theatre.ts \
 *     --lib scripts/preconLab/libraries/theatreNavires.ts --field scripts/preconLab/libraries/lot15.ts --games 60
 */
const v = (nom: string, shipId: string, cardIds: readonly string[]): DeckList => ({
  ...T,
  id: `lab-theatre2-${nom}`,
  name: `Théâtre [${nom}]`,
  shipId,
  cardIds: [...cardIds],
});

export const LIBRARY: DeckList[] = [
  v("avant", T.shipId, T.cardIds),
  v("liste, Courlis", "le-courlis", LISTE_V2),
  v("liste, Errant", "lerrant", LISTE_V2),
  v("liste, Religieuse", "la-religieuse", LISTE_V2),
  v("liste, Brise-Lames", "le-brise-lames", LISTE_V2),
  v("liste+doubles, Errant", "lerrant", doubles(LISTE_V2)),
  v("liste+doubles, Religieuse", "la-religieuse", doubles(LISTE_V2)),
  v("liste+Masque pioche, Errant", "lerrant", masquePioche(LISTE_V2)),
  v("liste+doubles+Masque pioche, Errant", "lerrant", masquePioche(doubles(LISTE_V2))),
  v("liste 3, Religieuse", "la-religieuse", LISTE_V3),
  v("liste 3, Errant", "lerrant", LISTE_V3),
  v("liste 3, Courlis", "le-courlis", LISTE_V3),
  v("liste 3+doubles, Religieuse", "la-religieuse", doubles(LISTE_V3)),
  v("liste 3+doubles, Courlis", "le-courlis", doubles(LISTE_V3)),
  v("liste 3 légère, Religieuse", "la-religieuse", LISTE_V3_LEGERE),
  v("liste 3 légère, Courlis", "le-courlis", LISTE_V3_LEGERE),
  v("liste 3 légère, Errant", "lerrant", LISTE_V3_LEGERE),
];
