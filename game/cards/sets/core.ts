import type { CardDefinition } from "@/game/cards/types";

/**
 * Set de base ("Core"). Toutes les cartes sont exprimées en données pures :
 * pas de code spécifique à une carte dans le moteur. Étendre le jeu avec
 * une nouvelle extension consiste à ajouter un nouveau fichier `sets/*.ts`
 * exportant des `CardDefinition[]`, jamais à modifier `/game`.
 *
 * NOTE — "Calme", "Houle", "Tempête" et "Abysses" sont des termes réservés
 * à l'état de Marée (cadrage section 6). Une carte peut y faire référence
 * dans son texte, mais son NOM ne devrait pas les réutiliser pour un
 * effet sans rapport, sous peine de confusion à la table.
 */
export const CORE_SET: CardDefinition[] = [
  // --- Unités ---------------------------------------------------------
  {
    id: "recrue-des-marees",
    name: "Recrue des Marées",
    type: "creature",
    cost: 1,
    attack: 1,
    health: 1,
    text: "Une simple recrue, rapide à déployer.",
  },
  {
    id: "lancier-cotier",
    name: "Lancier Côtier",
    type: "creature",
    cost: 2,
    attack: 2,
    health: 2,
  },
  {
    id: "veterane-des-brisants",
    name: "Vétérane des Brisants",
    type: "creature",
    cost: 3,
    attack: 3,
    health: 2,
    text: "À l'arrivée : piochez une carte.",
    onPlayEffects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    id: "chaman-des-courants",
    name: "Chaman des Courants",
    type: "marin",
    cost: 3,
    attack: 2,
    health: 4,
    text: "Au début de votre tour : soignez 1 point d'Ancrage.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "Soigne 1 point d'Ancrage au contrôleur à chaque début de tour.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "sentinelle-du-recif",
    name: "Sentinelle du Récif",
    type: "marin",
    cost: 2,
    attack: 1,
    health: 4,
    tags: ["equipage"],
    keywords: ["garde"],
    text: "Garde. À la mort : infligez 1 dégât au joueur adverse.",
    abilities: [
      {
        trigger: "onDeath",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "predateur-des-vagues",
    name: "Prédateur des Vagues",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 3,
  },
  {
    id: "leviathan-abyssal",
    name: "Léviathan Abyssal",
    type: "creature",
    cost: 6,
    attack: 6,
    health: 6,
    tags: ["abyssal", "creature"],
    text: "Une menace venue des profondeurs.",
  },
  {
    id: "elementaire-deau",
    name: "Élémentaire d'Eau",
    type: "creature",
    cost: 2,
    attack: 2,
    health: 2,
    text: "Invoqué par d'autres effets, absent des decks de base.",
  },
  {
    id: "poisson-lanterne",
    name: "Poisson-Lanterne",
    type: "creature",
    cost: 2,
    attack: 1,
    health: 2,
    tags: ["creature"],
    text:
      "Sa puissance suit la Marée : 1/2 en Calme, 2/2 en Houle, 3/3 en Tempête, 3/4 en Abysses. " +
      "Quand les Abysses commencent, piochez une carte.",
    tideAffinity: {
      calme: { attack: 1, health: 2 },
      houle: { attack: 2, health: 2 },
      tempete: { attack: 3, health: 3 },
      abysses: { attack: 3, health: 4 },
    },
    abilities: [
      {
        trigger: "onTideStateEntered",
        condition: { tideState: "abysses" },
        description: "Quand les Abysses commencent, piochez une carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "vigie-fragile",
    name: "Vigie Fragile",
    type: "marin",
    cost: 1,
    attack: 1,
    health: 2,
    tags: ["equipage"],
    text: "Inactive pendant la Tempête. Détruite quand les Abysses commencent.",
    tideAffinity: {
      tempete: { inactive: true },
      abysses: { destroyed: true },
    },
  },
  {
    id: "guetteur-des-brumes",
    name: "Guetteur des Brumes",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 2,
    tags: ["brume", "equipage"],
    text: "Renforcé dans la Mer des Brumes.",
  },
  {
    id: "sonar-de-fortune",
    name: "Sonar de Fortune",
    type: "equipement",
    permanent: true,
    cost: 2,
    tags: ["equipement"],
    text: "Un dispositif rudimentaire, mais fiable. Moins cher dans les Récifs Rouges.",
  },

  // --- Sorts ------------------------------------------------------------
  {
    id: "eclat-de-givre",
    name: "Éclat de Givre",
    type: "action",
    cost: 1,
    text: "Inflige 1 dégât à une unité ciblée.",
    onPlayEffects: [{ type: "damage", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    id: "vague-destructrice",
    name: "Vague Destructrice",
    type: "action",
    cost: 2,
    text: "Inflige 3 dégâts à une unité ciblée.",
    onPlayEffects: [{ type: "damage", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 3 } }],
  },
  {
    id: "benediction-des-flots",
    name: "Bénédiction des Flots",
    type: "action",
    cost: 2,
    text: "Rendez 4 points de vie.",
    onPlayEffects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 4 } }],
  },
  {
    id: "marque-des-abysses",
    name: "Marque Corruptrice",
    type: "action",
    cost: 1,
    text: "Une unité ciblée perd 2 points d'attaque ce tour.",
    onPlayEffects: [{ type: "debuff", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 2 } }],
  },
  {
    id: "appel-du-large",
    name: "Appel du Large",
    type: "action",
    cost: 2,
    text: "Piochez 2 cartes.",
    onPlayEffects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
  },
  {
    id: "renfort-imprevu",
    name: "Renfort Imprévu",
    type: "action",
    cost: 3,
    text: "Invoquez un Élémentaire d'Eau (2/2).",
    onPlayEffects: [
      { type: "summon", target: { kind: "controllerPlayer" }, cardId: "elementaire-deau" },
    ],
  },
  {
    id: "rugissement-de-la-maree",
    name: "Rugissement de la Marée",
    type: "action",
    cost: 3,
    text: "Vos unités gagnent +1/+1 ce tour.",
    onPlayEffects: [{ type: "buff", target: { kind: "allAllyUnits" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    id: "tempete-cotiere",
    name: "Rafale Cinglante",
    type: "action",
    cost: 4,
    text: "Inflige 2 dégâts à toutes les unités ennemies.",
    onPlayEffects: [{ type: "damage", target: { kind: "allEnemyUnits" }, amount: { kind: "flat", value: 2 } }],
  },

  // --- Sorts liés à la Marée et aux Eaux (cadrage sections 8, 13) -------
  {
    id: "voiles-affalees",
    name: "Voiles Affalées",
    type: "action",
    cost: 1,
    text: "Ignorez la prochaine perte d'Ancrage provoquée par la Tempête.",
    onPlayEffects: [
      { type: "ignoreNextTideDamage", target: { kind: "controllerPlayer" }, tideState: "tempete" },
    ],
  },
  {
    id: "bouchons-de-cire",
    name: "Bouchons de Cire",
    type: "action",
    cost: 2,
    text: "Ignorez la prochaine perte d'Ancrage provoquée par les Abysses.",
    onPlayEffects: [
      { type: "ignoreNextTideDamage", target: { kind: "controllerPlayer" }, tideState: "abysses" },
    ],
  },
  {
    id: "front-depressionnaire",
    name: "Front Dépressionnaire",
    type: "action",
    cost: 1,
    text: "Lors de la prochaine entrée en Tempête ou en Abysses, ses dégâts sont doublés pour tout le monde.",
    onPlayEffects: [{ type: "tideAmplifyNext", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    id: "maree-precipitee",
    name: "Marée Précipitée",
    type: "action",
    cost: 1,
    text: "Réduisez de 2 tours la durée restante de l'état de Marée courant.",
    onPlayEffects: [
      { type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 2 } },
    ],
  },
  {
    id: "reflux",
    name: "Reflux",
    type: "action",
    cost: 2,
    text: "Prolongez d'1 tour la durée restante de l'état de Marée courant.",
    onPlayEffects: [
      { type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "courant-de-verre",
    name: "Courant de Verre",
    type: "action",
    cost: 2,
    text: "Remplacez les Eaux actuelles par la Mer de Verre.",
    onPlayEffects: [{ type: "changeWater", target: { kind: "allPlayers" }, waterId: "mer-de-verre" }],
  },
];

export const CARD_DATABASE: ReadonlyMap<string, CardDefinition> = new Map(
  CORE_SET.map((card) => [card.id, card])
);

export function getCardDefinition(cardId: string): CardDefinition {
  const def = CARD_DATABASE.get(cardId);
  if (!def) {
    throw new Error(`Carte inconnue: ${cardId}`);
  }
  return def;
}
