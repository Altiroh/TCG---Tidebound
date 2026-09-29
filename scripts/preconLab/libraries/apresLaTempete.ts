import { SHIP_DATABASE } from "@/game/environment/shipData";
import type { ShipDefinition } from "@/game/environment/types";
import { DECK_APRES_LA_TEMPETE } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * APRÈS LA TEMPÊTE — un contrôle sans plateau, sur la coque la plus
 * fragile (29/09/2026).
 *
 * Audit : sept cartes attendent que l'adversaire contrôle au moins quatre
 * unités, ce qui n'arrive que dans ~9 % des tours (Panique sur le Pont
 * jouée 6 % des fois où elle est en main, Chacun sa Place 1 %, Abandonnez
 * le Navire 0 %) ; neuf unités seulement, et les meilleurs Δ sont des
 * corps (Crabe de Fer +20, L'Amiral +19). Le Courlis — 26 Ancrage, 4 Slots
 * — est le Navire qui a coûté le plus à chaque deck mesuré. Variantes de
 * LISTE et de COQUE, dont deux Courlis renforcés (`lab-…`, enregistrés
 * seulement le temps de la mesure). « liste 2 » (47 %, contre 20 %) est
 * devenue le préconstruit le 29/09/2026, sur Le Courlis actuel ; sur un
 * Courlis à 30 Ancrage elle monte à 55 % :
 *
 *   npx tsx scripts/preconLab/lab.ts --setup scripts/preconLab/libraries/apresLaTempete.ts \
 *     --lib scripts/preconLab/libraries/apresLaTempete.ts --field scripts/preconLab/libraries/lot15.ts --games 60
 */

const table = SHIP_DATABASE as Map<string, ShipDefinition>;
const courlis = SHIP_DATABASE.get("le-courlis")!;
for (const ship of [
  { ...courlis, id: "lab-courlis-5-slots", name: "Courlis 5 Slots", slotCount: 5 },
  { ...courlis, id: "lab-courlis-30", name: "Courlis 30 Ancrage", startingAnchor: 30 },
  { ...courlis, id: "lab-courlis-5-slots-30", name: "Courlis 5 Slots 30 Ancrage", slotCount: 5, startingAnchor: 30 },
]) table.set(ship.id, ship);

/** La liste d'AVANT la révision, figée ici pour que la mesure se rejoue. */
const A: DeckList = {
  ...DECK_APRES_LA_TEMPETE,
  cardIds: Object.entries({
    "le-pont-est-plein": 2,
    "panique-sur-le-pont": 2,
    "vague-scelerate": 2,
    "chacun-sa-place": 1,
    "le-large-se-fache": 1,
    "abandonnez-le-navire": 1,
    "la-mer-reprend-tout": 1,
    "la-nasse-trop-pleine": 2,
    "jugement-du-phare": 1,
    "derniere-barricade": 2,
    "cage-de-flottaison": 2,
    "crabe-de-fer": 3,
    "chirurgien-du-bord": 2,
    "trousse-du-bord": 2,
    "un-peu-de-repit": 3,
    "dernieres-reserves": 3,
    "faire-linventaire": 3,
    "journal-de-bord": 2,
    "le-brise-ligne": 2,
    "lamiral-sans-pavillon": 1,
    "leviathan-balafre": 1,
    "dernier-jour-en-mer": 1,
  }).flatMap(([id, n]) => Array<string>(n).fill(id)),
};

function variante(nom: string, retirer: Record<string, number>, ajouter: Record<string, number>, base: DeckList = A): DeckList {
  const reste = { ...retirer };
  const ids = base.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== base.cardIds.length) throw new Error(`${nom} : ${ids.length} cartes`);
  return { ...base, id: `lab-tempete-${nom}`, name: `Tempête [${nom}]`, cardIds: ids };
}

/** Ce qui attend quatre unités adverses. */
const SEUIL_QUATRE = { "panique-sur-le-pont": 2, "chacun-sa-place": 1, "abandonnez-le-navire": 1, "la-nasse-trop-pleine": 2 };
/** Des corps qui survivent aux balais du deck (Vague Scélérate, Le Large se Fâche). */
const SURVIVANTS = { "baleine-aux-cicatrices-blanches": 2, "carape-hus": 3, "capitaine-du-dernier-retour": 1 };

const liste = variante("liste", SEUIL_QUATRE, SURVIVANTS);
/** Plus loin : la pioche conditionnelle et le Journal (7 Structures) cèdent la place à des corps. */
const liste2 = variante("liste 2", { "journal-de-bord": 2, "dernieres-reserves": 2 }, { "chose-des-hauts-fonds": 2, "capitaine-du-dernier-retour": 1, "matelot-du-sans-nom": 1 }, liste);

const sur = (deck: DeckList, shipId: string, etiquette: string): DeckList => ({
  ...deck,
  id: `${deck.id}@${shipId}`,
  name: deck.name.replace("]", `, ${etiquette}]`),
  shipId,
});

export const LIBRARY: DeckList[] = [
  { ...A, id: "lab-tempete-avant", name: "Tempête [avant le 29/09]" },
  liste,
  sur(liste, "lab-courlis-5-slots", "Courlis 5 Slots"),
  sur(liste, "lab-courlis-30", "Courlis 30 Ancrage"),
  sur(liste, "lab-courlis-5-slots-30", "Courlis 5 Slots 30 Ancrage"),
  sur(liste, "le-brise-lames", "Brise-Lames"),
  sur(liste, "la-religieuse", "Religieuse"),
  liste2,
  sur(liste2, "lab-courlis-5-slots", "Courlis 5 Slots"),
  sur(liste2, "lab-courlis-30", "Courlis 30 Ancrage"),
];
