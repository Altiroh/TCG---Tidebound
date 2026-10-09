import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * LOT 18 — Un Dead / Mort-vivant (Notion « Lot 18 — Un Dead / Mort-vivant »,
 * pool validé le 09/10/2026, RÉÉCRIT le 10/10/2026).
 *
 * La première version récompensait « vos unités qui portent un marqueur
 * Mort » — or un Mort-vivant n'en porte jamais (décision du 10/10/2026,
 * `MARKER_RULES.mort.refusedOnSubtype`) : dans un deck Un Dead, ces cartes
 * ne faisaient presque rien. Le pool tient désormais sur trois piliers :
 *
 *  - LA MORT NOURRIT LA MEUTE : un Mort-vivant détruit, Sabordé ou défaussé
 *    déclenche quelque chose — la défausse est un carburant, plus une perte ;
 *  - LE DRAIN : frapper rend de l'Ancrage (Le Cerf-volant, Pas sans moi) ;
 *  - LE MARQUEUR CONTAMINE : il fait entrer une unité d'une AUTRE famille
 *    dans la meute (Chut, il dort ; un mort ramené par Encore une histoire
 *    ou Réveille-toi). Aucune carte ne compte plus sur lui pour marcher.
 *
 * Rappel de la règle du marqueur (`game/cards/markers.ts`) : une unité qui
 * le porte est Mort-vivant ; un seul par unité ; marquée, elle va SOUS la
 * pioche au lieu du Cimetière, et le perd ; il n'est posé que quand le texte
 * d'une carte le dit.
 *
 * Toutes sont de l'archétype Un Dead (écrit en bas de la carte), et portent
 * le sous-type moteur `un-dead` comme les cartes du Lot 13 : les textes
 * existants (« une unité Un Dead », Doudou) les voient.
 */
export const LOT18_UN_DEAD = "lot-18-un-dead";

const UN_DEAD = "un-dead" as const;
const MORT_VIVANT = "mort-vivant" as const;
const UNITES = ["marin", "creature"] as const;
const flat = (value: number) => ({ kind: "flat" as const, value });
/** « détruite » : pas un Sabordage (`DestructionCause`). */
const DETRUITE = ["combat", "effect", "tide"] as const;

function unDead(def: Omit<CardDefinition, "subtype" | "archetype" | "setCode">): CardDefinition {
  return { ...def, subtype: UN_DEAD, archetype: "un-dead", setCode: LOT18_UN_DEAD };
}

/**
 * « La première fois à chaque tour qu'une autre de vos unités Mort-vivant est
 * détruite ou Sabordée, ou qu'une de vos cartes Mort-vivant est défaussée » :
 * deux voies, UNE clé de suivi (`oncePerTurnFlags` est porté par la carte,
 * donc la même clé fait « une fois par tour » au total, pas une fois par voie).
 */
function meuteQuiTombe(key: string, description: string, effects: EffectDefinition[]): TriggeredAbility[] {
  return [
    {
      trigger: "onDeath" as const,
      triggeredBy: { subtype: MORT_VIVANT, cardTypes: [...UNITES] },
      oncePerTurnKey: key,
      description: `Un autre Mort-vivant meurt : ${description}`,
      effects,
    },
    {
      trigger: "onCardDiscardedFromHand" as const,
      triggeredBy: { subtype: MORT_VIVANT },
      oncePerTurnKey: key,
      description: `Un Mort-vivant est défaussé : ${description}`,
      effects,
    },
  ];
}

