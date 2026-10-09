import type { CardDefinition } from "@/game/cards/types";

/**
 * LOT 18 — Un Dead / Mort-vivant (Notion « Lot 18 — Un Dead / Mort-vivant »,
 * pool validé le 09/10/2026). Dix cartes autour du MARQUEUR MORT
 * (`game/cards/markers.ts`) :
 *
 *  - une unité qui porte un marqueur Mort est Mort-vivant, en plus de ses
 *    propres sous-types — c'est le pont entre familles ;
 *  - un seul marqueur Mort par unité ;
 *  - une unité marquée qui devrait rejoindre le Cimetière va SOUS la pioche
 *    de son propriétaire, et perd son marqueur : aucune boucle ;
 *  - le marqueur n'est posé que quand le texte d'une carte le dit.
 *
 * Toutes sont de l'archétype Un Dead (écrit en bas de la carte), et portent
 * le sous-type moteur `un-dead` comme les cartes du Lot 13 : les textes
 * existants (« une unité Un Dead », Doudou) les voient.
 */
export const LOT18_UN_DEAD = "lot-18-un-dead";

const UN_DEAD = "un-dead" as const;
const UNITES = ["marin", "creature"] as const;
const flat = (value: number) => ({ kind: "flat" as const, value });
/** « détruite » : pas un Sabordage (`DestructionCause`). */
const DETRUITE = ["combat", "effect", "tide"] as const;

function unDead(def: Omit<CardDefinition, "subtype" | "archetype" | "setCode">): CardDefinition {
  return { ...def, subtype: UN_DEAD, archetype: "un-dead", setCode: LOT18_UN_DEAD };
}

