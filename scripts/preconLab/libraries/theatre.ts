import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { DECK_LE_THEATRE_ENGLOUTI } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * LE THÉÂTRE ENGLOUTI — le moteur de rappel a-t-il de quoi rappeler ?
 *
 * Constat du 29/09/2026 : quatorze cartes renvoient une Marionnette en main,
 * deux seulement (Il Dottore) ont une arrivée qui vaut d'être rejouée ;
 * Pulcinella et Arlequin Raccommodeur portent leur effet sur la MORT, que le
 * rappel efface. Variantes mesurées contre le rayon :
 *
 *   npx tsx scripts/preconLab/lab.ts --setup scripts/preconLab/libraries/theatre.ts \
 *     --lib scripts/preconLab/libraries/theatre.ts --field scripts/preconLab/libraries/lot15.ts \
 *     --games 40
 *
 * Importé comme `--setup`, ce module enregistre des cartes `lab-…` dans
 * `CARD_DATABASE` : elles n'existent que le temps de la mesure, jamais dans
 * le jeu ni en base.
 */

const base = (id: string) => getCardDefinition(id);

/** Même carte, effet d'arrivée au lieu de l'effet de mort. */
const VARIANTES: CardDefinition[] = [
  {
    ...base("pulcinella-gonfle"),
    id: "lab-pulcinella-arrivee",
    text: "À son arrivée, vous pouvez choisir une Créature adverse : infligez-lui 1 dégât.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Arrivée : 1 dégât à une créature ennemie.",
        effects: [
          {
            type: "damage",
            target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["creature"] } },
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    ...base("arlequin-raccommodeur"),
    id: "lab-arlequin-arrivee",
    text: "À son arrivée, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onEnterPlay",
        description: "Arrivée : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
];

const db = CARD_DATABASE as Map<string, CardDefinition>;
for (const carte of VARIANTES) db.set(carte.id, carte);

const T = DECK_LE_THEATRE_ENGLOUTI;
const remplace = (ids: readonly string[], de: string, par: string) => ids.map((id) => (id === de ? par : id));
const sans = (ids: readonly string[], retirer: Record<string, number>) => {
  const reste = { ...retirer };
  return ids.filter((id) => (reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true);
};

/** Liste : les rappels les moins joués cèdent la place à trois Marionnettes. */
const LISTE = [
  ...sans(T.cardIds, { "corde-de-rappel": 2, "le-rideau-se-leve": 1 }),
  "arlecchino-celui-derriere-le-masque-abyssal",
  "la-prima-noyee-abyssal",
  "le-regisseur-des-profondeurs-abyssal",
];
const arrivees = (ids: readonly string[]) =>
  remplace(remplace(ids, "pulcinella-gonfle", "lab-pulcinella-arrivee"), "arlequin-raccommodeur", "lab-arlequin-arrivee");

export const LIBRARY: DeckList[] = [
  { ...T, id: "lab-theatre-actuel", name: "Théâtre [actuel]" },
  { ...T, id: "lab-theatre-liste", name: "Théâtre [liste]", cardIds: LISTE },
  { ...T, id: "lab-theatre-arrivees", name: "Théâtre [arrivées]", cardIds: arrivees(T.cardIds) },
  { ...T, id: "lab-theatre-les-deux", name: "Théâtre [liste + arrivées]", cardIds: arrivees(LISTE) },
];
