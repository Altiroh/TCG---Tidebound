import type { CardDefinition } from "@/game/cards/types";

/**
 * LOT 15 — ÉCLATS EN SELLE (Notion « Catalogue de cartes » § Lot 15, et la
 * page de lot « Éclats en Selle », scope validé le 23/09/2026).
 *
 * Trois familles que relie l'idée d'éclat :
 *
 *  - l'ÉQUIPAGE DE VERRE, qui transforme le fait de SURVIVRE aux dégâts en
 *    progression (`onSurvivedDamage`). « Gagne +X Puissance » sans durée est
 *    CONSERVÉ ; un bonus temporaire dit sa durée. Aucune carte ne nomme la
 *    famille : les synergies passent par les dégâts, d'où qu'ils viennent ;
 *  - la CAVALERIE, des Bêtes puissantes, peu nombreuses, non-swarm — de
 *    bonnes cartes seules, pas de tribal obligatoire, et juste assez
 *    d'anti-Garde pour apprendre que le contre existe ;
 *  - les SENTINELLES CHROMATIQUES, dont chacune émet le Signal de sa
 *    couleur au profit de toutes les autres, en cumul
 *    (`game/rules/chromatic.ts`). Le texte « Signal Rouge — … » décrit la
 *    règle de la couleur, écrite une fois dans le moteur, et la définition
 *    ne porte que la couleur.
 *
 * Valeurs chiffrées : celles de Notion, « à playtester » — rien n'est
 * rééquilibré ici. Aucune limite d'exemplaires n'est donnée par le lot : la
 * limite par défaut s'applique (`DEFAULT_MAX_COPIES`).
 *
 * Fichier à part plutôt qu'à la suite de `core.ts` : ces définitions ne
 * dépendent que des types, et `core.ts` les verse dans `CORE_SET`. Les
 * constantes de famille sont donc écrites ici en toutes lettres — importer
 * `core.ts` depuis ce module créerait un cycle au chargement.
 */

/** Lot de diffusion, miroir de `cards.set_code`. */
export const ECLATS_EN_SELLE = "eclats-en-selle";

/** Sous-type et archétype de la Cavalerie — mêmes valeurs que `CAVALERIE` (`core.ts`). */
const CAVALERIE = "cavalerie";

/** Unités — le filtre commun de « une unité ». */
const UNITES = ["marin", "creature"] as const;

/** Sous-type des jetons Éclat Chromatique (`ECLAT_CHROMATIQUE`, `game/rules/chromatic.ts`). */
const ECLAT = "eclat-chromatique";

// ===========================================================================
// ÉQUIPAGE DE VERRE
// ===========================================================================