export const LOT18_SET: CardDefinition[] = [
  unDead({
    id: "coucou-cest-moi",
    name: "Coucou, c'est moi",
    type: "creature",
    subtypes: ["mort-vivant"],
    cost: 1,
    attack: 1,
    health: 1,
    maxCopies: 3,
    text:
      "Quand elle est détruite, si elle ne porte pas de marqueur Mort, ramenez-la du Cimetière sur le plateau à la fin " +
      "du tour, avec un marqueur Mort.",
    abilities: [
      {
        trigger: "onDeath",
        // « si elle ne porte pas de marqueur Mort » : marquée, elle part sous
        // la pioche au lieu du Cimetière (règle du marqueur), et le retour ne
        // la trouve pas — la condition se réalise d'elle-même.
        condition: { destroyedBy: [...DETRUITE] },
        description: "Détruite : elle revient du Cimetière à la fin du tour, avec un marqueur Mort.",
        effects: [{ type: "scheduleGraveyardReturn", target: { kind: "self" }, marker: "mort" }],
      },
    ],
  }),
  unDead({
    id: "on-joue-aux-morts",
    name: "On joue aux morts",
    type: "creature",
    subtypes: ["mort-vivant", "grenouille"],
    cost: 4,
    attack: 1,
    health: 3,
    maxCopies: 3,
    text:
      "À son arrivée, vous pouvez défausser autant de cartes que vous voulez. Si vous le faites, elle gagne +1 Puissance " +
      "pour chaque carte défaussée.",
    onPlayEffects: [
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "handSize" }, discardAtMost: true, refusable: true },
      // Le bonus reste tant qu'elle est en jeu (décision du 09/10/2026 : le texte ne donne pas de durée).
      { type: "buff", target: { kind: "self" }, attackAmount: { kind: "discardedCount", per: 1 }, healthAmount: flat(0), permanent: true },
    ],
  }),
  unDead({
    id: "pas-sans-moi",
    name: "Pas sans moi",
    type: "creature",
    subtypes: ["mort-vivant"],
    cost: 2,
    attack: 2,
    health: 2,
    maxCopies: 3,
    text:
      "La première fois à chaque tour qu'une de vos unités qui porte un marqueur Mort est détruite, infligez 1 dégât au " +
      "Navire adverse.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { withMarker: "mort", cardTypes: [...UNITES], destroyedBy: [...DETRUITE] },
        oncePerTurnKey: "pasSansMoi",
        description: "Une de vos unités marquées Mort est détruite : 1 dégât au Navire adverse.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: flat(1) }],
      },
    ],
  }),
  unDead({
    id: "chut-il-dort",
    name: "Chut, il dort",
    type: "anomalie",
    cost: 1,
    maxCopies: 3,
    permanent: false,
    text: "Placez un marqueur Mort sur une unité que vous contrôlez (hors Mort-vivant) qui n'en porte pas.",
    onPlayEffects: [
      {
        type: "addMarker",
        marker: "mort",
        target: { kind: "chosenUnit", among: { unitsOnly: true, notSubtype: "mort-vivant", withoutMarker: "mort" } },
      },
    ],
  }),
  unDead({
    id: "encore-une-histoire",
    name: "Encore une histoire",
    type: "objet",
    cost: 2,
    maxCopies: 2,
    text:
      "Brisez cet Objet : ramenez une unité de coût 2 ou moins d'un Cimetière sur le plateau, avec un marqueur Mort. " +
      "Elle ne peut pas attaquer ce tour.",
    onBreakEffects: [
      {
        // « d'UN Cimetière » : le sien ou celui de l'adversaire (décision du
        // 09/10/2026). Ramenée, l'unité arrive sur VOTRE plateau, sous votre
        // contrôle, avec le mal d'invocation : elle n'attaque pas ce tour.
        type: "pickFromGraveyard",
        target: { kind: "controllerPlayer" },
        graveyards: "both",
        filter: { cardTypes: [...UNITES], maxCost: 2 },
        takeTo: "board",
        marker: "mort",
        uses: 1,
      },
    ],
  }),
  unDead({
    id: "le-grand-frere",
    name: "Le Grand Frère",
    type: "marin",
    subtypes: ["mort-vivant"],
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text: "Vos unités qui portent un marqueur Mort gagnent +1 Puissance.",
    auraBuffMarkedUnits: { marker: "mort", attackAmount: 1 },
  }),
  unDead({
    id: "reveille-toi",
    name: "Réveille-toi",
    type: "anomalie",
    cost: 4,
    maxCopies: 2,
    permanent: false,
    text: "Ramenez une unité de coût 3 ou moins de votre Cimetière sur le plateau, avec un marqueur Mort.",
    onPlayEffects: [
      {
        type: "pickFromGraveyard",
        target: { kind: "controllerPlayer" },
        filter: { cardTypes: [...UNITES], maxCost: 3 },
        takeTo: "board",
        marker: "mort",
        uses: 1,
      },
    ],
  }),
  unDead({
    id: "le-cerf-volant",
    name: "Le Cerf-volant",
    type: "equipement",
    cost: 2,
    health: 1,
    maxCopies: 3,
    // Une unité marquée Mort est Mort-vivant : elle peut le porter aussi.
    equipTargetSubtype: "mort-vivant",
    equipGrantsBuff: { attackAmount: 1, healthAmount: 1 },
    text:
      "Équipez un Mort-vivant que vous contrôlez. Il gagne +1 / +1. Quand il est détruit, piochez 1 carte puis " +
      "défaussez 1 carte.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { equippedUnit: true, destroyedBy: [...DETRUITE] },
        description: "Le porteur est détruit : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: flat(1) },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: flat(1) },
        ],
      },
    ],
  }),
  unDead({
    id: "le-gardien-des-jouets",
    name: "Le Gardien des Jouets",
    type: "marin",
    subtypes: ["mort-vivant"],
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 2,
    keywords: ["garde"],
    text: "Garde. Tant qu'au moins 2 de vos unités portent un marqueur Mort, il gagne +2 Puissance.",
    selfBuffWhileMarkedUnitsAtLeast: { marker: "mort", atLeast: 2, attackAmount: 2 },
  }),
  unDead({
    id: "ceux-den-bas",
    name: "Ceux d'en bas",
    type: "structure",
    cost: 4,
    health: 5,
    maxCopies: 2,
    durationTurns: 4,
    text:
      "Durée : 4 tours de table. La première fois à chaque tour qu'une unité arrive sur votre plateau avec un marqueur " +
      "Mort, piochez 1 carte.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { withMarker: "mort", cardTypes: [...UNITES] },
        oncePerTurnKey: "ceuxDenBas",
        description: "Une unité arrive sur votre plateau avec un marqueur Mort : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  }),
];
