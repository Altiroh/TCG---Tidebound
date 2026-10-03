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

/**
 * Même carte, effet d'arrivée EN PLUS de l'effet de mort (« À son arrivée
 * et quand il est détruit… ») : la retouche la plus légère, qui garde le
 * texte d'origine et donne quelque chose à rejouer.
 */
function double(id: string, labId: string, text: string): CardDefinition {
  const carte = base(id);
  const mort = (carte.abilities ?? []).find((a) => a.trigger === "onDeath")!;
  return { ...carte, id: labId, text, abilities: [{ ...mort, trigger: "onEnterPlay" }, mort] };
}
VARIANTES.push(
  double(
    "pulcinella-gonfle",
    "lab-pulcinella-double",
    "À son arrivée et quand il est détruit, vous pouvez choisir une Créature adverse : infligez-lui 1 dégât."
  ),
  double("arlequin-raccommodeur", "lab-arlequin-double", "À son arrivée et quand il est détruit, récupérez 1 Ancrage."),
);

/** Le rappel ne coûte plus de carte : Le Masque Fendu pioche sans défausser. */
const masque = base("le-masque-fendu");
VARIANTES.push({
  ...masque,
  id: "lab-masque-pioche",
  text: "Brisez cet Objet : renvoyez une unité Marionnette que vous contrôlez dans votre main, puis piochez 1 carte.",
  onBreakEffects: (masque.onBreakEffects ?? []).filter((effect) => effect.type !== "discard"),
});

const db = CARD_DATABASE as Map<string, CardDefinition>;
for (const carte of VARIANTES) db.set(carte.id, carte);

/** La liste et le Navire d'AVANT la révision du 29/09/2026, figés ici pour que les mesures se rejouent. */
const T: DeckList = {
  ...DECK_LE_THEATRE_ENGLOUTI,
  shipId: "le-courlis",
  cardIds: Object.entries({
    "pulcinella-gonfle": 3,
    "arlecchino-des-profondeurs": 3,
    "arlequin-raccommodeur": 3,
    "pantalone-sans-sou": 3,
    "la-prima-noyee": 3,
    "colombina-aux-cent-visages": 2,
    "il-dottore-des-noyes": 2,
    "il-capitano-naufrage": 2,
    "le-regisseur-sans-visage": 1,
    "le-masque-fendu": 3,
    "la-clochette-du-rappel": 3,
    "changement-de-role": 2,
    "rappel-du-public": 2,
    "les-coulisses-inondees": 2,
    "le-theatre-englouti": 1,
    "le-rideau-se-leve": 1,
    "corde-de-rappel": 2,
    "chaine-de-travers": 2,
  }).flatMap(([id, n]) => Array<string>(n).fill(id)),
};
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

/**
 * SECONDE PASSE (29/09/2026, après la révision des quatre decks du bas) :
 * la liste de l'audit — les rappels morts (Corde, Rideau, Rappel du
 * Public) cèdent la place aux Marionnettes abyssales, à un troisième
 * Coulisses et à la Trappe du Souffleur — essayée sous plusieurs coques,
 * avec et sans la retouche « à son arrivée ET quand il est détruit ».
 * Bibliothèque : `theatreNavires.ts`.
 */
export const LISTE_V2: string[] = [
  ...sans(T.cardIds, { "corde-de-rappel": 2, "le-rideau-se-leve": 1, "rappel-du-public": 2 }),
  "arlecchino-celui-derriere-le-masque-abyssal",
  "la-prima-noyee-abyssal",
  "les-coulisses-inondees",
  "trappe-du-souffleur",
  "trappe-du-souffleur",
];
/**
 * TROISIÈME LISTE : les pièces de soutien qui font perdre (Coulisses Δ −9,
 * Théâtre Englouti −6, Changement de rôle −3) cèdent la place au Régisseur
 * abyssal et à des corps. Le rappel reste : Masques, Clochettes, Trappes,
 * Arlecchinos, Régisseurs.
 */
export const LISTE_V3: string[] = [
  ...sans(LISTE_V2, { "les-coulisses-inondees": 3, "le-theatre-englouti": 1, "changement-de-role": 2 }),
  "le-regisseur-des-profondeurs-abyssal",
  "matelot-du-sans-nom",
  "matelot-du-sans-nom",
  "matelot-du-sans-nom",
  "chose-des-hauts-fonds",
  "chose-des-hauts-fonds",
];
/** La même, plus légère : deux corps de moins, un Coulisses et un Changement de rôle rendus. */
export const LISTE_V3_LEGERE: string[] = [
  ...sans(LISTE_V3, { "chose-des-hauts-fonds": 2 }),
  "les-coulisses-inondees",
  "changement-de-role",
];
export const doubles = (ids: readonly string[]) =>
  remplace(remplace(ids, "pulcinella-gonfle", "lab-pulcinella-double"), "arlequin-raccommodeur", "lab-arlequin-double");
export const masquePioche = (ids: readonly string[]) => remplace(ids, "le-masque-fendu", "lab-masque-pioche");
export const THEATRE_AVANT = T;
