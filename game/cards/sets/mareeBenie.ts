import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";
import type { EffectAmount, EffectDefinition, TargetSelector } from "@/game/effects/types";
import type { UnitCondition } from "@/game/cards/unitConditions";
import { chaineLibre } from "@/game/cards/chaineLibre";

/**
 * LA MARÉE BÉNIE — booster commun des Lots 20 et 21 (Notion, « Booster
 * commun — Bienfaits du Fond × Équipage Félin — 66 cartes », 27/10/2026),
 * plus les variantes ABYSSALES du Grand-Bienfaiteur et d'Amiral Griffenoire
 * (décision du 27/10/2026).
 *
 *  - LOT 20 — LES BIENFAITS DU FOND (36 cartes) : la BÉNÉDICTION
 *    (`STATUS_BENIE`, effets `bless` / `unbless`) et la SOUILLURE (marqueur
 *    cumulable `souillure`). Ni l'une ni l'autre n'a d'effet propre : ce sont
 *    les textes qui les lisent (`UnitCondition`).
 *  - LOT 21 — L'ÉQUIPAGE FÉLIN (30 cartes) : le VOILE INTRINSÈQUE (`grantVeil`,
 *    un seul par permanent, consommé à la prochaine destruction empêchée) et
 *    les marqueurs +1/+1 (`plus-un`), avec la Marée tenue entre Calme et Houle.
 *
 * Les TEXTES sont ceux du catalogue Notion, copiés tels quels. Écarts de
 * lecture assumés, tous documentés sur la carte concernée :
 *  - « meurt » (Le Pêcheur en deuil, La Cloche des Absents, Le Berceau du
 *    Fond) : toute mort, Sabordage compris — le texte ne dit pas « détruite » ;
 *  - un effet de début de tour qui fait choisir une ou plusieurs unités
 *    passe par une question (`pickUnits`), où le joueur désigne — ou refuse.
 */
export const BOOSTER_LA_MAREE_BENIE_SET = "la-maree-benie";

const BIENFAITS = "bienfaits-du-fond" as const;
const FELINS = "equipage-felin" as const;

const flat = (value: number): EffectAmount => ({ kind: "flat", value });

/**
 * RÉSISTANCE DES STRUCTURES : le catalogue Notion n'en donnait pas (« P/R — »),
 * alors qu'une Structure en a toujours une. Valeurs validées le 27/10/2026 :
 * un moteur qui rapporte à chaque tour reste facile à abattre, une
 * Structure défensive tient.
 */

function bienfait(def: Omit<CardDefinition, "archetype" | "setCode">): CardDefinition {
  return { ...def, archetype: BIENFAITS, setCode: BOOSTER_LA_MAREE_BENIE_SET };
}

function felin(def: Omit<CardDefinition, "archetype" | "setCode">): CardDefinition {
  return { ...def, archetype: FELINS, setCode: BOOSTER_LA_MAREE_BENIE_SET };
}

// --- Cibles et effets récurrents ---------------------------------------------

const SOUILLEE: UnitCondition = { withMarker: "souillure" };
const NON_BENIE: UnitCondition = { blessed: false };

/** « Une unité » : n'importe laquelle, des deux camps. */
const UNE_CREATURE: TargetSelector = { kind: "chosenUnit", among: { cardTypes: ["marin", "creature"], sameController: false } };
/** « Une unité alliée ». */
const CREATURE_ALLIEE: TargetSelector = { kind: "chosenUnit", among: { cardTypes: ["marin", "creature"] } };
/** « Une AUTRE unité alliée » (la source exclue). */
const AUTRE_CREATURE_ALLIEE: TargetSelector = { kind: "chosenUnit", among: { cardTypes: ["marin", "creature"], excludeSource: true } };

const soinNavire = (value: number, extra: Partial<EffectDefinition> = {}): EffectDefinition => ({
  type: "heal",
  target: { kind: "controllerPlayer" },
  amount: flat(value),
  ...extra,
});
const pioche = (value: number, extra: Partial<EffectDefinition> = {}): EffectDefinition => ({
  type: "draw",
  target: { kind: "controllerPlayer" },
  amount: flat(value),
  ...extra,
});
const souiller = (target: TargetSelector, extra: Partial<EffectDefinition> = {}): EffectDefinition => ({
  type: "addMarker",
  target,
  marker: "souillure",
  ...extra,
});
const plusUn = (target: TargetSelector, extra: Partial<EffectDefinition> = {}): EffectDefinition => ({
  type: "addMarker",
  target,
  marker: "plus-un",
  ...extra,
});
const benir = (target: TargetSelector, extra: Partial<EffectDefinition> = {}): EffectDefinition => ({ type: "bless", target, ...extra });
const voile = (target: TargetSelector, extra: Partial<EffectDefinition> = {}): EffectDefinition => ({ type: "grantVeil", target, ...extra });

/**
 * « Jusqu'à N unités [alliées / de votre choix] » : une question
 * (`pickUnits`), où le joueur désigne — au plus N, ou aucune. Les effets
 * appliqués visent la unité désignée (`triggerSource`).
 */
function choisirCreatures(
  where: "allies" | "toutes" | "adverses",
  uses: number,
  thenEffects: EffectDefinition[],
  extra: { unitCondition?: UnitCondition; excludeSelf?: boolean; excludeTriggerSource?: boolean } & Partial<EffectDefinition> = {}
): EffectDefinition {
  const { unitCondition, excludeSelf, excludeTriggerSource, ...rest } = extra;
  return {
    type: "pickUnits",
    target: { kind: where === "allies" ? "allAllyUnits" : where === "adverses" ? "allEnemyUnits" : "allUnits" },
    filter: {
      cardTypes: ["marin", "creature"],
      ...(unitCondition ? { unitCondition } : {}),
      ...(excludeSelf ? { excludeSelf: true } : {}),
      ...(excludeTriggerSource ? { excludeTriggerSource: true } : {}),
    },
    uses,
    thenEffects,
    ...rest,
  };
}

const LA_CIBLE: TargetSelector = { kind: "triggerSource" };

/** « Lorsqu'une unité alliée perd Voile » : son Voile vient d'être consommé (Notion, Lot 21). */
function auVoilePerdu(description: string, effects: EffectDefinition[], extra: Partial<TriggeredAbility> = {}, autre = false): TriggeredAbility {
  return {
    trigger: "onVeilLost",
    triggeredBy: { cardTypes: ["marin", "creature"], excludeSelf: autre },
    description,
    effects,
    ...extra,
  };
}

/** « Lorsqu'une unité alliée gagne un marqueur +1/+1 ». */
function auPlusUn(description: string, effects: EffectDefinition[], extra: Partial<TriggeredAbility> = {}): TriggeredAbility {
  return {
    trigger: "onMarkerAdded",
    triggeredBy: { cardTypes: ["marin", "creature"], markerAdded: "plus-un", excludeSelf: false },
    description,
    effects,
    ...extra,
  };
}

