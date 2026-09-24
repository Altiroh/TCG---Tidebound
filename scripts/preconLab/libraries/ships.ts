import { SHIP_DATABASE } from "@/game/environment/shipData";
import type { ShipDefinition } from "@/game/environment/types";
import type { DeckList } from "@/game/cards/decks/types";
import { LIBRARY as RAYON } from "@/scripts/preconLab/libraries/lot15";

/**
 * BALAYAGE DES NAVIRES — chaque liste du rayon rejouée sous chaque coque,
 * contre le rayon tel qu'il est (`--field libraries/lot15.ts`) :
 *
 *   npx tsx scripts/preconLab/lab.ts --setup scripts/preconLab/libraries/ships.ts \
 *     --lib scripts/preconLab/libraries/ships.ts --field scripts/preconLab/libraries/lot15.ts \
 *     --games 6 --bot difficile --brief
 *
 * Importé comme `--setup`, ce module enregistre les VARIANTES de Navire
 * (identifiants `lab-…`) dans `SHIP_DATABASE` : elles n'existent que le
 * temps de la mesure, jamais dans le jeu. `LAB_SHIPS=a,b` restreint les
 * coques mesurées, `LAB_DECKS=a,b` les listes (noms exacts).
 */

const base = (id: string) => SHIP_DATABASE.get(id)!;
const courlis = base("le-courlis");
const verre = base("la-verriere");

const VARIANTES: ShipDefinition[] = [
  { ...courlis, id: "lab-courlis-30", name: "Courlis 30 Ancrage", startingAnchor: 30 },
  { ...courlis, id: "lab-courlis-5", name: "Courlis 5 Slots", slotCount: 5 },
  { ...courlis, id: "lab-courlis-sans-coque", name: "Courlis sans Coque légère", directAttackWeakness: undefined, weaknessText: undefined },
  {
    ...verre,
    id: "lab-verre-gratuit",
    name: "Verre, Pique gratuite",
    activatableAbility: { ...verre.activatableAbility!, cost: {} },
  },
  {
    ...courlis,
    id: "lab-courlis-sans-coque-28",
    name: "Courlis sans Coque légère, 28 Ancrage",
    startingAnchor: 28,
    directAttackWeakness: undefined,
    weaknessText: undefined,
  },
  { ...verre, id: "lab-verre-28", name: "Verre 28 Ancrage", startingAnchor: 28 },
  {
    ...verre,
    id: "lab-verre-26",
    name: "Verre 26 Ancrage",
    startingAnchor: 26,
  },
];

const table = SHIP_DATABASE as Map<string, ShipDefinition>;
for (const ship of VARIANTES) table.set(ship.id, ship);

const COQUES = (process.env.LAB_SHIPS?.split(",") ?? [
  "lerrant",
  "le-courlis",
  "lab-courlis-30",
  "lab-courlis-5",
  "lab-courlis-sans-coque",
  "la-verriere",
  "lab-verre-gratuit",
  "lab-verre-26",
]).map((s) => s.trim());

const LISTES = process.env.LAB_DECKS?.split(",").map((s) => s.trim());

export const LIBRARY: DeckList[] = RAYON.filter((deck) => !LISTES || LISTES.includes(deck.name)).flatMap((deck) =>
  COQUES.map((shipId) => ({ ...deck, id: `${deck.id}@${shipId}`, name: `${deck.name} @ ${shipId}`, shipId }))
);