const EQUIPAGE_DE_VERRE: CardDefinition[] = [
  {
    id: "eclaireur-ebreche",
    name: "Éclaireur Ébréché",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 1,
    maxCopies: 3,
    attack: 1,
    health: 2,
    text:
      "Au début de votre Main Phase, il subit 1 dégât. La première fois à chaque tour qu'il survit à des dégâts, " +
      "il gagne +2 Puissance.",
    abilities: [
      {
        // « Au début de votre Main Phase » : la Main Phase s'ouvre à
        // l'entame du tour, c'est donc le début de tour.
        trigger: "startOfTurn",
        description: "Il se fêle : 1 dégât.",
        effects: [{ type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieEclaireurEbreche",
        description: "Il tient bon : +2 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 2 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "matelot-fele",
    name: "Matelot Fêlé",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 1,
    maxCopies: 3,
    attack: 1,
    health: 3,
    text: "La première fois à chaque tour qu'il survit à des dégâts, il gagne +1 Puissance.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieMatelotFele",
        description: "Il tient bon : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "vigie-aux-fissures",
    name: "Vigie aux Fissures",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 1,
    health: 4,
    text:
      "La première fois à chaque tour qu'une autre unité que vous contrôlez survit à des dégâts, piochez 1 carte " +
      "puis défaussez-en 1.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        triggeredBy: { cardTypes: [...UNITES] },
        oncePerTurnKey: "vigieAuxFissures",
        description: "Une fêlure de plus : piochez 1 carte puis défaussez-en 1.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "verrier-de-pont",
    name: "Verrier de Pont",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 2,
    health: 4,
    text:
      "Une fois pendant votre Main Phase, vous pouvez infliger 1 dégât à une autre unité que vous contrôlez. Si " +
      "elle survit, restaurez 1 Résistance à une autre unité que vous contrôlez.",
    // Deux cibles dans une phrase : la première se DÉSIGNE à l'activation,
    // la seconde se choisit ensuite (`pickUnits`), parmi les autres unités
    // blessées — restaurer une unité intacte ne ferait rien.
    activatableOncePerTurn: {
      cost: {},
      effects: [
        {
          type: "damage",
          target: { kind: "chosenUnit", among: { unitsOnly: true, excludeSource: true } },
          amount: { kind: "flat", value: 1 },
        },
        {
          type: "pickUnits",
          target: { kind: "allAllyUnits" },
          filter: { cardTypes: [...UNITES], damaged: true, excludeChosenTarget: true },
          uses: 1,
          conditionChosenTargetSurvives: true,
          thenEffects: [{ type: "heal", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }],
        },
      ],
    },
  },
  {
    id: "duelliste-de-verre",
    name: "Duelliste de Verre",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 2,
    health: 3,
    text: "La première fois à chaque tour qu'il survit à des dégâts, il gagne +1 Puissance. Tant qu'il est blessé, il a +1 Puissance.",
    selfBuffWhileDamaged: { attackAmount: 1 },
    abilities: [
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieDuellisteDeVerre",
        description: "Il tient bon : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "canonnier-fele",
    name: "Canonnier Fêlé",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 3,
    attack: 3,
    health: 4,
    text:
      "À son arrivée, il subit 1 dégât et inflige 1 dégât à une unité adverse. La première fois à chaque tour " +
      "qu'il survit à des dégâts, il gagne +1 Puissance.",
    // Le coup de recul se prend à la pose ; le tir, lui, se VISE dans la
    // fenêtre d'arrivée — sans quoi la carte ne se jouerait pas face à un
    // plateau vide, faute de cible à désigner en la posant.
    onPlayEffects: [{ type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } }],
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Tir de mise en batterie : 1 dégât à une unité adverse.",
        effects: [
          {
            type: "damage",
            target: { kind: "chosenUnit", among: { unitsOnly: true, opponentOnly: true } },
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieCanonnierFele",
        description: "Il tient bon : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "porte-eclats",
    name: "Porte-Éclats",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 5,
    text:
      "La première fois à chaque tour qu'une autre unité que vous contrôlez devrait être détruite par des dégâts, " +
      "vous pouvez infliger 1 dégât au Porte-Éclats : cette unité reste en jeu avec 1 Résistance.",
    abilities: [
      {
        trigger: "onPermanentWouldBeDestroyed",
        triggeredBy: { cardTypes: [...UNITES] },
        condition: { triggerSourceDoomedByDamage: true },
        mode: "optional",
        oncePerTurnKey: "porteEclats",
        description: "Le Porte-Éclats encaisse 1 dégât : l'unité reste en jeu avec 1 Résistance.",
        effects: [
          { type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } },
          { type: "surviveWithHealth", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "polisseuse-des-felures",
    name: "Polisseuse des Fêlures",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 3,
    attack: 2,
    health: 4,
    text: "Au début de votre tour, restaurez 1 Résistance à une autre unité blessée que vous contrôlez.",
    abilities: [
      {
        trigger: "startOfTurn",
        mode: "optional",
        description: "Polir une fêlure : 1 Résistance restaurée à une autre unité blessée.",
        effects: [
          {
            type: "heal",
            target: { kind: "chosenUnit", among: { unitsOnly: true, excludeSource: true, damaged: true } },
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "bretteuse-au-bord",
    name: "Bretteuse au Bord",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    attack: 4,
    health: 4,
    text: "Après qu'elle attaque, elle subit 1 dégât. La première fois à chaque tour qu'elle survit à des dégâts, elle gagne +1 Puissance.",
    selfDamageAfterAttack: 1,
    abilities: [
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieBretteuseAuBord",
        description: "Elle tient bon : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "maitre-verrier",
    name: "Maître Verrier",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 2,
    attack: 3,
    health: 6,
    text:
      "La première fois pendant chacun de vos tours qu'une unité que vous contrôlez survit à des dégâts infligés " +
      "par l'un de vos effets, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        // « une unité que vous contrôlez » : lui compris.
        triggeredBy: { cardTypes: [...UNITES], excludeSelf: false, damageCauses: ["effect"], damageByController: true },
        condition: { duringOwnTurn: true },
        oncePerTurnKey: "maitreVerrier",
        description: "Le verre tient : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "la-grande-fissure",
    name: "La Grande Fissure",
    type: "marin",
    archetype: "equipage-de-verre",
    setCode: ECLATS_EN_SELLE,
    cost: 5,
    maxCopies: 2,
    attack: 5,
    health: 7,
    text:
      "Au début de votre Main Phase, elle subit 1 dégât. La première fois à chaque tour qu'elle survit à des " +
      "dégâts, elle gagne +1 Puissance. Tant qu'elle a 3 Résistance ou moins, elle a Garde.",
    conditionalKeywords: [{ keyword: "garde", selfResistanceAtMost: 3 }],
    abilities: [
      {
        trigger: "startOfTurn",
        description: "Elle se fend : 1 dégât.",
        effects: [{ type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieGrandeFissure",
        description: "Elle tient bon : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },

  // --- Soutiens Verre / génériques ------------------------------------------
  {
    id: "eclat-de-bouteille",
    name: "Éclat de Bouteille",
    type: "objet",
    setCode: ECLATS_EN_SELLE,
    cost: 1,
    maxCopies: 3,
    text: "Brisez cet Objet : infligez 1 dégât à une unité.",
    onBreakEffects: [
      { type: "damage", target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false } }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "encore-debout",
    name: "Encore Debout ?",
    type: "objet",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    text: "Brisez cet Objet : infligez 1 dégât à une unité blessée. Si elle survit, restaurez-lui ensuite 2 Résistance.",
    onBreakEffects: [
      {
        type: "damage",
        target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false, damaged: true } },
        amount: { kind: "flat", value: 1 },
      },
      {
        type: "heal",
        target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false, damaged: true } },
        amount: { kind: "flat", value: 2 },
        conditionChosenTargetSurvives: true,
      },
    ],
  },
  {
    id: "trinquer-trop-fort",
    name: "Trinquer Trop Fort",
    type: "objet",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    text: "Brisez cet Objet : infligez 1 dégât à jusqu'à deux unités.",
    onBreakEffects: [
      {
        type: "pickUnits",
        target: { kind: "allUnits" },
        filter: { cardTypes: [...UNITES] },
        uses: 2,
        thenEffects: [{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "bouclier-fendu",
    name: "Bouclier Fendu",
    type: "equipement",
    permanent: true,
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    health: 2,
    text: "L'unité équipée gagne +2 Résistance maximale. Sabordez cet Équipement : restaurez 2 Résistance à l'unité équipée.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    // Une aura, relue en direct : la Résistance maximale retombe avec le
    // Bouclier, et c'est bien ce que « maximale » veut dire.
    equipGrantsBuff: { healthAmount: 2 },
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordez Bouclier Fendu : 2 Résistance restaurées à l'unité équipée.",
        effects: [{ type: "heal", target: { kind: "equippedUnit" }, amount: { kind: "flat", value: 2 } }],
      },
    ],
  },
  {
    id: "pont-de-verre",
    name: "Pont de Verre",
    type: "structure",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 3,
    health: 3,
    durationTurns: 4,
    text:
      "Durée : 4 tours. La première fois pendant chacun de vos tours qu'une unité que vous contrôlez survit à des " +
      "dégâts infligés par l'un de vos effets, restaurez 1 Résistance à une autre unité que vous contrôlez.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        triggeredBy: { cardTypes: [...UNITES], damageCauses: ["effect"], damageByController: true },
        condition: { duringOwnTurn: true },
        mode: "optional",
        oncePerTurnKey: "pontDeVerre",
        description: "Le pont tient : 1 Résistance restaurée à une autre de vos unités.",
        effects: [
          {
            type: "heal",
            target: { kind: "chosenUnit", among: { unitsOnly: true, damaged: true, excludeTriggerSource: true } },
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "jusqua-ce-que-ca-casse",
    name: "Jusqu'à ce que ça casse",
    type: "anomalie",
    setCode: ECLATS_EN_SELLE,
    cost: 5,
    maxCopies: 1,
    text:
      "Jusqu'à la fin du tour, la première fois que chacune de vos unités survit à des dégâts, vous pouvez lui " +
      "infliger 1 dégât supplémentaire. Si elle survit encore, déclenchez à nouveau ses effets liés au fait de " +
      "survivre à des dégâts.",
    // Reste en jeu le temps du tour pour que sa capacité puisse répondre,
    // puis part au Cimetière à la fin du tour.
    expiresAtEndOfTurn: true,
    abilities: [
      {
        trigger: "onSurvivedDamage",
        triggeredBy: { cardTypes: [...UNITES] },
        mode: "optional",
        oncePerTurnKey: "jusquaCeQueCaCasse",
        // « la première fois que CHACUNE de vos unités » : la marque vit sur
        // l'unité, pas sur l'Anomalie.
        oncePerTurnPerTriggerSource: true,
        description: "Un dégât de plus : si elle survit encore, ses effets de survie se redéclenchent.",
        effects: [
          // Réarmer AVANT de frapper : c'est la survie à CE coup-ci qui
          // redéclenche ses effets, par le circuit normal.
          { type: "rearmTriggers", target: { kind: "triggerSource" }, rearmTrigger: "onSurvivedDamage" },
          { type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
];

// ===========================================================================
// CAVALERIE
// ===========================================================================

const CAVALERIE_LOT: CardDefinition[] = [
  {
    id: "monture-de-breche",
    name: "Monture de Brèche",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 2,
    health: 3,
    text: "Lorsqu'elle attaque une unité ayant Garde, elle gagne +1 Puissance pour cette attaque.",
    bonusDamageVsKeyword: { keyword: "garde", amount: 1 },
  },
  {
    id: "bete-de-halage",
    name: "Bête de Halage",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 2,
    health: 4,
    text:
      "La première fois à chaque tour qu'elle devrait être renvoyée en main, déplacée ou détruite par un effet " +
      "adverse, vous pouvez lui retirer 1 Résistance à la place.",
    opponentRemovalShieldOncePerTurn: { healthLoss: 1 },
  },
  {
    id: "eclaireur-a-cornes",
    name: "Éclaireur à Cornes",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 3,
    attack: 4,
    health: 3,
    text: "À son arrivée, regardez la première carte de la pioche adverse. Vous pouvez la placer sous sa pioche.",
    // « Vous pouvez » : la question posée accepte de laisser la carte dessus.
    onPlayEffects: [{ type: "deckTopDecision", target: { kind: "opponentPlayer" }, refusable: true }],
  },
  {
    id: "destrier-du-ressac",
    name: "Destrier du Ressac",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 3,
    attack: 3,
    health: 5,
    text: "Tant qu'il est votre seule unité, il a +1 Puissance.",
    selfBuffWhileOnlyUnit: { attackAmount: 1 },
  },
  {
    id: "mufle-au-fanion",
    name: "Mufle au Fanion",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    attack: 4,
    health: 6,
    text: "Tant qu'il est blessé, il a Garde.",
    conditionalKeywords: [{ keyword: "garde", selfDamaged: true }],
  },
  {
    id: "chargeur-des-ecueils",
    name: "Chargeur des Écueils",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    attack: 5,
    health: 4,
    text: "À son arrivée, si l'adversaire contrôle plus d'unités que vous, il a Pied marin jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        condition: { opponentUnitsMoreThanController: true },
        description: "En retard d'unités : Pied marin jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 0 },
            healthAmount: { kind: "flat", value: 0 },
            grantKeywords: ["pied-marin"],
            duration: "endOfTurn",
          },
        ],
      },
    ],
  },
  {
    id: "bete-de-percee",
    name: "Bête de Percée",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 2,
    attack: 4,
    health: 5,
    text: "À son arrivée, choisissez une unité adverse : elle perd Garde jusqu'à la fin du tour.",
    // Visée dans la fenêtre d'arrivée, comme tout déclenchement qui désigne
    // une cible : la carte se pose même face à un plateau vide.
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Percer la ligne : une unité adverse perd Garde jusqu'à la fin du tour.",
        effects: [
          {
            type: "debuff",
            target: { kind: "chosenUnit", among: { unitsOnly: true, opponentOnly: true } },
            attackAmount: { kind: "flat", value: 0 },
            removeKeywords: ["garde"],
            duration: "endOfTurn",
          },
        ],
      },
    ],
  },
  {
    id: "mange-fer",
    name: "Mange-Fer",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 5,
    maxCopies: 2,
    attack: 5,
    health: 7,
    text: "La première fois à chaque tour qu'un Équipement ou une Structure adverse est détruit, il gagne +1 Puissance.",
    abilities: [
      {
        trigger: "onDeath",
        // « est détruit » : un Sabordage n'en est pas un.
        triggeredBy: { cardTypes: ["equipement", "structure"], opponentOnly: true, destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "mangeFer",
        description: "Il mâche la ferraille : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "vieille-selle",
    name: "Vieille-Selle",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 5,
    maxCopies: 2,
    attack: 4,
    health: 8,
    text: "Lorsqu'elle devrait subir 3 dégâts ou plus d'une seule source, réduisez ces dégâts de 1.",
    reduceLargeDamageTaken: { atLeast: 3, amount: 1 },
  },
  {
    id: "le-deserteur-gris",
    name: "Le Déserteur Gris",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 5,
    maxCopies: 3,
    attack: 6,
    health: 5,
    text: "À la fin de votre tour, si vous contrôlez au moins 3 autres unités, renvoyez-le dans votre main.",
    abilities: [
      {
        trigger: "endOfTurn",
        condition: { controllerOtherUnitsAtLeast: 3 },
        description: "Trop de monde : il quitte le rang et rentre dans votre main.",
        effects: [{ type: "moveZone", toZone: "hand", target: { kind: "self" } }],
      },
    ],
  },
  {
    id: "la-bete-quon-nattend-plus",
    name: "La Bête qu'on n'attend plus",
    type: "creature",
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: ECLATS_EN_SELLE,
    cost: 6,
    maxCopies: 2,
    attack: 6,
    health: 7,
    text: "À son arrivée, si votre Navire a moins d'Ancrage que le Navire adverse, récupérez 2 Ancrage.",
    abilities: [
      {
        trigger: "onEnterPlay",
        condition: { controllerAnchorBelowOpponent: true },
        description: "Arrivée tardive : récupérez 2 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
      },
    ],
  },

  // --- Soutiens Cavalerie / génériques --------------------------------------
  {
    id: "selle-de-guerre",
    name: "Selle de Guerre",
    type: "equipement",
    permanent: true,
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    health: 2,
    text: "L'unité équipée gagne +1 Puissance. Si elle coûte 4 ou plus, elle gagne aussi +1 Résistance.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    equipGrantsBuff: { attackAmount: 1 },
    equipGrantsBuffIfBearerCostAtLeast: { cost: 4, healthAmount: 1 },
  },
  {
    id: "harnais-de-retenue",
    name: "Harnais de Retenue",
    type: "equipement",
    permanent: true,
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    health: 2,
    text:
      "La première fois que l'unité équipée devrait être renvoyée en main par un effet adverse, détruisez cet " +
      "Équipement à la place.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    bounceSubstituteThenDestroy: true,
  },
  {
    id: "debusquer",
    name: "Débusquer",
    type: "objet",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 2,
    text: "Brisez cet Objet : une unité adverse perd Garde jusqu'à la fin du tour.",
    onBreakEffects: [
      {
        type: "debuff",
        target: { kind: "chosenUnit", among: { unitsOnly: true, opponentOnly: true } },
        attackAmount: { kind: "flat", value: 0 },
        removeKeywords: ["garde"],
        duration: "endOfTurn",
      },
    ],
  },
  {
    id: "ouvrez-la-ligne",
    name: "Ouvrez la Ligne !",
    type: "objet",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 3,
    text: "Brisez cet Objet : une unité que vous contrôlez gagne +2 Puissance pour son prochain combat contre une unité ayant Garde ce tour.",
    onBreakEffects: [
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { unitsOnly: true } },
        attackAmount: { kind: "flat", value: 2 },
        healthAmount: { kind: "flat", value: 0 },
        nextCombatVsKeyword: "garde",
        duration: "endOfTurn",
      },
    ],
  },
  {
    id: "pas-un-pas-de-plus",
    name: "Pas un Pas de Plus",
    type: "objet",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 2,
    text:
      "Lorsqu'une unité adverse déclare une attaque directe contre votre Navire, Brisez cet Objet : une unité que " +
      "vous contrôlez gagne Garde jusqu'à la fin du tour.",
    // Même grammaire que les Objets réactifs du Lot 14 (Corde de Rappel) :
    // l'effet de Bris, et la réponse à l'attaque qui Brise l'Objet. Une unité
    // qui prend Garde pendant la fenêtre rend l'attaque directe illégale à
    // la reprise : l'attaquant devra viser la Garde.
    onBreakEffects: [
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { unitsOnly: true } },
        attackAmount: { kind: "flat", value: 0 },
        healthAmount: { kind: "flat", value: 0 },
        grantKeywords: ["garde"],
        duration: "endOfTurn",
      },
    ],
    abilities: [
      {
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        description: "Brisez Pas un Pas de Plus : une de vos unités gagne Garde jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { unitsOnly: true } },
            attackAmount: { kind: "flat", value: 0 },
            healthAmount: { kind: "flat", value: 0 },
            grantKeywords: ["garde"],
            duration: "endOfTurn",
          },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "la-mauvaise-reputation",
    name: "La Mauvaise Réputation",
    type: "anomalie",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    text:
      "Jusqu'à votre prochain tour, la première unité que vous jouez coûte 1 Raison de moins. À son arrivée, " +
      "elle subit 1 dégât.",
    onPlayEffects: [
      {
        type: "discountNextCards",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        uses: 1,
        filter: { cardTypes: [...UNITES] },
        lastsExtraTurns: 1,
        arrivalDamage: 1,
      },
    ],
  },
];

// ===========================================================================
// SENTINELLES CHROMATIQUES
// ===========================================================================

const SENTINELLES: CardDefinition[] = [
  {
    id: "heros-de-la-flamme",
    name: "Héros de la Flamme",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 3,
    health: 2,
    chromatic: { colors: ["rouge"], emitsSignal: true },
    text: "Signal Rouge — Vos autres Sentinelles ont +1 Puissance pendant votre tour.",
  },
  {
    id: "briseur-du-brasier",
    name: "Briseur du Brasier",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    attack: 4,
    health: 4,
    chromatic: { colors: ["rouge"], emitsSignal: true },
    text: "Signal Rouge. À son arrivée, une Sentinelle d'une autre couleur gagne +2 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Attiser : une Sentinelle d'une autre couleur gagne +2 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { archetype: "sentinelle-chromatique", otherChromaticColorThanSource: true } },
            attackAmount: { kind: "flat", value: 2 },
            healthAmount: { kind: "flat", value: 0 },
            duration: "endOfTurn",
          },
        ],
      },
    ],
  },
  {
    id: "gardienne-de-leclat",
    name: "Gardienne de l'Éclat",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 1,
    health: 4,
    chromatic: { colors: ["jaune"], emitsSignal: true },
    text: "Signal Jaune — Vos autres Sentinelles ont +1 Résistance maximale.",
  },
  {
    id: "rempart-du-soleil",
    name: "Rempart du Soleil",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    attack: 3,
    health: 5,
    chromatic: { colors: ["jaune"], emitsSignal: true },
    text: "Signal Jaune. Tant que vous contrôlez une Sentinelle d'une autre couleur, elle a Garde.",
    conditionalKeywords: [{ keyword: "garde", controllingOtherColorSentinel: true }],
  },
  {
    id: "tacticien-de-lecume",
    name: "Tacticien de l'Écume",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    attack: 2,
    health: 3,
    chromatic: { colors: ["bleu"], emitsSignal: true },
    text:
      "Signal Bleu — La première fois à chaque tour qu'une autre Sentinelle que vous contrôlez attaque une unité " +
      "adverse, cette unité adverse perd 1 Puissance jusqu'à votre prochain tour. Plusieurs Signaux Bleus ne lui retirent jamais plus de " +
      "1 Puissance par attaque.",
  },
  {
    id: "stratege-de-lazur",
    name: "Stratège de l'Azur",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    attack: 3,
    health: 5,
    chromatic: { colors: ["bleu"], emitsSignal: true },
    text: "Signal Bleu. À son arrivée, choisissez une unité adverse blessée : elle perd 2 Puissance jusqu'à votre prochain tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Lire la faille : une unité adverse blessée perd 2 Puissance jusqu'à votre prochain tour.",
        effects: [
          {
            type: "debuff",
            target: { kind: "chosenUnit", among: { unitsOnly: true, opponentOnly: true, damaged: true } },
            attackAmount: { kind: "flat", value: 2 },
            duration: "untilYourNextTurn",
            // « jusqu'à VOTRE prochain tour » : le malus tient pendant le tour
            // adverse, là où il compte.
            expiresOnControllersTurn: true,
          },
        ],
      },
    ],
  },
  {
    id: "porteur-de-jade",
    name: "Porteur de Jade",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 2,
    attack: 2,
    health: 3,
    chromatic: { colors: ["vert"], emitsSignal: true },
    text:
      "Signal Vert — La première fois pendant chacun de vos tours que vous jouez une autre Sentinelle, récupérez " +
      "1 Raison.",
  },
  {
    id: "survivant-de-la-mousse",
    name: "Survivant de la Mousse",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 2,
    attack: 3,
    health: 4,
    chromatic: { colors: ["vert"], emitsSignal: true },
    text:
      "Signal Vert. La première fois pendant votre tour que vous récupérez de la Raison grâce à une carte, il " +
      "gagne +1 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onReasonGained",
        condition: { duringOwnTurn: true },
        oncePerTurnKey: "survivantDeLaMousse",
        description: "La sève monte : +1 Puissance jusqu'à la fin du tour.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, duration: "endOfTurn" },
        ],
      },
    ],
  },
  {
    id: "veilleuse-de-lombre",
    name: "Veilleuse de l'Ombre",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 3,
    attack: 2,
    health: 4,
    chromatic: { colors: ["violet"], emitsSignal: true },
    text:
      "Signal Violet — La première fois à chaque tour qu'une autre Sentinelle que vous contrôlez est ciblée par " +
      "un effet adverse, piochez 1 carte puis défaussez-en 1.",
  },
  {
    id: "oracle-damethyste",
    name: "Oracle d'Améthyste",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    attack: 3,
    health: 5,
    chromatic: { colors: ["violet"], emitsSignal: true },
    text:
      "Signal Violet. La première fois pendant votre tour que vous piochez puis défaussez par un effet de carte, " +
      "elle gagne +2 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onCardDiscardedFromHand",
        // La défausse d'un effet de carte, jamais la limite de main.
        triggeredBy: { discardByEffect: true },
        condition: { duringOwnTurn: true },
        oncePerTurnKey: "oracleDamethyste",
        description: "Les pierres parlent : +2 Puissance jusqu'à la fin du tour.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 2 }, healthAmount: { kind: "flat", value: 0 }, duration: "endOfTurn" },
        ],
      },
    ],
  },
  {
    id: "emissaire-de-quartz",
    name: "Émissaire de Quartz",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 2,
    attack: 3,
    health: 3,
    text:
      "À son arrivée, choisissez sa couleur parmi Rouge, Jaune, Bleu, Vert ou Violet. À sa destruction, créez un " +
      "Éclat Chromatique de cette couleur.",
    // Le texte ne lui donne pas de Signal : l'Émissaire EST de la couleur
    // choisie (il compte pour l'Assemblage, Formation Prismatique…), il ne
    // l'émet pas.
    abilities: [
      {
        trigger: "onEnterPlay",
        description: "Choisir la couleur de sa pierre.",
        effects: [
          {
            type: "chooseChromaticColor",
            target: { kind: "self" },
            chromaticOptions: "all",
            thenEffects: [{ type: "chromaticModify", target: { kind: "self" }, chromaticColorFrom: "chosenColor", permanent: true }],
          },
        ],
      },
      {
        trigger: "onDeath",
        description: "La pierre lui survit : un Éclat Chromatique de sa couleur.",
        effects: [{ type: "summon", target: { kind: "controllerPlayer" }, chromaticShardOf: "self" }],
      },
    ],
  },
  {
    id: "heraut-de-nacre",
    name: "Héraut de Nacre",
    type: "marin",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 5,
    maxCopies: 2,
    attack: 4,
    health: 5,
    // « elle émet le Signal correspondant » : une Sentinelle qui émet ce
    // qu'elle prend. Sans couleur imprimée, elle n'émet rien tant qu'elle
    // n'a rien pris.
    chromatic: { emitsSignal: true },
    text:
      "À son arrivée, choisissez un Éclat Chromatique que vous contrôlez. Elle prend sa couleur et émet le Signal " +
      "correspondant tant qu'elle reste en jeu.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Prendre la couleur d'un de vos Éclats Chromatiques, et son Signal.",
        effects: [
          {
            type: "chromaticModify",
            target: { kind: "chosenUnit", among: { subtype: ECLAT } },
            chromaticRecipient: "self",
            chromaticEmits: true,
            permanent: true,
          },
        ],
      },
    ],
  },

  // --- Soutiens Sentinelles ---------------------------------------------------
  {
    id: "bracelet-chromatique",
    name: "Bracelet Chromatique",
    type: "equipement",
    permanent: true,
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    health: 2,
    text:
      "Équipez une Sentinelle. Choisissez un Éclat Chromatique que vous contrôlez : elle est également considérée " +
      "comme étant de cette couleur. Elle n'émet toujours qu'un seul Signal.",
    equipTargetArchetype: "sentinelle-chromatique",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    // La couleur est portée par le BRACELET et prêtée à la Sentinelle : elle
    // part avec lui.
    equipSharesChromaticColors: true,
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Sertir un Éclat : la Sentinelle équipée prend aussi sa couleur.",
        effects: [
          {
            type: "chromaticModify",
            target: { kind: "chosenUnit", among: { subtype: ECLAT } },
            chromaticRecipient: "self",
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "bracelet-de-resonance",
    name: "Bracelet de Résonance",
    type: "equipement",
    permanent: true,
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 2,
    health: 2,
    text:
      "Équipez une Sentinelle. Sabordez cet Équipement et détruisez un Éclat Chromatique : jusqu'à votre prochain " +
      "tour, la Sentinelle équipée émet également le Signal de cet Éclat.",
    equipTargetArchetype: "sentinelle-chromatique",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "onSaborde",
        mode: "optional",
        description: "Détruisez un de vos Éclats : la Sentinelle équipée émet son Signal jusqu'à votre prochain tour.",
        effects: [
          {
            type: "chromaticModify",
            target: { kind: "chosenUnit", among: { subtype: ECLAT } },
            chromaticRecipient: "equippedUnit",
            chromaticEmits: true,
            chromaticEmitOnly: true,
            duration: "untilYourNextTurn",
          },
          { type: "destroy", target: { kind: "chosenUnit", among: { subtype: ECLAT } } },
        ],
      },
    ],
  },
  {
    id: "appel-des-sentinelles",
    name: "Appel des Sentinelles",
    type: "objet",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    text:
      "Brisez cet Objet : regardez les 4 premières cartes de votre pioche. Vous pouvez ajouter une Sentinelle " +
      "Chromatique parmi elles à votre main. Placez les autres sous votre pioche.",
    onBreakEffects: [
      {
        type: "lookAtDeckTop",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 4 },
        uses: 1,
        refusable: true,
        filter: { cardTypes: [...UNITES], archetype: "sentinelle-chromatique" },
      },
    ],
  },
  {
    id: "pierre-retrouvee",
    name: "Pierre Retrouvée",
    type: "objet",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    text: "Brisez cet Objet : choisissez un Éclat Chromatique dans votre Cimetière et créez un Éclat de cette couleur sur votre terrain.",
    onBreakEffects: [
      { type: "summon", target: { kind: "controllerPlayer" }, cardIdFrom: "chosenGraveyardCard", filter: { subtype: ECLAT } },
    ],
  },
  {
    id: "transfert-de-pierre",
    name: "Transfert de Pierre",
    type: "objet",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    text:
      "Détruisez un Éclat Chromatique que vous contrôlez : une Sentinelle que vous contrôlez devient également de " +
      "cette couleur jusqu'à votre prochain tour.",
    // Un Objet agit en se Brisant. L'Éclat se désigne au Bris, sa couleur
    // est lue aussitôt, puis la Sentinelle se choisit (`pickUnits`) — l'Éclat
    // est déjà parti quand elle la reçoit.
    onBreakEffects: [
      {
        type: "pickUnits",
        target: { kind: "allAllyUnits" },
        filter: { archetype: "sentinelle-chromatique" },
        uses: 1,
        captureChromaticColorFrom: "chosenUnit",
        thenEffects: [
          { type: "chromaticModify", target: { kind: "triggerSource" }, chromaticColorFrom: "chosenColor", duration: "untilYourNextTurn" },
        ],
      },
      { type: "destroy", target: { kind: "chosenUnit", among: { subtype: ECLAT } } },
    ],
  },
  {
    id: "poste-chromatique",
    name: "Poste Chromatique",
    type: "structure",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 2,
    maxCopies: 3,
    health: 3,
    durationTurns: 4,
    text:
      "Durée : 4 tours. La première fois pendant chacun de vos tours que vous jouez une Sentinelle d'une couleur " +
      "que vous ne contrôliez pas encore, elle gagne +1 Résistance jusqu'à votre prochain tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { archetype: "sentinelle-chromatique", cardTypes: [...UNITES] },
        condition: { duringOwnTurn: true, triggerSourceBringsNewChromaticColor: true },
        oncePerTurnKey: "posteChromatique",
        description: "Une couleur nouvelle : +1 Résistance jusqu'à votre prochain tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "triggerSource" },
            attackAmount: { kind: "flat", value: 0 },
            healthAmount: { kind: "flat", value: 1 },
            duration: "untilYourNextTurn",
          },
        ],
      },
    ],
  },
  {
    id: "coffret-aux-cinq-pierres",
    name: "Coffret aux Cinq Pierres",
    type: "structure",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 2,
    health: 3,
    text:
      "Vos Éclats Chromatiques ont +1 Résistance. Une fois par tour, vous pouvez Saborder un Éclat : regardez les " +
      "3 premières cartes de votre pioche. Vous pouvez ajouter une Sentinelle de cette couleur parmi elles à votre main.",
    auraBuffControllerCardTypes: { targetTypes: ["structure"], targetSubtype: ECLAT, healthAmount: 1 },
    activatableOncePerTurn: {
      cost: {},
      effects: [
        // La couleur de l'Éclat est lue en posant la question, AVANT qu'il ne
        // soit Sabordé par l'effet suivant.
        {
          type: "lookAtDeckTop",
          target: { kind: "controllerPlayer" },
          amount: { kind: "flat", value: 3 },
          uses: 1,
          refusable: true,
          filter: { cardTypes: [...UNITES], archetype: "sentinelle-chromatique" },
          takeableColorFrom: "chosenUnit",
        },
        { type: "saborde", target: { kind: "chosenUnit", among: { subtype: ECLAT } } },
      ],
    },
  },
  {
    id: "synchronisation",
    name: "Synchronisation !",
    type: "objet",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 3,
    text: "Brisez cet Objet : choisissez une Sentinelle Chromatique. Jusqu'à la fin du tour, elle bénéficie également de son propre Signal Chromatique.",
    onBreakEffects: [
      {
        type: "chromaticModify",
        target: { kind: "chosenUnit", among: { archetype: "sentinelle-chromatique" } },
        chromaticBenefitsOwn: true,
        duration: "endOfTurn",
      },
    ],
  },
  {
    id: "les-couleurs-repondent",
    name: "Les Couleurs Répondent",
    type: "anomalie",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 4,
    maxCopies: 2,
    text:
      "Choisissez jusqu'à 3 Sentinelles Chromatiques de couleurs différentes. Elles gagnent +1 Puissance et " +
      "+1 Résistance jusqu'à votre prochain tour.",
    onPlayEffects: [
      {
        type: "pickUnits",
        target: { kind: "allAllyUnits" },
        filter: { archetype: "sentinelle-chromatique" },
        uses: 3,
        distinctChromaticColors: true,
        thenEffects: [
          {
            type: "buff",
            target: { kind: "triggerSource" },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
            duration: "untilYourNextTurn",
          },
        ],
      },
    ],
  },
  {
    id: "formation-prismatique",
    name: "Formation Prismatique",
    type: "anomalie",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 6,
    maxCopies: 1,
    text:
      "Jouable uniquement si vous contrôlez au moins 3 couleurs différentes. Jusqu'à la fin du tour, toutes vos " +
      "Sentinelles Chromatiques bénéficient également de leur propre Signal.",
    playableOnlyIf: { controllerChromaticColorsAtLeast: 3 },
    onPlayEffects: [
      {
        type: "chromaticModify",
        target: { kind: "allAllyUnits" },
        filter: { archetype: "sentinelle-chromatique" },
        chromaticBenefitsOwn: true,
        duration: "endOfTurn",
      },
    ],
  },
  {
    id: "la-premiere-pierre",
    name: "La Première Pierre",
    type: "objet",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 3,
    maxCopies: 2,
    text:
      "Brisez cet Objet : choisissez une couleur. Jusqu'à votre prochain tour, vous êtes considéré comme " +
      "contrôlant cette couleur pour vos effets Chromatiques. Cette carte n'émet aucun Signal.",
    onBreakEffects: [
      {
        type: "chooseChromaticColor",
        target: { kind: "controllerPlayer" },
        chromaticOptions: "all",
        thenEffects: [
          { type: "claimChromaticColor", target: { kind: "controllerPlayer" }, chromaticColorFrom: "chosenColor", lastsExtraTurns: 1 },
        ],
      },
    ],
  },

  // --- Le Géant Chromatique -----------------------------------------------
  // « Remplacer des Sentinelles pour un Assemblage signifie les placer au
  // Cimetière sans les détruire » : aucun effet de destruction ne s'éveille.
  {
    id: "le-geant-chromatique",
    name: "Le Géant Chromatique",
    type: "creature",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 8,
    maxCopies: 1,
    attack: 8,
    health: 9,
    // Ses couleurs sont celles de son Assemblage (`CardInstance.chromatic`) :
    // il les émet, et bénéficie de leurs Signaux.
    chromatic: { emitsSignal: true, benefitsFromOwnSignals: true },
    chromaticAssemblage: { sentinels: 4, reasonCost: 2 },
    text:
      "Assemblage Chromatique — Si vous contrôlez au moins 4 Sentinelles de couleurs différentes, vous pouvez " +
      "placer quatre de ces Sentinelles de couleurs différentes au Cimetière et jouer cette carte depuis votre main " +
      "en payant 2 Raison au lieu de son coût. Cela ne compte pas comme une destruction. Le Géant Chromatique est " +
      "considéré comme ayant les quatre couleurs utilisées pour son Assemblage. Il émet et bénéficie des Signaux " +
      "Chromatiques correspondant à ces quatre couleurs.",
  },
  {
    id: "le-geant-chromatique-abyssal",
    name: "Le Géant Chromatique",
    type: "creature",
    variant: "abyssale",
    archetype: "sentinelle-chromatique",
    setCode: ECLATS_EN_SELLE,
    cost: 9,
    maxCopies: 1,
    attack: 10,
    health: 11,
    chromatic: { emitsSignal: true, benefitsFromOwnSignals: true },
    chromaticAssemblage: { sentinels: 4, reasonCost: 2 },
    text:
      "Assemblage Chromatique — Si vous contrôlez au moins 4 Sentinelles de couleurs différentes, vous pouvez " +
      "placer quatre de ces Sentinelles de couleurs différentes au Cimetière et jouer cette carte depuis votre main " +
      "en payant 2 Raison au lieu de son coût. Cela ne compte pas comme une destruction. Le Géant Chromatique est " +
      "considéré comme ayant les quatre couleurs utilisées pour son Assemblage. À son arrivée par Assemblage, " +
      "choisissez la cinquième couleur non utilisée : il est également considéré comme ayant cette couleur. Il " +
      "émet et bénéficie des cinq Signaux Chromatiques.",
    abilities: [
      {
        trigger: "onEnterPlay",
        condition: { selfArrivedByAssemblage: true },
        description: "La cinquième pierre : il prend la couleur manquante, et l'émet.",
        effects: [
          {
            type: "chooseChromaticColor",
            target: { kind: "self" },
            chromaticOptions: "missingOnSelf",
            thenEffects: [
              { type: "chromaticModify", target: { kind: "self" }, chromaticColorFrom: "chosenColor", chromaticEmits: true, permanent: true },
            ],
          },
        ],
      },
    ],
  },
];

/** Les 59 cartes du Lot 15. Le Brise-Ligne et Le Dernier Rempart, déjà au catalogue, y sont rattachés par leur famille. */
export const ECLATS_EN_SELLE_SET: CardDefinition[] = [...EQUIPAGE_DE_VERRE, ...CAVALERIE_LOT, ...SENTINELLES];