// =============================================================================
// LOT 20 — LES BIENFAITS DU FOND (36 cartes)
// =============================================================================

/** Le Grand-Bienfaiteur, et sa variante Abyssale : même texte, même corps. */
function grandBienfaiteur(id: string, abyssale: boolean): CardDefinition {
  return bienfait({
    id,
    name: "Le Grand-Bienfaiteur",
    type: "creature",
    subtypes: ["entite", "abyssal"],
    ...(abyssale ? { variant: "abyssale" as const } : {}),
    cost: 8,
    attack: 7,
    health: 9,
    maxCopies: 1,
    keywords: ["garde"],
    qualifications: [{ id: "contournement" }],
    text:
      "Garde. Contournement. À son arrivée — Placez un marqueur Souillure sur toutes les autres unités non bénies. " +
      "Les unités alliées bénies gagnent +1 Résistance. À votre début de tour — Infligez 2 dégâts à une unité " +
      "adverse souillée de votre choix.",
    onPlayEffects: [souiller({ kind: "allUnits" }, { filter: { cardTypes: ["marin", "creature"], excludeSelf: true, unitCondition: NON_BENIE } })],
    auraBuffControllerCardTypes: { targetTypes: ["marin", "creature"], targetCondition: { blessed: true }, healthAmount: 1 },
    abilities: [
      {
        trigger: "startOfTurn",
        description: "Le Grand-Bienfaiteur : 2 dégâts à une unité adverse souillée de votre choix.",
        effects: [choisirCreatures("adverses", 1, [{ type: "damage", target: LA_CIBLE, amount: flat(2) }], { unitCondition: SOUILLEE })],
      },
    ],
  });
}

