import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { DECK_A_BOUT_DE_RAISON } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * À BOUT DE RAISON — un drain sans récompense (29/09/2026).
 *
 * Audit : le deck vide la Raison adverse, mais la « main injouable »
 * n'existe pas en règles — sans plancher, l'adversaire s'endette et joue
 * quand même — et aucune carte ne lit la Raison ADVERSE. Mousse du Premier
 * Quart va même contre le plan (elle ne rend que si VOUS êtes plus bas).
 * Variantes de LISTE, de NAVIRE, et une variante de TEXTE : Marin aux
 * Yeux Rouges punit la dette qu'il creuse. « liste, L'Errant » (54 %,
 * contre 19 %) est devenue le préconstruit le 29/09/2026. Le texte
 * ajoutait 5 à 7 points (59 % sous L'Errant) : proposé, pas appliqué.
 *
 *   npx tsx scripts/preconLab/lab.ts --setup scripts/preconLab/libraries/boutDeRaison.ts \
 *     --lib scripts/preconLab/libraries/boutDeRaison.ts --field scripts/preconLab/libraries/lot15.ts --games 60
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const marin = getCardDefinition("marin-aux-yeux-rouges");
db.set("lab-marin-dette", {
  ...marin,
  id: "lab-marin-dette",
  text: "À son arrivée, l'adversaire perd 1 Raison. S'il a alors 0 Raison ou moins, il perd aussi 1 Ancrage.",
  onPlayEffects: [
    ...(marin.onPlayEffects ?? []),
    { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 }, conditionOpponentReasonAtMost: 0 },
  ],
});

/** La liste et le Navire d'AVANT la révision, figés ici pour que la mesure se rejoue. */
const R: DeckList = {
  ...DECK_A_BOUT_DE_RAISON,
  shipId: "le-courlis",
  cardIds: Object.entries({
    "marin-aux-yeux-rouges": 3,
    "marin-aux-yeux-rouges-abyssal": 1,
    "anguille-des-profondeurs": 3,
    "le-fond-vous-regarde": 1,
    "mousse-du-premier-quart": 3,
    "murene-aveugle": 3,
    "requin-balafre": 3,
    "matelot-insomniaque": 3,
    "fausse-cargaison": 2,
    "chaine-de-travers": 2,
    "par-dessus-bord": 3,
  }).flatMap(([id, n]) => Array<string>(n).fill(id)),
};

function variante(nom: string, retirer: Record<string, number>, ajouter: Record<string, number>, base: DeckList = R): DeckList {
  const reste = { ...retirer };
  const ids = base.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== base.cardIds.length) throw new Error(`${nom} : ${ids.length} cartes`);
  return { ...base, id: `lab-raison-${nom}`, name: `Raison [${nom}]`, cardIds: ids };
}

/** Contre le plan (Mousse), hors sujet (Guetteur, Bouée, Fausse Cargaison), symétriques ou trop chères (Chant, Fond). */
const HORS_PLAN = {
  "mousse-du-premier-quart": 3,
  "fausse-cargaison": 2,
  "le-fond-vous-regarde": 1,
};
/** Des corps qui drainent ou qui vivent bas en Raison, et un drain qui punit les grands plateaux. */
const DANS_LE_PLAN = {
  "si-raie-ponce": 3,
  "matelot-du-sans-nom": 3,
  "vieux-loup-de-mer": 2,
  "le-role-dequipage": 2,
};

const liste = variante("liste", HORS_PLAN, DANS_LE_PLAN);
const texte = variante("liste+Marin dette (texte)", { "marin-aux-yeux-rouges": 3 }, { "lab-marin-dette": 3 }, liste);

export const LIBRARY: DeckList[] = [
  { ...R, id: "lab-raison-avant", name: "Raison [avant le 29/09]" },
  liste,
  { ...liste, id: "lab-raison-liste-errant", name: "Raison [liste, L'Errant]", shipId: "lerrant" },
  texte,
  { ...texte, id: "lab-raison-texte-errant", name: "Raison [liste+texte, L'Errant]", shipId: "lerrant" },
];