export const LOT18_SET: CardDefinition[] = [
  unDead({
    id: "coucou-cest-moi",
    name: "Coucou, c'est moi",
    type: "creature",
    subtypes: [MORT_VIVANT],
    cost: 1,
    attack: 1,
    health: 1,
    maxCopies: 3,
    text: "Quand elle est détruite ou Sabordée, ou défaussée, ramenez-la du Cimetière sur le plateau à la fin du tour.",
    // Elle ne revient qu'à la FIN du tour : une fois par tour au plus, sans
    // qu'il faille le suivre. Défaussée, elle arrive en jeu — c'est la carte
    // qui fait de la défausse un gain.
    abilities: [
      {
        trigger: "onDeath",
        description: "Elle meurt : elle revient du Cimetière à la fin du tour.",
        effects: [{ type: "scheduleGraveyardReturn", target: { kind: "self" } }],
      },
      {
        trigger: "onDiscarded",
        description: "Défaussée : elle revient du Cimetière à la fin du tour.",
        effects: [{ type: "scheduleGraveyardReturn", target: { kind: "self" } }],
      },
    ],
  }),
  unDead({
    id: "on-joue-aux-morts",
    name: "On joue aux morts",
    type: "creature",
    subtypes: [MORT_VIVANT, "grenouille"],
    cost: 4,
    attack: 1,
    health: 3,
    maxCopies: 3,
    text:
      "À son arrivée, vous pouvez défausser autant de cartes que vous voulez. Si vous le faites, elle gagne +1 / +1 " +
      "pour chaque carte défaussée.",
    onPlayEffects: [
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "handSize" }, discardAtMost: true, refusable: true },
      // Le bonus reste tant qu'elle est en jeu (décision du 09/10/2026 : le texte ne donne pas de durée).
      {
        type: "buff",
        target: { kind: "self" },
        attackAmount: { kind: "discardedCount", per: 1 },
        healthAmount: { kind: "discardedCount", per: 1 },
        permanent: true,
      },
    ],
  }),
  unDead({
    id: "pas-sans-moi",
    name: "Pas sans moi",
    type: "creature",
    subtypes: [MORT_VIVANT],
    cost: 2,
    attack: 2,
    health: 2,
    maxCopies: 3,
    text:
      "La première fois à chaque tour qu'une autre de vos unités Mort-vivant est détruite ou Sabordée, ou qu'une de " +
      "vos cartes Mort-vivant est défaussée, infligez 1 dégât au Navire adverse et récupérez 1 Ancrage.",
    abilities: meuteQuiTombe("pasSansMoi", "1 dégât au Navire adverse, récupérez 1 Ancrage.", [
      { type: "damage", target: { kind: "opponentPlayer" }, amount: flat(1) },
      { type: "heal", target: { kind: "controllerPlayer" }, amount: flat(1) },
    ]),
  }),
  unDead({
    id: "chut-il-dort",
    name: "Chut, il dort",
    type: "anomalie",
    cost: 1,
    maxCopies: 3,
    permanent: false,
    text: "Placez un marqueur Mort sur une unité que vous contrôlez (hors Mort-vivant) qui n'en porte pas. Elle gagne +1 / +1.",
    // Une seule désignation pour toute la suite d'effets. Le +1 / +1 passe
    // AVANT le marqueur : une fois marquée, la cible ne répondrait plus au
    // filtre « qui n'en porte pas ».
    onPlayEffects: [
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { unitsOnly: true, notSubtype: MORT_VIVANT, withoutMarker: "mort" } },
        amount: flat(1),
        permanent: true,
      },
      {
        type: "addMarker",
        marker: "mort",
        target: { kind: "chosenUnit", among: { unitsOnly: true, notSubtype: MORT_VIVANT, withoutMarker: "mort" } },
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
      "Brisez cet Objet : ramenez une unité de coût 4 ou moins d'un Cimetière sur votre plateau. Si ce n'est pas un " +
      "Mort-vivant, elle porte un marqueur Mort. Elle ne peut pas attaquer ce tour.",
    onBreakEffects: [
      {
        // « d'UN Cimetière » : le sien ou celui de l'adversaire (décision du
        // 09/10/2026). Ramenée, l'unité arrive sur VOTRE plateau, sous votre
        // contrôle, avec le mal d'invocation : elle n'attaque pas ce tour.
        // « Si ce n'est pas un Mort-vivant » : la règle du marqueur le refuse
        // d'elle-même à un Mort-vivant (`refusedOnSubtype`).
        type: "pickFromGraveyard",
        target: { kind: "controllerPlayer" },
        graveyards: "both",
        filter: { cardTypes: [...UNITES], maxCost: 4 },
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
    subtypes: [MORT_VIVANT],
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text: "Vos autres unités Mort-vivant gagnent +1 Puissance.",
    // Les unités marquées Mort comprises : l'aura lit les sous-types en jeu (`unitHasSubtype`).
    auraBuffControllerCardTypes: { targetTypes: [...UNITES], targetSubtype: MORT_VIVANT, attackAmount: 1 },
  }),
  unDead({
    id: "reveille-toi",
    name: "Réveille-toi",
    type: "anomalie",
    cost: 3,
    maxCopies: 2,
    permanent: false,
    text:
      "Ramenez une unité de coût 3 ou moins de votre Cimetière sur le plateau. Si ce n'est pas un Mort-vivant, elle " +
      "porte un marqueur Mort.",
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
    equipTargetSubtype: MORT_VIVANT,
    equipGrantsBuff: { attackAmount: 1, healthAmount: 1 },
    text:
      "Équipez un Mort-vivant que vous contrôlez. Il gagne +1 / +1. Quand il inflige des dégâts, récupérez autant " +
      "d'Ancrage. Quand il est détruit, piochez 1 carte.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "onDealtDamage",
        triggeredBy: { equippedUnit: true },
        description: "Le porteur inflige des dégâts : récupérez autant d'Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "triggerDamage" } }],
      },
      {
        trigger: "onDeath",
        triggeredBy: { equippedUnit: true, destroyedBy: [...DETRUITE] },
        description: "Le porteur est détruit : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  }),
  unDead({
    id: "le-gardien-des-jouets",
    name: "Le Gardien des Jouets",
    type: "marin",
    subtypes: [MORT_VIVANT],
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 2,
    keywords: ["garde"],
    text: "Garde. Chaque fois qu'une autre de vos unités Mort-vivant est détruite ou Sabordée, il gagne +1 / +1.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { subtype: MORT_VIVANT, cardTypes: [...UNITES] },
        description: "Un autre Mort-vivant meurt : +1 / +1, conservé.",
        effects: [{ type: "buff", target: { kind: "self" }, amount: flat(1), permanent: true }],
      },
    ],
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
      "Durée : 4 tours de table. La première fois à chaque tour qu'une de vos unités Mort-vivant est détruite ou " +
      "Sabordée, ou qu'une de vos cartes Mort-vivant est défaussée, vos unités Mort-vivant gagnent +1 / +1 tant que " +
      "cette carte est en jeu.",
    abilities: meuteQuiTombe("ceuxDenBas", "vos Mort-vivants gagnent +1 / +1 tant que Ceux d'en bas est en jeu.", [
      {
        type: "buff",
        target: { kind: "allAllyUnitsWithSubtype", subtype: MORT_VIVANT },
        amount: flat(1),
        permanent: true,
        whileSourceInPlay: true,
      },
    ]),
  }),
];

/**
 * CARTES DE PLATEAU (Lot 18, génériques — tous archétypes) : elles agissent
 * sur les EMPLACEMENTS du terrain (`game/rules/slotEffects.ts`). Un seul
 * vocabulaire (décision du 09/10/2026) : condamner, libérer, ajouter.
 * Exemplaires : Légendaires ×1, Épique et Rare ×2.
 */
export const LOT18_PLATEAU = "lot-18-plateau";

export const LOT18_PLATEAU_SET: CardDefinition[] = [
  {
    id: "ya-plus-de-place",
    name: "Y'a plus de place !",
    type: "objet",
    setCode: LOT18_PLATEAU,
    cost: 6,
    maxCopies: 1,
    text: "Brisez cet Objet : condamnez un emplacement libre adverse pendant 3 tours de table.",
    onBreakEffects: [{ type: "condemnSlot", target: { kind: "opponentPlayer" }, tableTurns: 3, cardId: "ya-plus-de-place" }],
  },
  {
    id: "le-barrage-des-egares",
    name: "Le Barrage des Égarés",
    type: "structure",
    setCode: LOT18_PLATEAU,
    cost: 4,
    health: 5,
    maxCopies: 2,
    durationTurns: 4,
    text:
      "Durée : 4 tours de table. À son arrivée, condamnez un emplacement libre adverse. Il reste condamné tant que " +
      "cette Structure est en jeu.",
    onPlayEffects: [{ type: "condemnSlot", target: { kind: "opponentPlayer" }, whileSourceInPlay: true, cardId: "le-barrage-des-egares" }],
  },
  {
    id: "le-pont-sans-fin",
    name: "Le Pont Sans Fin",
    type: "objet",
    setCode: LOT18_PLATEAU,
    cost: 6,
    maxCopies: 1,
    text:
      "Brisez cet Objet : ajoutez 1 emplacement à votre terrain pendant 3 tours de table. Quand il disparaît, la " +
      "carte posée dessus part au Cimetière.",
    onBreakEffects: [{ type: "addSlot", target: { kind: "controllerPlayer" }, tableTurns: 3, cardId: "le-pont-sans-fin" }],
  },
  {
    id: "place-au-large",
    name: "Place au Large",
    type: "objet",
    setCode: LOT18_PLATEAU,
    cost: 3,
    maxCopies: 2,
    text:
      "Brisez cet Objet : libérez un emplacement condamné de votre terrain. Si aucun emplacement n'est condamné, " +
      "piochez 1 carte.",
    onBreakEffects: [
      // La pioche se lit AVANT la libération : « si aucun n'est condamné », au moment où l'Objet se brise.
      { type: "draw", target: { kind: "controllerPlayer" }, amount: flat(1), conditionControllerHasCondemnedSlot: false },
      { type: "freeCondemnedSlot", target: { kind: "controllerPlayer" } },
    ],
  },
];
