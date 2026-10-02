import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { DECK_DESCENTE_AUX_ABYSSES } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * DESCENTE AUX ABYSSES — des cartes qui attendent un état qui ne vient pas
 * (29/09/2026).
 *
 * Audit : les Abysses durent UN tour de table, environ une fois par partie.
 * Les cartes « seulement pendant Abysses » restent en main (L'Œil Sous la
 * Mer joué à 26 % quand il est vu, Ce que la Marée Rend à 14 %), et les
 * outils qui n'agissent que par Sabordage (Compas, Horloge) ont le pire
 * Δ du deck. Les corps qui n'attendent rien (Ce Qui Suit, Raie, Anguille)
 * sont ceux qui gagnent. Variantes de LISTE, plus une variante de TEXTE
 * pour information (Anguille et Raie actives « pendant Tempête ou
 * Abysses », comme Bat-Marin). « corps de Marée » (49 %, contre 22 %) est
 * devenue la liste du préconstruit le 29/09/2026 ; « corps+Tempête »
 * (62 %) dépassait la cible, et le texte n'apportait qu'un à deux points :
 *
 *   npx tsx scripts/preconLab/lab.ts --setup scripts/preconLab/libraries/abysses.ts \
 *     --lib scripts/preconLab/libraries/abysses.ts --field scripts/preconLab/libraries/lot15.ts --games 60
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const anguille = getCardDefinition("anguille-des-profondeurs");
const raie = getCardDefinition("raie-des-fosses");
db.set("lab-anguille-tempete", {
  ...anguille,
  id: "lab-anguille-tempete",
  text: "Pendant Tempête ou Abysses, lorsqu'elle inflige des dégâts directs au Navire adverse, celui-ci perd aussi 1 Raison.",
  opponentReasonLossOnDirectAttack: { amount: 1, tideStateIn: ["tempete", "abysses"] },
});
db.set("lab-raie-tempete", {
  ...raie,
  id: "lab-raie-tempete",
  text: "Pendant Tempête ou Abysses, elle peut attaquer le Navire adverse même si celui-ci est protégé par une carte avec Garde.",
  bypassesGardeTideStateIn: ["tempete", "abysses"],
});

/** La liste d'AVANT la révision, figée ici pour que la mesure se rejoue. */
const A: DeckList = {
  ...DECK_DESCENTE_AUX_ABYSSES,
  cardIds: Object.entries({
    "anguille-des-profondeurs": 3,
    "raie-des-fosses": 2,
    "sondeur-des-mauvaises-eaux": 2,
    "regulateur-de-courant": 3,
    "balise-des-profondeurs": 2,
    "compas-aux-aiguilles-noires": 2,
    "horloge-de-maree": 1,
    "cloche-du-grand-fond": 1,
    "la-gueule-sous-la-mer": 1,
    "sept-brasses-plus-bas": 1,
    "ce-que-la-maree-rend": 2,
    "la-chose-qui-remonte": 2,
    "ce-qui-suit-le-navire": 2,
    "marin-aux-yeux-rouges-abyssal": 1,
    "bat-marin-abyssal": 1,
    "revenante-de-la-fosse-abyssal": 1,
    "pont-mine": 2,
  }).flatMap(([id, n]) => Array<string>(n).fill(id)),
};

function variante(nom: string, retirer: Record<string, number>, ajouter: Record<string, number>, base: DeckList = A): DeckList {
  const reste = { ...retirer };
  const ids = base.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== base.cardIds.length) throw new Error(`${nom} : ${ids.length} cartes`);
  return { ...base, id: `lab-abysses-${nom}`, name: `Abysses [${nom}]`, cardIds: ids };
}

/** Ce qui attend les Abysses, et les outils qui n'agissent que par Sabordage. */
const EN_ATTENTE = {
  "ce-que-la-maree-rend": 2,
  "cloche-du-grand-fond": 1,
  "sept-brasses-plus-bas": 1,
  "horloge-de-maree": 1,
  "compas-aux-aiguilles-noires": 2,
};
/** Des corps de Marée : utiles tout de suite, meilleurs quand la mer descend. */
const CORPS_DE_MAREE = {
  "masse-sombre": 3,
  "si-raie-ponce": 2,
  "ce-qui-suit-le-navire": 1,
  "bat-marin": 1,
};

const corps = variante("corps de Marée", EN_ATTENTE, CORPS_DE_MAREE);
const tempete = variante("corps+Tempête", { "balise-des-profondeurs": 2, "pont-mine": 2 }, { "second-au-visage-pale": 2, "albatros-de-mauvais-temps": 2 }, corps);

export const LIBRARY: DeckList[] = [
  { ...A, id: "lab-abysses-avant", name: "Abysses [avant le 29/09]" },
  corps,
  tempete,
  variante("corps (texte Anguille/Raie)", { "anguille-des-profondeurs": 3, "raie-des-fosses": 2 }, { "lab-anguille-tempete": 3, "lab-raie-tempete": 2 }, corps),
  variante("corps+Tempête (texte)", { "anguille-des-profondeurs": 3, "raie-des-fosses": 2 }, { "lab-anguille-tempete": 3, "lab-raie-tempete": 2 }, tempete),
];