export const BIENFAITS_DU_FOND_SET: CardDefinition[] = [
  bienfait({
    id: "le-pecheur-en-deuil",
    name: "Le Pêcheur en deuil",
    type: "creature",
    subtypes: ["marin"],
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text:
      "Une fois par tour, lorsqu'une autre unité alliée meurt, votre Navire récupère 1 Ancrage. Si cette unité " +
      "était bénie, piochez 1 carte.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "pecheurEnDeuil",
        description: "Une autre unité alliée meurt : votre Navire récupère 1 Ancrage (et piochez 1 carte si elle était bénie).",
        effects: [soinNavire(1), pioche(1, { conditionTriggerSource: { blessed: true } })],
      },
    ],
  }),
  bienfait({
    id: "le-fils-du-pecheur",
    name: "Le Fils du pêcheur",
    type: "creature",
    subtypes: ["habitant"],
    cost: 2,
    attack: 1,
    health: 3,
    maxCopies: 3,
    text:
      "Tant que vous contrôlez une autre unité, cette unité gagne +1 Résistance. Si vous contrôlez Le Pêcheur en " +
      "deuil, elle gagne également +1 Puissance.",
    selfBuffWhenConditions: [{ when: { controllerOtherUnitsAtLeast: 1 }, healthAmount: 1 }],
    // Le Pêcheur en deuil est lui-même « une autre unité » : la seconde phrase ne dépend que de lui.
    selfBuffWhileControllingCardIds: { cardIds: ["le-pecheur-en-deuil"], attackAmount: 1 },
  }),
  bienfait({
    id: "le-vieux-pecheur",
    name: "Le Vieux Pêcheur",
    type: "creature",
    subtypes: ["marin"],
    cost: 2,
    attack: 1,
    health: 2,
    maxCopies: 3,
    text: "À son arrivée — Regardez les 3 premières cartes de votre deck. Ajoutez-en une à votre main et placez les autres sous votre deck.",
    onPlayEffects: [{ type: "lookAtDeckTop", target: { kind: "controllerPlayer" }, amount: flat(3), uses: 1, restTo: "deckBottom" }],
  }),
  bienfait({
    id: "le-bapteme-du-fond",
    name: "Le Baptême du Fond",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Choisissez une unité alliée. Elle devient bénie et récupère jusqu'à 2 Résistance.",
    ...chaineLibre("Le Baptême du Fond : une unité alliée devient bénie et récupère jusqu'à 2 Résistance.", [
      benir(CREATURE_ALLIEE),
      { type: "heal", target: CREATURE_ALLIEE, amount: flat(2) },
    ]),
  }),
  bienfait({
    id: "pere-goulven-grand-benisseur",
    name: "Père Goulven, Grand Bénisseur",
    type: "creature",
    subtypes: ["habitant"],
    cost: 4,
    attack: 2,
    health: 5,
    maxCopies: 2,
    text:
      "À son arrivée — Une autre unité alliée devient bénie. Une fois par tour, lorsqu'une unité alliée bénie " +
      "subit des dégâts, réduisez ces dégâts de 1.",
    onPlayEffects: [benir(AUTRE_CREATURE_ALLIEE)],
    reduceAllyDamageOncePerTurn: { amount: 1, allyCondition: { blessed: true }, allyTypes: ["marin", "creature"] },
  }),
  bienfait({
    id: "leau-est-excellente",
    name: "L'Eau est Excellente !",
    type: "objet",
    cost: 1,
    maxCopies: 3,
    text: "Chaîne — Une unité gagne +2 Puissance jusqu'à la fin du tour. Placez un marqueur Souillure sur elle.",
    ...chaineLibre("L'Eau est Excellente ! : une unité gagne +2 Puissance jusqu'à la fin du tour, et un marqueur Souillure.", [
      { type: "buff", target: UNE_CREATURE, attackAmount: flat(2), healthAmount: flat(0), duration: "endOfTurn" },
      souiller(UNE_CREATURE),
    ]),
  }),
  bienfait({
    id: "fievre-salee",
    name: "Fièvre salée",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Infligez 2 dégâts à une unité non bénie. Si elle possède un marqueur Souillure, infligez-lui 3 dégâts à la place.",
    ...(() => {
      const cible: TargetSelector = { kind: "chosenUnit", among: { cardTypes: ["marin", "creature"], sameController: false, unitCondition: NON_BENIE } };
      return chaineLibre("Fièvre salée : 2 dégâts à une unité non bénie (3 si elle est souillée).", [
        { type: "damage", target: cible, amount: flat(3), conditionChosenTarget: SOUILLEE },
        { type: "damage", target: cible, amount: flat(2), conditionChosenTarget: { withoutMarker: "souillure" } },
      ]);
    })(),
  }),
  bienfait({
    id: "la-fontaine-du-port",
    name: "La Fontaine du Port",
    type: "structure",
    cost: 3,
    health: 3,
    maxCopies: 2,
    text:
      "À votre début de tour — Si la mer est en Houle, placez un marqueur Souillure sur une unité de votre choix. Si " +
      "elle est en Tempête, placez-en un sur jusqu'à deux unités différentes.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "La Fontaine du Port : un marqueur Souillure (Houle), ou sur jusqu'à deux unités (Tempête).",
        effects: [
          choisirCreatures("toutes", 1, [souiller(LA_CIBLE)], { conditionTideStateIn: ["houle"] }),
          choisirCreatures("toutes", 2, [souiller(LA_CIBLE)], { conditionTideStateIn: ["tempete"] }),
        ],
      },
    ],
  }),
  bienfait({
    id: "la-cloche-des-absents",
    name: "La Cloche des Absents",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    // Un Objet ne se pose plus (règle du 13/10/2026) : « vous pouvez briser cet
    // Objet » se joue depuis la main, en réaction à la mort, comme un Objet Chaîne.
    chaine: true,
    text: "Une fois par tour, lorsqu'une unité alliée meurt, vous pouvez briser cet Objet pour piocher 2 cartes.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["marin", "creature"] },
        mode: "optional",
        oncePerTurnKey: "clocheDesAbsents",
        description: "La Cloche des Absents : une unité alliée meurt — brisez-la pour piocher 2 cartes.",
        effects: [pioche(2)],
      },
    ],
  }),
  bienfait({
    id: "le-puits-sale",
    name: "Le Puits Salé",
    type: "structure",
    cost: 2,
    health: 2,
    maxCopies: 3,
    durationTurns: 4,
    text: "Durée : 4 tours de table. Chaque fois que vous brisez un Objet allié, infligez 1 dégât à toutes les unités souillées.",
    abilities: [
      {
        trigger: "onObjectBroken",
        triggeredBy: {},
        description: "Le Puits Salé : 1 dégât à toutes les unités souillées.",
        effects: [{ type: "damage", target: { kind: "allUnits" }, filter: { cardTypes: ["marin", "creature"], unitCondition: SOUILLEE }, amount: flat(1) }],
      },
    ],
  }),
  bienfait({
    id: "la-procession-des-marees",
    name: "La Procession des Marées",
    type: "anomalie",
    permanent: false,
    cost: 4,
    maxCopies: 2,
    text: "Toutes vos unités deviennent bénies. Si la mer est en Houle ou en Tempête, votre Navire récupère également 2 Ancrage.",
    onPlayEffects: [
      benir({ kind: "allAllyUnits" }, { filter: { cardTypes: ["marin", "creature"] } }),
      soinNavire(2, { conditionTideStateIn: ["houle", "tempete"] }),
    ],
  }),
  bienfait({
    id: "gros-bisou",
    name: "Gros Bisou !",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    chaine: true,
    text: "Chaîne — Lorsqu'une unité adverse attaque, elle perd 2 Puissance pour cette attaque.",
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        condition: { attackFromUnit: true, pendingAttackerCondition: { cardTypes: ["marin", "creature"] } },
        description: "Gros Bisou ! : la unité qui attaque perd 2 Puissance pour cette attaque.",
        effects: [{ type: "modifyAttackerPower", target: { kind: "pendingAttacker" }, amount: flat(2) }],
      },
    ],
  }),
  bienfait({
    id: "le-dernier-refractaire",
    name: "Le Dernier Réfractaire",
    type: "creature",
    subtypes: ["habitant"],
    cost: 3,
    attack: 3,
    health: 3,
    maxCopies: 2,
    text: "Tant que cette unité n'est pas bénie, elle gagne +1 Puissance. Si elle est souillée, elle gagne également +1 Résistance.",
    selfBuffWhenConditions: [
      { when: NON_BENIE, attackAmount: 1 },
      { when: { ...NON_BENIE, ...SOUILLEE }, healthAmount: 1 },
    ],
  }),
  bienfait({
    id: "le-poisson-sans-yeux",
    name: "Le Poisson sans Yeux",
    type: "creature",
    subtypes: ["poisson", "mutant"],
    cost: 1,
    attack: 1,
    health: 2,
    maxCopies: 3,
    text: "À sa mort — Placez un marqueur Souillure sur une unité de votre choix.",
    abilities: [
      {
        trigger: "onDeath",
        description: "Le Poisson sans Yeux : un marqueur Souillure sur une unité de votre choix.",
        effects: [choisirCreatures("toutes", 1, [souiller(LA_CIBLE)])],
      },
    ],
  }),
  bienfait({
    id: "le-marin-aux-branchies",
    name: "Le Marin aux Branchies",
    type: "creature",
    subtypes: ["marin", "mutant"],
    cost: 3,
    attack: 2,
    health: 3,
    maxCopies: 3,
    text: "Si cette unité est souillée, elle gagne +2 Puissance pendant Houle ou Tempête.",
    selfBuffWhenConditions: [{ when: { ...SOUILLEE, tideStateIn: ["houle", "tempete"] }, attackAmount: 2 }],
  }),
  bienfait({
    id: "la-prise-du-siecle",
    name: "La Prise du Siècle",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Bris — Piochez 1 carte. Si la mer est en Houle ou en Tempête, votre Navire récupère également 1 Ancrage.",
    onBreakEffects: [pioche(1), soinNavire(1, { conditionTideStateIn: ["houle", "tempete"] })],
  }),
  bienfait({
    id: "refus-de-benediction",
    name: "Refus de Bénédiction",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Une unité perd sa Bénédiction. Si elle est souillée, infligez-lui 2 dégâts.",
    ...chaineLibre("Refus de Bénédiction : une unité perd sa Bénédiction (2 dégâts si elle est souillée).", [
      { type: "unbless", target: UNE_CREATURE },
      { type: "damage", target: UNE_CREATURE, amount: flat(2), conditionChosenTarget: SOUILLEE },
    ]),
  }),
  bienfait({
    id: "le-filet-qui-respire",
    name: "Le Filet qui Respire",
    type: "structure",
    cost: 3,
    health: 4,
    maxCopies: 2,
    text: "Une fois par tour, lorsqu'une unité souillée attaque votre Navire, vous pouvez lui infliger 2 dégâts avant la résolution de l'attaque.",
    abilities: [
      {
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        oncePerTurnKey: "filetQuiRespire",
        condition: { attackFromUnit: true, pendingAttackerCondition: { cardTypes: ["marin", "creature"], ...SOUILLEE } },
        description: "Le Filet qui Respire : 2 dégâts à la unité souillée qui attaque, avant la résolution.",
        effects: [{ type: "damage", target: { kind: "pendingAttacker" }, amount: flat(2) }],
      },
    ],
  }),
  bienfait({
    id: "maree-de-fievre",
    name: "Marée de Fièvre",
    type: "anomalie",
    permanent: false,
    cost: 4,
    maxCopies: 2,
    text: "Infligez 1 dégât à toutes les unités non bénies. Si la mer est en Tempête, infligez 2 dégâts à la place.",
    onPlayEffects: [
      { type: "damage", target: { kind: "allUnits" }, filter: { cardTypes: ["marin", "creature"], unitCondition: NON_BENIE }, amount: flat(2), conditionTideStateIn: ["tempete"] },
      {
        type: "damage",
        target: { kind: "allUnits" },
        filter: { cardTypes: ["marin", "creature"], unitCondition: NON_BENIE },
        amount: flat(1),
        conditionTideStateIn: ["calme", "houle", "abysses"],
      },
    ],
  }),
  bienfait({
    id: "les-offrandes-du-quai",
    name: "Les Offrandes du Quai",
    type: "objet",
    cost: 1,
    maxCopies: 3,
    text:
      "Chaîne — Choisissez une unité alliée. Elle devient bénie et gagne +1 Résistance jusqu'à la fin du tour. Si " +
      "elle était déjà bénie, elle gagne +2 Résistance à la place.",
    // « Déjà bénie » se lit AVANT de la bénir : les deux bonus d'abord, la Bénédiction ensuite.
    ...chaineLibre("Les Offrandes du Quai : une unité alliée devient bénie et gagne +1 Résistance (+2 si elle l'était déjà).", [
      { type: "buff", target: CREATURE_ALLIEE, attackAmount: flat(0), healthAmount: flat(2), duration: "endOfTurn", conditionChosenTarget: { blessed: true } },
      { type: "buff", target: CREATURE_ALLIEE, attackAmount: flat(0), healthAmount: flat(1), duration: "endOfTurn", conditionChosenTarget: NON_BENIE },
      benir(CREATURE_ALLIEE),
    ]),
  }),
  bienfait({
    id: "le-noye-revenu",
    name: "Le Noyé revenu",
    type: "creature",
    subtypes: ["mort-vivant", "marin"],
    cost: 5,
    attack: 4,
    health: 4,
    maxCopies: 2,
    keywords: ["garde"],
    text:
      "Garde. À son arrivée — Placez un marqueur Souillure sur jusqu'à deux autres unités. Si la mer est en Tempête, " +
      "cette unité gagne +1/+1 permanent.",
    onPlayEffects: [
      choisirCreatures("toutes", 2, [souiller(LA_CIBLE)], { excludeSelf: true }),
      { type: "buff", target: { kind: "self" }, amount: flat(1), permanent: true, conditionTideStateIn: ["tempete"] },
    ],
  }),
  bienfait({
    id: "le-gardien-des-benis",
    name: "Le Gardien des Bénis",
    type: "creature",
    subtypes: ["habitant", "cultiste"],
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 3,
    keywords: ["garde"],
    text: "Garde. Toutes les unités bénies gagnent +1 Résistance.",
    // Alliées ET adverses (Notion, Lot 20 : « accorde son bonus à toutes les unités bénies »).
    auraBuffAllUnits: { targetTypes: ["marin", "creature"], targetCondition: { blessed: true }, healthAmount: 1 },
  }),
  bienfait({
    id: "la-communion-du-sel",
    name: "La Communion du Sel",
    type: "objet",
    cost: 3,
    maxCopies: 2,
    text: "Chaîne — Jusqu'à deux unités alliées deviennent bénies. Votre Navire récupère 1 Ancrage pour chaque unité bénie.",
    // « Pour chaque unité bénie » : celles que vous contrôlez, comptées APRÈS la désignation.
    ...chaineLibre("La Communion du Sel : jusqu'à deux unités alliées deviennent bénies ; 1 Ancrage par unité bénie.", [
      choisirCreatures("allies", 2, [benir(LA_CIBLE)], { restAfterPick: true }),
      {
        type: "heal",
        target: { kind: "controllerPlayer" },
        amount: { kind: "unitsMatching", scope: "controller", cardTypes: ["marin", "creature"], unitCondition: { blessed: true } },
      },
    ]),
  }),
  bienfait({
    id: "le-berceau-du-fond",
    name: "Le Berceau du Fond",
    type: "structure",
    cost: 5,
    health: 5,
    maxCopies: 1,
    text:
      "À votre début de tour — Placez un marqueur Souillure sur une unité adverse. Une fois par tour, lorsqu'une " +
      "unité adverse souillée meurt, votre Navire récupère 2 Ancrage.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "Le Berceau du Fond : un marqueur Souillure sur une unité adverse.",
        effects: [choisirCreatures("adverses", 1, [souiller(LA_CIBLE)])],
      },
      {
        trigger: "onDeath",
        triggeredBy: { opponentOnly: true, cardTypes: ["marin", "creature"], withMarker: "souillure" },
        oncePerTurnKey: "berceauDuFond",
        description: "Une unité adverse souillée meurt : votre Navire récupère 2 Ancrage.",
        effects: [soinNavire(2)],
      },
    ],
  }),
  bienfait({
    id: "ceux-qui-ont-bu",
    name: "Ceux qui ont bu",
    type: "creature",
    subtypes: ["habitant", "mutant"],
    cost: 2,
    attack: 1,
    health: 1,
    maxCopies: 3,
    text: "À son arrivée — Placez un marqueur Souillure sur cette unité. Elle gagne +1/+1 pour chaque marqueur Souillure.",
    onPlayEffects: [souiller({ kind: "self" })],
    selfBuffWhenConditions: [{ perSelfMarker: "souillure", attackAmount: 1, healthAmount: 1 }],
  }),
  grandBienfaiteur("le-grand-bienfaiteur", false),
  grandBienfaiteur("le-grand-bienfaiteur-abyssal", true),
  bienfait({
    id: "la-mer-rend-les-siens",
    name: "La Mer rend les siens",
    type: "anomalie",
    permanent: false,
    cost: 2,
    // Notion : Rare, 3 exemplaires par deck — écart signalé, pas corrigé (CLAUDE.md, règle 9).
    maxCopies: 3,
    text:
      "Choisissez une unité de votre Cimetière et ajoutez-la à votre main. Si elle était bénie lorsqu'elle a quitté " +
      "le plateau, placez-la directement sur votre plateau à la place.",
    onPlayEffects: [
      {
        type: "pickFromGraveyard",
        target: { kind: "controllerPlayer" },
        filter: { cardTypes: ["marin", "creature"] },
        uses: 1,
        takeTo: "hand",
        takeToIf: { condition: { blessed: true }, takeTo: "board" },
      },
    ],
  }),
  bienfait({
    id: "le-vent-tourne",
    name: "Le Vent tourne",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — La mer passe en Houle. Si elle est déjà en Houle, augmentez sa durée restante de 3 tours de table.",
    // La prolongation se lit d'abord : déjà en Houle, le passage en Houle ne change rien.
    ...chaineLibre("Le Vent tourne : la mer passe en Houle (déjà en Houle : +3 tours de table).", [
      { type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: flat(3), conditionTideStateIn: ["houle"] },
      { type: "tideSetState", target: { kind: "allPlayers" }, tideState: "houle" },
    ]),
  }),
  bienfait({
    id: "la-colere-des-profondeurs",
    name: "La Colère des Profondeurs",
    type: "objet",
    cost: 3,
    maxCopies: 3,
    text: "Chaîne — La mer passe en Tempête. Placez un marqueur Souillure sur une unité de votre choix.",
    ...chaineLibre("La Colère des Profondeurs : la mer passe en Tempête, et un marqueur Souillure sur une unité.", [
      { type: "tideSetState", target: { kind: "allPlayers" }, tideState: "tempete" },
      souiller(UNE_CREATURE),
    ]),
  }),
  bienfait({
    id: "lancre-des-marees",
    name: "L'Ancre des Marées",
    type: "structure",
    cost: 3,
    health: 3,
    maxCopies: 2,
    durationTurns: 3,
    text: "Durée : 3 tours de table. Tant que cette Structure est en jeu, la mer ne peut pas redescendre sous Houle.",
    tideFloorWhileInPlay: "houle",
  }),
  bienfait({
    id: "brumesel",
    name: "Brumesel",
    type: "lande",
    cost: 5,
    maxCopies: 1,
    text:
      "Durée : 3 tours de table. Une fois par tour, vous pouvez retirer tous les marqueurs Souillure du plateau. " +
      "Infligez autant de dégâts au Navire adverse que de marqueurs retirés de cette façon.",
    lande: {
      durationTableTurns: 3,
      activatableOncePerTurn: {
        effects: [
          { type: "removeMarkers", target: { kind: "allUnits" }, marker: "souillure" },
          { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "markersRemoved" } },
        ],
      },
    },
  }),
  bienfait({
    id: "le-fidele-du-bienfaiteur",
    name: "Le Fidèle du Bienfaiteur",
    type: "creature",
    subtypes: ["habitant", "cultiste"],
    cost: 2,
    attack: 1,
    health: 3,
    maxCopies: 3,
    text: "À son arrivée — Cette unité gagne +1 Puissance pour chaque marqueur Souillure présent sur le plateau.",
    // Compté à l'arrivée, gardé tant qu'elle est en jeu.
    onPlayEffects: [
      {
        type: "buff",
        target: { kind: "self" },
        attackAmount: { kind: "markersOnBoard", marker: "souillure", scope: "all" },
        healthAmount: flat(0),
        permanent: true,
      },
    ],
  }),
  bienfait({
    id: "lapotre-des-profondeurs",
    name: "L'Apôtre des Profondeurs",
    type: "creature",
    subtypes: ["cultiste"],
    cost: 5,
    attack: 3,
    health: 5,
    maxCopies: 2,
    text:
      "À son arrivée — Jusqu'à deux autres unités alliées deviennent bénies. Une fois par tour, lorsqu'une unité " +
      "adverse reçoit un marqueur Souillure, votre Navire récupère 1 Ancrage.",
    onPlayEffects: [choisirCreatures("allies", 2, [benir(LA_CIBLE)], { excludeSelf: true })],
    abilities: [
      {
        trigger: "onMarkerAdded",
        triggeredBy: { opponentOnly: true, cardTypes: ["marin", "creature"], markerAdded: "souillure" },
        oncePerTurnKey: "apotreSouillure",
        description: "Une unité adverse reçoit un marqueur Souillure : votre Navire récupère 1 Ancrage.",
        effects: [soinNavire(1)],
      },
    ],
  }),
  bienfait({
    id: "la-chapelle-des-bienheureux",
    name: "La Chapelle des Bienheureux",
    type: "structure",
    cost: 3,
    health: 4,
    maxCopies: 3,
    text:
      "À votre début de tour — Vous pouvez choisir une unité alliée non bénie. Elle devient bénie. Si vous contrôlez " +
      "au moins trois unités bénies, votre Navire récupère 1 Ancrage pour chaque unité bénie que vous contrôlez.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "La Chapelle des Bienheureux : une unité alliée non bénie devient bénie ; 3 bénies ou plus, 1 Ancrage par bénie.",
        effects: (() => {
          const benies: EffectAmount = { kind: "unitsMatching", scope: "controller", cardTypes: ["marin", "creature"], unitCondition: { blessed: true } };
          return [
            // « Vous pouvez » : la question se refuse (aucune désignation).
            choisirCreatures("allies", 1, [benir(LA_CIBLE)], { unitCondition: NON_BENIE, restAfterPick: true, refusable: true }),
            { type: "heal", target: { kind: "controllerPlayer" }, amount: benies, conditionCountAtLeast: { count: benies, atLeast: 3 } },
          ];
        })(),
      },
    ],
  }),
  bienfait({
    id: "lencensoir-des-abysses",
    name: "L'Encensoir des Abysses",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Choisissez une unité. Si elle est alliée, elle devient bénie. Si elle est adverse, placez un marqueur Souillure sur elle.",
    ...chaineLibre("L'Encensoir des Abysses : une unité alliée devient bénie, ou une unité adverse reçoit un marqueur Souillure.", [
      benir(UNE_CREATURE, { conditionChosenTarget: { side: "ally" } }),
      souiller(UNE_CREATURE, { conditionChosenTarget: { side: "enemy" } }),
    ]),
  }),
  bienfait({
    id: "la-carte-des-brumes",
    name: "La Carte des Brumes",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Cherchez une carte Lande dans votre deck, révélez-la et ajoutez-la à votre main. Mélangez ensuite votre deck.",
    ...chaineLibre("La Carte des Brumes : cherchez une Lande dans votre deck et ajoutez-la à votre main.", [
      {
        type: "lookAtDeckTop",
        target: { kind: "controllerPlayer" },
        amount: flat(0),
        searchWholeDeck: true,
        filter: { cardTypes: ["lande"] },
        uses: 1,
        restTo: "shuffle",
      },
    ]),
  }),
];

// =============================================================================
// LOT 21 — L'ÉQUIPAGE FÉLIN (30 cartes)
// =============================================================================

/** Amiral Griffenoire, et sa variante Abyssale : même texte, même corps. */
function amiralGriffenoire(id: string, abyssale: boolean): CardDefinition {
  return felin({
    id,
    name: "Amiral Griffenoire",
    type: "creature",
    subtypes: ["felin", "amiral"],
    ...(abyssale ? { variant: "abyssale" as const } : {}),
    cost: 7,
    attack: 5,
    health: 7,
    maxCopies: 1,
    keywords: ["garde"],
    qualifications: [{ id: "contournement" }],
    text:
      "Garde. Contournement. À son arrivée — Jusqu'à deux autres unités alliées gagnent Voile. Une fois par tour, " +
      "lorsqu'une unité alliée perd Voile, placez un marqueur +1/+1 sur toutes vos unités.",
    onPlayEffects: [choisirCreatures("allies", 2, [voile(LA_CIBLE)], { excludeSelf: true })],
    abilities: [
      auVoilePerdu(
        "Une unité alliée perd Voile : un marqueur +1/+1 sur toutes vos unités.",
        [plusUn({ kind: "allAllyUnits" }, { filter: { cardTypes: ["marin", "creature"] } })],
        { oncePerTurnKey: "griffenoireVoile" }
      ),
    ],
  });
}

export const EQUIPAGE_FELIN_SET: CardDefinition[] = [
  felin({
    id: "capitaine-moustache",
    name: "Capitaine Moustache",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 5,
    attack: 3,
    health: 5,
    maxCopies: 2,
    keywords: ["garde"],
    text:
      "Garde. À son arrivée — Une autre unité alliée gagne Voile. Une fois par tour, lorsqu'un Voile allié est " +
      "consommé, votre Navire récupère 1 Ancrage.",
    onPlayEffects: [voile(AUTRE_CREATURE_ALLIEE)],
    abilities: [
      {
        trigger: "onVeilLost",
        // « Un Voile allié » : celui de n'importe quel permanent allié, le sien compris.
        triggeredBy: { excludeSelf: false },
        oncePerTurnKey: "moustacheVoile",
        description: "Un Voile allié est consommé : votre Navire récupère 1 Ancrage.",
        effects: [soinNavire(1)],
      },
    ],
  }),
  felin({
    id: "mousse-patapouf",
    name: "Mousse Patapouf",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 1,
    attack: 1,
    health: 2,
    maxCopies: 3,
    text: "À son arrivée — Si la mer est au Calme, cette unité gagne Voile.",
    onPlayEffects: [voile({ kind: "self" }, { conditionTideStateIn: ["calme"] })],
  }),
  felin({
    id: "le-chat-de-vigie",
    name: "Le Chat de Vigie",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 3,
    attack: 2,
    health: 3,
    maxCopies: 3,
    keywords: ["garde"],
    text: "Garde. Lorsqu'une unité alliée perd Voile, placez un marqueur +1/+1 sur cette unité.",
    abilities: [auVoilePerdu("Une unité alliée perd Voile : un marqueur +1/+1 sur Le Chat de Vigie.", [plusUn({ kind: "self" })])],
  }),
  felin({
    id: "le-matelot-aux-neuf-vies",
    name: "Le Matelot aux Neuf Vies",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 2,
    attack: 2,
    health: 2,
    maxCopies: 3,
    text: "La première fois que cette unité devrait être détruite, elle ne l'est pas et placez un marqueur +1/+1 sur elle.",
    // Un seul sauvetage pour la partie ; elle reste en jeu avec 1 Résistance, puis reçoit son marqueur.
    survivesLethalOncePerTurn: { onceEver: true },
    abilities: [
      {
        trigger: "onDestructionPrevented",
        description: "Le Matelot aux Neuf Vies échappe à sa destruction : un marqueur +1/+1 sur lui.",
        effects: [plusUn({ kind: "self" })],
      },
    ],
  }),
  felin({
    id: "la-timoniere-ecume",
    name: "La Timonière Écume",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 3,
    text: "À son arrivée — La mer passe au Calme.",
    onPlayEffects: [{ type: "tideSetState", target: { kind: "allPlayers" }, tideState: "calme" }],
  }),
  felin({
    id: "le-gros-bosco",
    name: "Le Gros Bosco",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 4,
    attack: 3,
    health: 4,
    maxCopies: 2,
    keywords: ["garde"],
    text: "Garde. Tant que cette unité bénéficie de Voile, les autres unités alliées gagnent +1 Résistance.",
    auraBuffControllerCardTypes: { targetTypes: ["marin", "creature"], whileSelf: { hasVeil: true }, healthAmount: 1 },
  }),
  felin({
    id: "le-quartier-maitre-griffacier",
    name: "Le Quartier-Maître Griffacier",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 3,
    attack: 2,
    health: 3,
    maxCopies: 3,
    text: "À son arrivée — Une autre unité alliée gagne Voile.",
    onPlayEffects: [voile(AUTRE_CREATURE_ALLIEE)],
  }),
  felin({
    id: "sir-ronron-chevalier-du-pont",
    name: "Sir Ronron, Chevalier du Pont",
    type: "creature",
    subtypes: ["felin", "chevalier"],
    cost: 4,
    attack: 3,
    health: 4,
    maxCopies: 2,
    keywords: ["garde"],
    text: "Garde. Chaque fois qu'une autre unité alliée perd Voile, placez un marqueur +1/+1 sur cette unité.",
    abilities: [auVoilePerdu("Une autre unité alliée perd Voile : un marqueur +1/+1 sur Sir Ronron.", [plusUn({ kind: "self" })], {}, true)],
  }),
  felin({
    id: "la-guerisseuse-aux-coussinets",
    name: "La Guérisseuse aux Coussinets",
    type: "creature",
    subtypes: ["felin", "soigneur"],
    cost: 3,
    attack: 1,
    health: 4,
    maxCopies: 3,
    text: "Lorsqu'une unité alliée gagne un marqueur +1/+1, votre Navire récupère 1 Ancrage.",
    abilities: [auPlusUn("Une unité alliée gagne un marqueur +1/+1 : votre Navire récupère 1 Ancrage.", [soinNavire(1)])],
  }),
  felin({
    id: "le-petit-porte-bouclier",
    name: "Le Petit Porte-Bouclier",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 2,
    attack: 1,
    health: 3,
    maxCopies: 3,
    keywords: ["garde"],
    text: "Garde. À son arrivée — Si la mer est au Calme, cette unité gagne Voile.",
    onPlayEffects: [voile({ kind: "self" }, { conditionTideStateIn: ["calme"] })],
  }),
  felin({
    id: "une-vie-de-plus",
    name: "Une Vie de Plus !",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Une unité alliée gagne Voile. Si elle bénéficie déjà de Voile, placez un marqueur +1/+1 sur elle à la place.",
    // Le marqueur d'abord, lu sur son état d'avant : le Voile qui suit ne s'ajoute pas à un Voile existant.
    ...chaineLibre("Une Vie de Plus ! : une unité alliée gagne Voile (ou un marqueur +1/+1 si elle en a déjà un).", [
      plusUn(CREATURE_ALLIEE, { conditionChosenTarget: { hasVeil: true } }),
      voile(CREATURE_ALLIEE),
    ]),
  }),
  felin({
    id: "ration-de-poisson-frais",
    name: "Ration de Poisson Frais",
    type: "objet",
    cost: 1,
    maxCopies: 3,
    text: "Chaîne — Votre Navire récupère 2 Ancrage. Si la mer est au Calme, placez également un marqueur +1/+1 sur une unité alliée.",
    ...chaineLibre("Ration de Poisson Frais : votre Navire récupère 2 Ancrage (et un marqueur +1/+1 au Calme).", [
      soinNavire(2),
      choisirCreatures("allies", 1, [plusUn(LA_CIBLE)], { conditionTideStateIn: ["calme"] }),
    ]),
  }),
  felin({
    id: "le-bastion-des-coussinets",
    name: "Le Bastion des Coussinets",
    type: "structure",
    cost: 4,
    health: 5,
    maxCopies: 2,
    text: "Une fois par tour, lorsqu'une unité alliée perd Voile, une autre unité alliée qui n'en bénéficie pas gagne Voile.",
    abilities: [
      auVoilePerdu(
        "Une unité alliée perd Voile : une autre unité alliée sans Voile gagne Voile.",
        [choisirCreatures("allies", 1, [voile(LA_CIBLE)], { unitCondition: { hasVeil: false }, excludeTriggerSource: true })],
        { oncePerTurnKey: "bastionVoile" }
      ),
    ],
  }),
  felin({
    id: "la-cabine-du-capitaine",
    name: "La Cabine du Capitaine",
    type: "structure",
    cost: 3,
    health: 3,
    maxCopies: 2,
    text: "À votre début de tour — Choisissez une unité alliée. Placez un marqueur +1/+1 sur elle.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "La Cabine du Capitaine : un marqueur +1/+1 sur une unité alliée.",
        effects: [choisirCreatures("allies", 1, [plusUn(LA_CIBLE)])],
      },
    ],
  }),
  felin({
    id: "griffe-rousse-labordeur",
    name: "Griffe-Rousse, l'Abordeur",
    type: "creature",
    subtypes: ["felin", "pirate"],
    cost: 3,
    attack: 3,
    health: 2,
    maxCopies: 3,
    text: "Lorsqu'une autre unité alliée perd Voile, cette unité gagne +1 Puissance.",
    // Sans durée dans le texte : le bonus reste tant qu'elle est en jeu (même lecture que On joue aux morts).
    abilities: [
      auVoilePerdu(
        "Une autre unité alliée perd Voile : Griffe-Rousse gagne +1 Puissance.",
        [{ type: "buff", target: { kind: "self" }, attackAmount: flat(1), healthAmount: flat(0), permanent: true }],
        {},
        true
      ),
    ],
  }),
  felin({
    id: "la-duelliste-aux-sept-griffes",
    name: "La Duelliste aux Sept Griffes",
    type: "creature",
    subtypes: ["felin", "pirate"],
    cost: 4,
    attack: 3,
    health: 4,
    maxCopies: 2,
    qualifications: [{ id: "contournement" }],
    text: "Contournement.",
  }),
  felin({
    id: "le-canonnier-ronchon",
    name: "Le Canonnier Ronchon",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 4,
    attack: 2,
    health: 4,
    maxCopies: 3,
    text: "Lorsqu'une unité alliée gagne un marqueur +1/+1, infligez 1 dégât à une unité adverse de votre choix.",
    // Une unité désignée : le joueur la pointe dans une fenêtre (CLAUDE.md, règle 3).
    abilities: [
      auPlusUn(
        "Une unité alliée gagne un marqueur +1/+1 : 1 dégât à une unité adverse de votre choix.",
        [{ type: "damage", target: { kind: "chosenUnit", among: { cardTypes: ["marin", "creature"], opponentOnly: true } }, amount: flat(1) }],
        { mode: "optional" }
      ),
    ],
  }),
  amiralGriffenoire("amiral-griffenoire", false),
  amiralGriffenoire("amiral-griffenoire-abyssal", true),
  felin({
    id: "a-labordage",
    name: "À l'Abordage !",
    type: "objet",
    cost: 3,
    maxCopies: 3,
    text: "Chaîne — Jusqu'à trois unités alliées gagnent +1 Puissance jusqu'à la fin du tour.",
    ...chaineLibre("À l'Abordage ! : jusqu'à trois unités alliées gagnent +1 Puissance jusqu'à la fin du tour.", [
      choisirCreatures("allies", 3, [{ type: "buff", target: LA_CIBLE, attackAmount: flat(1), healthAmount: flat(0), duration: "endOfTurn" }]),
    ]),
  }),
  felin({
    id: "on-retombe-sur-nos-pattes",
    name: "On Retombe sur Nos Pattes !",
    type: "objet",
    cost: 2,
    maxCopies: 2,
    chaine: true,
    text: "Chaîne — Lorsqu'une unité alliée devrait être détruite, elle ne l'est pas. Placez un marqueur +1/+1 sur elle.",
    abilities: [
      {
        trigger: "onPermanentWouldBeDestroyed",
        triggeredBy: { cardTypes: ["marin", "creature"] },
        mode: "optional",
        description: "On Retombe sur Nos Pattes ! : votre unité n'est pas détruite et reçoit un marqueur +1/+1.",
        effects: [
          { type: "surviveWithHealth", target: { kind: "triggerSource" }, amount: flat(1) },
          plusUn({ kind: "triggerSource" }),
        ],
      },
    ],
  }),
  felin({
    id: "la-mer-aux-coussinets",
    name: "La Mer aux Coussinets",
    type: "structure",
    cost: 4,
    health: 4,
    maxCopies: 2,
    durationTurns: 3,
    text:
      "Durée : 3 tours de table. À votre début de tour — Si la mer est au Calme, une unité alliée qui ne bénéficie " +
      "pas de Voile gagne Voile. Si elle est en Houle, placez un marqueur +1/+1 sur une unité alliée.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "La Mer aux Coussinets : Voile à une unité alliée (Calme), ou un marqueur +1/+1 (Houle).",
        effects: [
          choisirCreatures("allies", 1, [voile(LA_CIBLE)], { unitCondition: { hasVeil: false }, conditionTideStateIn: ["calme"] }),
          choisirCreatures("allies", 1, [plusUn(LA_CIBLE)], { conditionTideStateIn: ["houle"] }),
        ],
      },
    ],
  }),
  felin({
    id: "le-gouvernail-des-marees",
    name: "Le Gouvernail des Marées",
    type: "structure",
    cost: 3,
    health: 4,
    maxCopies: 2,
    text: "Une fois par tour, à votre début de tour — Vous pouvez faire passer la mer du Calme à la Houle ou de la Houle au Calme.",
    abilities: [
      {
        trigger: "startOfTurn",
        mode: "optional",
        oncePerTurnKey: "gouvernail",
        condition: { tideStateIn: ["calme"] },
        description: "Le Gouvernail des Marées : la mer passe du Calme à la Houle.",
        effects: [{ type: "tideSetState", target: { kind: "allPlayers" }, tideState: "houle" }],
      },
      {
        trigger: "startOfTurn",
        mode: "optional",
        oncePerTurnKey: "gouvernail",
        condition: { tideStateIn: ["houle"] },
        description: "Le Gouvernail des Marées : la mer passe de la Houle au Calme.",
        effects: [{ type: "tideSetState", target: { kind: "allPlayers" }, tideState: "calme" }],
      },
    ],
  }),
  felin({
    id: "la-derniere-sardine",
    name: "La Dernière Sardine",
    type: "objet",
    cost: 1,
    maxCopies: 3,
    text: "Chaîne — Piochez 1 carte. Si votre Navire a récupéré de l'Ancrage ce tour, placez également un marqueur +1/+1 sur une unité alliée.",
    ...chaineLibre("La Dernière Sardine : piochez 1 carte (et un marqueur +1/+1 si votre Navire a récupéré de l'Ancrage ce tour).", [
      pioche(1),
      choisirCreatures("allies", 1, [plusUn(LA_CIBLE)], { conditionControllerShipHealedThisTurn: true }),
    ]),
  }),
  felin({
    id: "lappat-a-moustaches",
    name: "L'Appât à Moustaches",
    type: "creature",
    subtypes: ["felin"],
    cost: 2,
    attack: 1,
    health: 1,
    // Notion : Rare, 3 exemplaires par deck — écart signalé, pas corrigé (CLAUDE.md, règle 9).
    maxCopies: 3,
    text: "Les autres unités Félines alliées gagnent +2/+2.",
    // Une aura ne s'applique jamais à sa source : « les autres ». Plusieurs Appâts s'additionnent.
    auraBuffControllerCardTypes: { targetTypes: ["marin", "creature"], targetSubtype: "felin", attackAmount: 2, healthAmount: 2 },
  }),
  felin({
    id: "la-vigie-aux-pattes-seches",
    name: "La Vigie aux Pattes Sèches",
    type: "creature",
    subtypes: ["felin", "marin"],
    cost: 3,
    attack: 2,
    health: 3,
    maxCopies: 3,
    keywords: ["pied-marin"],
    text: "Pied marin. Tant que la mer est au Calme, cette unité gagne +1 Puissance. Tant qu'elle est en Houle, elle gagne +1 Résistance.",
    selfBuffWhenConditions: [
      { when: { tideStateIn: ["calme"] }, attackAmount: 1 },
      { when: { tideStateIn: ["houle"] }, healthAmount: 1 },
    ],
  }),
  felin({
    id: "le-medecin-de-bord",
    name: "Le Médecin de Bord",
    type: "creature",
    subtypes: ["felin", "soigneur"],
    cost: 4,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text: "À son arrivée — Votre Navire récupère 3 Ancrage. Si vous contrôlez une unité bénéficiant de Voile, piochez 1 carte.",
    onPlayEffects: [
      soinNavire(3),
      pioche(1, {
        conditionCountAtLeast: { count: { kind: "unitsMatching", scope: "controller", cardTypes: ["marin", "creature"], unitCondition: { hasVeil: true } }, atLeast: 1 },
      }),
    ],
  }),
  felin({
    id: "toutes-voiles-dehors",
    name: "Toutes Voiles Dehors !",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Choisissez : la mer passe au Calme ou en Houle. Piochez 1 carte.",
    ...(() => {
      const base = chaineLibre("Toutes Voiles Dehors ! : la mer passe au Calme ou en Houle, puis piochez 1 carte.", [
        { type: "chooseAbilityOption", target: { kind: "controllerPlayer" }, optionGroup: "toutesVoiles" },
        pioche(1),
      ]);
      return {
        ...base,
        abilities: [
          ...(base.abilities ?? []),
          { trigger: "onChosenOption", choiceGroup: "toutesVoiles", description: "La mer passe au Calme.", effects: [{ type: "tideSetState", target: { kind: "allPlayers" }, tideState: "calme" }] },
          { trigger: "onChosenOption", choiceGroup: "toutesVoiles", description: "La mer passe en Houle.", effects: [{ type: "tideSetState", target: { kind: "allPlayers" }, tideState: "houle" }] },
        ] satisfies TriggeredAbility[],
      };
    })(),
  }),
  felin({
    id: "la-patte-du-destin",
    name: "La Patte du Destin",
    type: "objet",
    cost: 3,
    maxCopies: 2,
    text: "Chaîne — Choisissez une unité alliée. Elle gagne Voile et un marqueur +1/+1.",
    ...chaineLibre("La Patte du Destin : une unité alliée gagne Voile et un marqueur +1/+1.", [voile(CREATURE_ALLIEE), plusUn(CREATURE_ALLIEE)]),
  }),
  felin({
    id: "la-cloche-du-rassemblement",
    name: "La Cloche du Rassemblement",
    type: "structure",
    cost: 3,
    health: 3,
    maxCopies: 3,
    text: "Une fois par tour, lorsqu'une unité alliée gagne Voile, vous pouvez placer un marqueur +1/+1 sur une autre unité alliée.",
    abilities: [
      {
        trigger: "onVeilGained",
        triggeredBy: { cardTypes: ["marin", "creature"] },
        mode: "optional",
        oncePerTurnKey: "clocheRassemblement",
        description: "Une unité alliée gagne Voile : un marqueur +1/+1 sur une autre unité alliée.",
        effects: [plusUn({ kind: "chosenUnit", among: { cardTypes: ["marin", "creature"], excludeTriggerSource: true } })],
      },
    ],
  }),
  felin({
    id: "les-neuf-vies-de-lequipage",
    name: "Les Neuf Vies de l'Équipage",
    type: "anomalie",
    permanent: false,
    cost: 5,
    // Notion : Légendaire, 2 exemplaires par deck — écart signalé, pas corrigé (CLAUDE.md, règle 9).
    maxCopies: 2,
    text:
      "Toutes vos unités récupèrent toute leur Résistance. Celles qui ne bénéficient pas de Voile gagnent Voile. " +
      "Celles qui en bénéficient déjà reçoivent un marqueur +1/+1 à la place.",
    // Le marqueur d'abord, sur celles qui avaient DÉJÀ Voile ; puis Voile aux autres.
    onPlayEffects: [
      { type: "heal", target: { kind: "allAllyUnits" }, filter: { cardTypes: ["marin", "creature"] }, healFully: true, amount: flat(0) },
      plusUn({ kind: "allAllyUnits" }, { filter: { cardTypes: ["marin", "creature"], unitCondition: { hasVeil: true } } }),
      voile({ kind: "allAllyUnits" }, { filter: { cardTypes: ["marin", "creature"] } }),
    ],
  }),
];

/** Les 66 cartes du booster et les deux variantes Abyssales. */
export const LA_MAREE_BENIE_SET: CardDefinition[] = [...BIENFAITS_DU_FOND_SET, ...EQUIPAGE_FELIN_SET];

/**
 * EN ATTENTE DE LEUR ILLUSTRATION (décision du 27/10/2026) : écrites et
 * testées, mais ni au catalogue, ni en collection, ni dans le pool du
 * booster tant que leur visuel n'est pas livré. Une carte en sort quand son
 * illustration arrive — retirer son id de cette liste suffit.
 */
const EN_ATTENTE_D_ILLUSTRATION: ReadonlySet<string> = new Set([...EQUIPAGE_FELIN_SET.map((def) => def.id), "lancre-des-marees"]);

/** Les cartes du booster distribuées aujourd'hui. */
export const LA_MAREE_BENIE_PUBLIEES: CardDefinition[] = LA_MAREE_BENIE_SET.filter((def) => !EN_ATTENTE_D_ILLUSTRATION.has(def.id));

/** Les cartes du booster retenues jusqu'à leur illustration. */
export const LA_MAREE_BENIE_EN_ATTENTE: CardDefinition[] = LA_MAREE_BENIE_SET.filter((def) => EN_ATTENTE_D_ILLUSTRATION.has(def.id));
