import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { DieOutcomeBranch } from "@/game/state/types";

/**
 * LOT 17 — DUNGEON ET LADALLE / OPALINS (Notion « Catalogue de cartes » ›
 * « Lot 15 — Dungeon et Ladalle / Opalins — VALIDÉ », renuméroté Lot 17 le
 * 05/10/2026 : les Lots 15 et 16 sont Éclats en Selle et les Altérés).
 *
 * Trois blocs :
 *  - DUNGEON ET LADALLE : une troupe d'aventuriers qui LANCE DES DÉS
 *    (`CardDefinition.die`, effet `rollDie`, `game/rules/dice.ts`). Réussite
 *    critique = face max, Échec critique = 1 ; les Objets « Chaîne » se
 *    Brisent pendant le jet, avant sa résolution ;
 *  - OPALINS : de grosses Créatures à valeur récurrente, l'ARMURE du Navire
 *    (`game/state/armor.ts`), la lignée LV (`game/rules/levels.ts`) et
 *    « son texte est ignoré » ;
 *  - GÉNÉRIQUES / PASSERELLES : Landes, renvois en main, filtrage.
 *
 * Textes : ceux de Notion, alignés sur le vocabulaire du jeu (décision du
 * 05/10/2026) — « Terrain » devient Lande (et sa durée se compte en tours de
 * table, comme toute Lande), « défausse » (la zone) devient Cimetière. Le
 * sens ne change pas. Valeurs : celles de Notion — rien n'est rééquilibré.
 *
 * Cartographe Opalin méfiant (n° 29) est déjà en jeu depuis le 05/10/2026
 * (`landes.ts`) : il n'est pas redéfini ici.
 */

/** Lot de diffusion, miroir de `cards.set_code` (aucun booster encore). */
export const DUNGEON_ET_LADALLE = "dungeon-et-ladalle";

const DL = "dungeon-et-ladalle" as const;
const OPALIN = "opalin" as const;
const UNITES = ["marin", "creature"] as const;

// --- Petits constructeurs ----------------------------------------------------

const flat = (value: number) => ({ kind: "flat" as const, value });

/** « Lancez » : les branches du jet de la carte. */
function lancez(branches: DieOutcomeBranch[], options: Partial<EffectDefinition> = {}): EffectDefinition {
  return { type: "rollDie", target: { kind: "self" }, dieBranches: branches, ...options };
}

const surSoi = (effet: Omit<EffectDefinition, "target">): EffectDefinition => ({ ...effet, target: { kind: "self" } }) as EffectDefinition;

/** « gagne Pied marin ce tour ». */
const PIED_MARIN_CE_TOUR: EffectDefinition = {
  type: "buff",
  target: { kind: "self" },
  attackAmount: flat(0),
  healthAmount: flat(0),
  grantKeywords: ["pied-marin"],
  duration: "endOfTurn",
};

/** Buff sur soi. */
function buffSoi(attack: number, health: number, duration: "endOfTurn" | "untilYourNextTurn" | "permanent"): EffectDefinition {
  return duration === "permanent"
    ? { type: "buff", target: { kind: "self" }, attackAmount: flat(attack), healthAmount: flat(health), permanent: true }
    : { type: "buff", target: { kind: "self" }, attackAmount: flat(attack), healthAmount: flat(health), duration };
}

/** « une unité Opaline que vous contrôlez gagne … » : la question qui la désigne. */
function uneOpalineGagne(attack: number, health: number): EffectDefinition {
  return {
    type: "pickUnits",
    target: { kind: "allAllyUnits" },
    filter: { cardTypes: [...UNITES], archetype: OPALIN },
    uses: 1,
    thenEffects: [
      { type: "buff", target: { kind: "triggerSource" }, attackAmount: flat(attack), healthAmount: flat(health), duration: "untilYourNextTurn" },
    ],
  };
}

/** Une option de « Choisissez : … » (`chooseAbilityOption`). */
function option(groupe: string, description: string, effects: EffectDefinition[]): TriggeredAbility {
  return { trigger: "onChosenOption", choiceGroup: groupe, description, effects };
}

/** « Déplacez immédiatement la Marée d'un état dans le sens de votre choix » : deux options. */
function deplacerLaMaree(groupe: string): TriggeredAbility[] {
  return [
    option(groupe, "La Marée avance d'un état.", [{ type: "tideForceAdvance", target: { kind: "allPlayers" } }]),
    option(groupe, "La Marée recule d'un état.", [{ type: "tideForceRetreat", target: { kind: "allPlayers" } }]),
  ];
}

// --- Dungeon et Ladalle (28) ---------------------------------------------------

const DUNGEON: CardDefinition[] = [
  {
    id: "gaston-aventurier-de-ladalle",
    name: "Gaston, Aventurier de Ladalle",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 3,
    health: 2,
    die: 6,
    maxCopies: 3,
    text: "À l'arrivée : gagne +?/+0 tant qu'il reste en jeu. Réussite critique : gagne Pied marin ce tour. Échec critique : subit 1 dégât.",
    onPlayEffects: [
      lancez([
        { effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "dieResult" }, healthAmount: flat(0), permanent: true }] },
        { when: { critical: "success" }, effects: [PIED_MARIN_CE_TOUR] },
        { when: { critical: "failure" }, effects: [surSoi({ type: "damage", amount: flat(1) })] },
      ]),
    ],
  },
  {
    id: "miss-franche-comte-1987-roublarde-aux-des-pipes",
    name: "Miss Franche-Comté 1987, Roublarde aux dés pipés",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 2,
    health: 3,
    die: 6,
    maxCopies: 2,
    text:
      "Une fois par tour, après l'un de vos jets, modifiez son résultat de +1 ou -1. Réussite critique : vous pouvez " +
      "modifier immédiatement un autre de vos jets ce tour de +1 ou -1. Échec critique : Miss Franche-Comté 1987 perd " +
      "-1/-1 jusqu'à votre prochain tour.",
    dieAdjustOncePerTurn: {
      amount: 1,
      extraUseOnCriticalSuccess: true,
      ifCriticalFailure: [buffSoi(-1, -1, "untilYourNextTurn")],
    },
  },
  {
    id: "balthazar-mage-approximatif",
    name: "Balthazar, Mage approximatif",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    attack: 3,
    health: 3,
    die: 8,
    maxCopies: 2,
    text:
      "À l'arrivée : infligez 2 dégâts. Lancez : sur 5+, infligez 2 dégâts supplémentaires. Réussite critique : encore " +
      "2 dégâts répartis. Échec critique : Balthazar s'inflige 2 dégâts.",
    // « Infligez 2 dégâts » : à l'unité désignée en le jouant. « Répartis » :
    // 1 dégât à chacune de jusqu'à deux unités, au choix du joueur.
    onPlayEffects: [
      { type: "damage", target: { kind: "chosenUnit", among: { sameController: false, unitsOnly: true } }, amount: flat(2) },
      lancez([
        { when: { min: 5 }, effects: [{ type: "damage", target: { kind: "chosenUnit", among: { sameController: false, unitsOnly: true } }, amount: flat(2) }] },
        {
          when: { critical: "success" },
          effects: [
            {
              type: "pickUnits",
              target: { kind: "allUnits" },
              filter: { cardTypes: [...UNITES] },
              uses: 2,
              thenEffects: [{ type: "damage", target: { kind: "triggerSource" }, amount: flat(1) }],
            },
          ],
        },
        { when: { critical: "failure" }, effects: [surSoi({ type: "damage", amount: flat(2) })] },
      ]),
    ],
  },
  {
    id: "frere-michel-clerc-de-secours",
    name: "Frère Michel, Clerc de secours",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 2,
    health: 3,
    die: 4,
    maxCopies: 3,
    text:
      "À l'arrivée : restaurez ? Résistance répartie entre vos unités et votre Navire. Réussite critique : restaurez 2 " +
      "Résistance supplémentaires. Échec critique : ne restaurez rien et Frère Michel subit 1 dégât.",
    onPlayEffects: [
      lancez(
        [
          { when: { critical: "failure" }, effects: [surSoi({ type: "damage", amount: flat(1) })] },
          {
            when: { critical: "success" },
            effects: [{ type: "healDistributed", target: { kind: "controllerPlayer" }, amount: { kind: "dieResult", plus: 2 }, includeShip: true }],
          },
          { effects: [{ type: "healDistributed", target: { kind: "controllerPlayer" }, amount: { kind: "dieResult" }, includeShip: true }] },
        ],
        { dieBranchMode: "first" }
      ),
    ],
  },
  {
    id: "hubert-paladin-persuade-d-etre-l-elu",
    name: "Hubert, Paladin persuadé d'être l'Élu",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 4,
    attack: 4,
    health: 5,
    die: 6,
    maxCopies: 2,
    text:
      "À l'arrivée : gagnez ? Armure. Réussite critique : Hubert gagne +2/+2 et Garde jusqu'à votre prochain tour. Échec " +
      "critique : perdez 2 Armure ; si vous n'avez pas assez d'Armure, Hubert subit les dégâts restants.",
    onPlayEffects: [
      lancez([
        { effects: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: { kind: "dieResult" } }] },
        {
          when: { critical: "success" },
          effects: [
            { type: "buff", target: { kind: "self" }, attackAmount: flat(2), healthAmount: flat(2), grantKeywords: ["garde"], duration: "untilYourNextTurn" },
          ],
        },
        {
          when: { critical: "failure" },
          effects: [{ type: "loseArmor", target: { kind: "controllerPlayer" }, amount: flat(2), armorShortfallDamagesSource: true }],
        },
      ]),
    ],
  },
  {
    id: "gege-rodeur-du-mauvais-chemin",
    name: "Gégé, Rôdeur du mauvais chemin",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    attack: 3,
    health: 4,
    die: 6,
    maxCopies: 3,
    text:
      "À l'arrivée : regardez les 3 cartes du dessus. Sur 1–3, prenez-en 1. Sur 4–6, prenez-en 2. Échec critique : " +
      "placez 1 carte de votre main sous votre deck puis piochez 1.",
    // Les cartes regardées et non prises repartent sous la pioche.
    onPlayEffects: [
      lancez([
        { when: { max: 3 }, effects: [{ type: "lookAtDeckTop", target: { kind: "controllerPlayer" }, amount: flat(3), uses: 1 }] },
        { when: { min: 4 }, effects: [{ type: "lookAtDeckTop", target: { kind: "controllerPlayer" }, amount: flat(3), uses: 2 }] },
        { when: { critical: "failure" }, effects: [{ type: "handToDeckBottomThenDraw", target: { kind: "controllerPlayer" }, amount: flat(1) }] },
      ]),
    ],
  },
  {
    id: "barnabe-barde-insupportable",
    name: "Barnabé, Barde insupportable",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    attack: 2,
    health: 4,
    die: 4,
    maxCopies: 3,
    text:
      "Première Réussite critique de chacun de vos tours : une unité alliée gagne +1/+1 jusqu'à votre prochain tour. " +
      "Premier Échec critique : Barnabé perd -1/-1 jusqu'à votre prochain tour.",
    abilities: [
      {
        trigger: "onDieResolved",
        condition: { dieOutcomes: ["criticalSuccess"], duringOwnTurn: true },
        oncePerTurnKey: "barnabeReussite",
        description: "Première Réussite critique du tour : une unité alliée gagne +1/+1 jusqu'à votre prochain tour.",
        effects: [
          {
            type: "pickUnits",
            target: { kind: "allAllyUnits" },
            filter: { cardTypes: [...UNITES] },
            uses: 1,
            thenEffects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: flat(1), healthAmount: flat(1), duration: "untilYourNextTurn" }],
          },
        ],
      },
      {
        trigger: "onDieResolved",
        condition: { dieOutcomes: ["criticalFailure"] },
        oncePerTurnKey: "barnabeEchec",
        description: "Premier Échec critique : Barnabé perd -1/-1 jusqu'à votre prochain tour.",
        effects: [buffSoi(-1, -1, "untilYourNextTurn")],
      },
    ],
  },
  {
    id: "maurice-ecuyer-de-troisieme-choix",
    name: "Maurice, Écuyer de troisième choix",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 1,
    attack: 1,
    health: 2,
    die: 4,
    maxCopies: 3,
    text:
      "À l'arrivée : votre prochain jet ce tour gagne +1. S'il devient une Réussite critique, Maurice gagne +1/+1. S'il " +
      "devient un Échec critique, votre prochain jet ce tour subit -1.",
    onPlayEffects: [
      {
        type: "modifyNextRoll",
        target: { kind: "controllerPlayer" },
        nextRollThisTurn: true,
        nextRoll: {
          delta: 1,
          ifCriticalSuccess: [buffSoi(1, 1, "permanent")],
          ifCriticalFailure: [{ type: "modifyNextRoll", target: { kind: "controllerPlayer" }, nextRollThisTurn: true, nextRoll: { delta: -1 } }],
        },
      },
    ],
  },
  {
    id: "gnome-du-sac-sans-fond",
    name: "Gnome du Sac sans Fond",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 2,
    health: 2,
    die: 6,
    maxCopies: 3,
    text: "À l'arrivée : lancez. Réussite : piochez 1. Réussite critique : piochez 2. Échec critique : défaussez 2.",
    onPlayEffects: [
      lancez(
        [
          { when: { critical: "success" }, effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: flat(2) }] },
          { when: { success: true }, effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: flat(1) }] },
          { when: { critical: "failure" }, effects: [{ type: "discard", target: { kind: "controllerPlayer" }, amount: flat(2) }] },
        ],
        { dieBranchMode: "first" }
      ),
    ],
  },
  {
    id: "le-nain-qui-connait-un-raccourci",
    name: "Le Nain qui connaît un raccourci",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 3,
    health: 3,
    die: 4,
    maxCopies: 3,
    text: "À l'arrivée : sur 3–4, votre prochaine carte ce tour coûte 1 de moins. Réussite critique : 2 de moins à la place.",
    onPlayEffects: [
      lancez(
        [
          { when: { critical: "success" }, effects: [{ type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: flat(2) }] },
          { when: { min: 3, max: 4 }, effects: [{ type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: flat(1) }] },
        ],
        { dieBranchMode: "first" }
      ),
    ],
  },
  {
    id: "brigitte-druidesse-des-caves",
    name: "Brigitte, Druidesse des caves",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    attack: 2,
    health: 4,
    die: 6,
    maxCopies: 3,
    text:
      "À l'arrivée : créez une Bestiole ?/?, plafonnée à 4/4. Réussite critique : la Bestiole gagne aussi Pied marin ce " +
      "tour. Échec critique : ne créez aucune Bestiole et Brigitte subit 1 dégât.",
    onPlayEffects: [
      lancez(
        [
          { when: { critical: "failure" }, effects: [surSoi({ type: "damage", amount: flat(1) })] },
          {
            when: { critical: "success" },
            effects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "bestiole", rush: true, summonStatsFromAmount: true, amount: { kind: "dieResult", max: 4 } }],
          },
          { effects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "bestiole", summonStatsFromAmount: true, amount: { kind: "dieResult", max: 4 } }] },
        ],
        { dieBranchMode: "first" }
      ),
    ],
  },
  {
    id: "norbert-necromancien-amateur",
    name: "Norbert, Nécromancien amateur",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 4,
    attack: 3,
    health: 4,
    die: 6,
    maxCopies: 2,
    text:
      "À l'arrivée : récupérez de votre Cimetière une Créature de coût ≤ moitié du résultat, arrondie au supérieur. " +
      "Réussite critique : coût 4 ou moins.",
    onPlayEffects: [
      lancez(
        [
          { when: { critical: "success" }, effects: [{ type: "pickFromGraveyard", target: { kind: "controllerPlayer" }, filter: { cardTypes: ["creature"], maxCost: 4 }, uses: 1 }] },
          { effects: [{ type: "pickFromGraveyard", target: { kind: "controllerPlayer" }, filter: { cardTypes: ["creature"] }, amount: { kind: "dieResult", half: true }, uses: 1 }] },
        ],
        { dieBranchMode: "first" }
      ),
    ],
  },
  {
    id: "dede-moine-du-premier-degre",
    name: "Dédé, Moine du premier degré",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 2,
    health: 3,
    die: 4,
    maxCopies: 3,
    text: "Après votre premier Échec critique du tour, votre prochain jet ce tour gagne +1.",
    abilities: [
      {
        trigger: "onDieResolved",
        condition: { dieOutcomes: ["criticalFailure"] },
        oncePerTurnKey: "dedeEchec",
        description: "Premier Échec critique du tour : votre prochain jet ce tour gagne +1.",
        effects: [{ type: "modifyNextRoll", target: { kind: "controllerPlayer" }, nextRollThisTurn: true, nextRoll: { delta: 1 } }],
      },
    ],
  },
  {
    id: "rita-sorciere-sous-contrat",
    name: "Rita, Sorcière sous contrat",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 4,
    attack: 4,
    health: 4,
    die: 8,
    maxCopies: 2,
    text: "À l'arrivée : une unité ennemie perd -1/-1. Sur 5+, -2/-2. Réussite critique : -3/-3.",
    onPlayEffects: [
      lancez(
        [3, 2, 1].map((n) => ({
          ...(n === 3 ? { when: { critical: "success" as const } } : n === 2 ? { when: { min: 5 } } : {}),
          effects: [
            {
              type: "buff" as const,
              target: { kind: "chosenUnit" as const, among: { opponentOnly: true, unitsOnly: true } },
              attackAmount: flat(-n),
              healthAmount: flat(-n),
              permanent: true,
            },
          ],
        })),
        { dieBranchMode: "first" }
      ),
    ],
  },
  {
    id: "le-geant-qui-croyait-etre-discret",
    name: "Le Géant qui croyait être discret",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 5,
    attack: 6,
    health: 6,
    die: 6,
    maxCopies: 2,
    text: "À l'arrivée : sur 4+, gagne Pied marin ce tour. Réussite critique : lorsqu'il attaque ce tour, infligez aussi 2 dégâts au Navire adverse.",
    onPlayEffects: [
      lancez([
        { when: { min: 4 }, effects: [PIED_MARIN_CE_TOUR] },
        { when: { critical: "success" }, effects: [{ type: "flagThisTurn", target: { kind: "self" }, flagKey: "geantDiscret" }] },
      ]),
    ],
    abilities: [
      {
        trigger: "onAttack",
        condition: { selfFlaggedThisTurn: "geantDiscret" },
        description: "Après sa Réussite critique : 2 dégâts au Navire adverse lorsqu'il attaque ce tour.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: flat(2) }],
      },
    ],
  },
  {
    id: "le-mimique-du-coffre-evidemment-piege",
    name: "Le Mimique du coffre évidemment piégé",
    type: "creature",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    attack: 3,
    health: 3,
    die: 6,
    maxCopies: 3,
    text:
      "La première fois qu'il est ciblé par un effet ennemi à chaque tour, lancez. Sur 4+, renvoyez-le dans votre main. " +
      "Réussite critique : renvoyez-le dans votre main et réduisez son prochain coût de 1. Échec critique : détruisez-le.",
    abilities: [
      {
        trigger: "onUnitTargeted",
        oncePerTurnKey: "mimiqueCible",
        description: "Ciblé par un effet ennemi : il lance son dé.",
        effects: [
          lancez(
            [
              {
                when: { critical: "success" },
                effects: [
                  { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: flat(1), discountOnlySource: true, lastsExtraTurns: 999 },
                  { type: "moveZone", target: { kind: "self" }, toZone: "hand" },
                ],
              },
              { when: { min: 4 }, effects: [{ type: "moveZone", target: { kind: "self" }, toZone: "hand" }] },
              { when: { critical: "failure" }, effects: [{ type: "destroy", target: { kind: "self" } }] },
            ],
            { dieBranchMode: "first" }
          ),
        ],
      },
    ],
  },
  {
    id: "maitre-de-ladalle",
    name: "Maître de Ladalle",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 5,
    attack: 4,
    health: 6,
    die: 6,
    maxCopies: 1,
    text: "Si Le Donjon de Ladalle est actif, la première relance que vous effectuez à chacun de vos tours gagne +1.",
    rerollBonusWhileLande: { landeCardId: "le-donjon-de-ladalle", bonus: 1 },
  },
  {
    id: "l-aventurier-de-niveau-beaucoup-trop-eleve",
    name: "L'Aventurier de niveau beaucoup trop élevé",
    type: "marin",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 6,
    attack: 6,
    health: 6,
    die: 8,
    maxCopies: 1,
    text:
      "À l'arrivée : 2–3 gagne +1/+1 jusqu'à votre prochain tour ; 4–7 infligez 3 dégâts à une cible ; Réussite critique : " +
      "gagne +2/+2 et Pied marin ce tour. Échec critique : renvoyez L'Aventurier de niveau beaucoup trop élevé dans votre main.",
    onPlayEffects: [
      lancez(
        [
          {
            when: { critical: "success" },
            effects: [
              { type: "buff", target: { kind: "self" }, attackAmount: flat(2), healthAmount: flat(2), grantKeywords: ["pied-marin"], duration: "endOfTurn" },
            ],
          },
          { when: { critical: "failure" }, effects: [{ type: "moveZone", target: { kind: "self" }, toZone: "hand" }] },
          { when: { min: 2, max: 3 }, effects: [buffSoi(1, 1, "untilYourNextTurn")] },
          {
            when: { min: 4, max: 7 },
            effects: [
              {
                type: "pickUnits",
                target: { kind: "allUnits" },
                filter: { cardTypes: [...UNITES] },
                uses: 1,
                thenEffects: [{ type: "damage", target: { kind: "triggerSource" }, amount: flat(3) }],
              },
            ],
          },
        ],
        { dieBranchMode: "first" }
      ),
    ],
  },
  {
    id: "de-pipe",
    name: "Dé pipé",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 1,
    maxCopies: 3,
    chaine: true,
    text: "Chaîne — Brisez : modifiez le jet en cours de +1 ou -1.",
    onBreakEffects: [{ type: "modifyPendingDie", target: { kind: "controllerPlayer" }, dieDeltas: [1, -1] }],
  },
  {
    id: "relance-j-te-jure",
    name: "Relance, j'te jure",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 3,
    chaine: true,
    text: "Chaîne — Brisez : relancez le dé en cours. Le nouveau résultat remplace l'ancien.",
    onBreakEffects: [{ type: "rerollPendingDie", target: { kind: "controllerPlayer" } }],
  },
  {
    id: "c-etait-presque-un-six",
    name: "C'était presque un six",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 3,
    chaine: true,
    text: "Chaîne — Brisez : augmentez le jet en cours de 2 sans dépasser son maximum.",
    onBreakEffects: [{ type: "modifyPendingDie", target: { kind: "controllerPlayer" }, dieDeltas: [2] }],
  },
  {
    id: "double-tentative",
    name: "Double tentative",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    maxCopies: 3,
    text: "Brisez avant votre prochain jet : lancez deux dés identiques et choisissez celui à conserver. Une Chaîne peut ensuite modifier ce résultat.",
    onBreakEffects: [{ type: "modifyNextRoll", target: { kind: "controllerPlayer" }, nextRoll: { advantage: true } }],
  },
  {
    id: "de-du-destin-tres-officiel",
    name: "Dé du destin très officiel",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    maxCopies: 2,
    text: "Brisez avant votre prochain jet : améliorez son dé d'un niveau, D4 → D6 ou D6 → D8.",
    onBreakEffects: [{ type: "modifyNextRoll", target: { kind: "controllerPlayer" }, nextRoll: { upgradeSteps: 1 } }],
  },
  {
    id: "on-retourne-a-l-auberge",
    name: "On retourne à l'auberge !",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 3,
    text: "Brisez : renvoyez une unité Dungeon et Ladalle alliée dans votre main. Réduisez son coût de 1 jusqu'à la fin de votre prochain tour.",
    onBreakEffects: [
      { type: "moveZone", target: { kind: "chosenUnit", among: { archetype: DL, unitsOnly: true } }, toZone: "hand" },
      // « Jusqu'à la fin de votre prochain tour » : ce tour-ci, celui de
      // l'adversaire, puis le vôtre.
      { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: flat(1), discountOnlyChosenTarget: true, lastsExtraTurns: 2 },
    ],
  },
  {
    id: "j-avais-oublie-mon-sac",
    name: "J'avais oublié mon sac",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 1,
    maxCopies: 3,
    text: "Brisez : renvoyez une unité alliée coûtant 2 ou moins dans votre main. Piochez 1 puis défaussez 1.",
    onBreakEffects: [
      { type: "moveZone", target: { kind: "chosenUnit", among: { unitsOnly: true, maxCost: 2 } }, toZone: "hand" },
      { type: "draw", target: { kind: "controllerPlayer" }, amount: flat(1) },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: flat(1) },
    ],
  },
  {
    id: "plan-du-donjon-mal-dessine",
    name: "Plan du Donjon mal dessiné",
    type: "objet",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 4,
    maxCopies: 3,
    text: "Brisez : cherchez Le Donjon de Ladalle dans votre deck, révélez-le et ajoutez-le à votre main.",
    onBreakEffects: [{ type: "searchDeck", target: { kind: "controllerPlayer" }, cardId: "le-donjon-de-ladalle" }],
  },
  {
    id: "le-donjon-de-ladalle",
    name: "Le Donjon de Ladalle",
    type: "lande",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 3,
    text:
      "Durée : 4 tours de table. La première fois que vous lancez un dé à chacun de vos tours, vous pouvez le relancer. " +
      "Vous devez garder le nouveau résultat.",
    lande: { durationTableTurns: 4, firstRollRerollEachTurn: true },
  },
  {
    id: "la-taverne-avant-le-donjon",
    name: "La Taverne avant le Donjon",
    type: "structure",
    archetype: DL,
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    health: 4,
    maxCopies: 3,
    text: "La première fois qu'une unité alliée revient dans votre main à chacun de vos tours, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { cardTypes: [...UNITES] },
        condition: { duringOwnTurn: true },
        oncePerTurnKey: "taverneRetour",
        description: "Une unité alliée revient en main : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  },
];

// --- Opalins (21, Cartographe déjà en jeu) -------------------------------------

const opalin = (card: Omit<CardDefinition, "archetype" | "showsArchetype" | "setCode">): CardDefinition => ({
  ...card,
  archetype: OPALIN,
  showsArchetype: true,
  setCode: DUNGEON_ET_LADALLE,
});

/**
 * Eidolon Opalin LVX — sommet de la lignée LV, en deux versions : la
 * STANDARDE (06/10/2026) et la variante ABYSSALE de Notion. Même carte,
 * même effet ; la variante seule ajoute l'entrée « par un effet qui invoque
 * explicitement une carte Abyssale ». La lignée accepte l'une ou l'autre
 * (`game/rules/levels.ts`).
 */
function eidolonLvx(abyssale: boolean): CardDefinition {
  return opalin({
    id: abyssale ? "eidolon-opalin-lvx-abyssal" : "eidolon-opalin-lvx",
    name: "Eidolon Opalin LVX",
    type: "creature",
    ...(abyssale ? { variant: "abyssale" as const } : {}),
    tags: ["lv"],
    cost: 8,
    attack: 8,
    health: 10,
    maxCopies: 1,
    cannotBePlayed: true,
    text:
      (abyssale
        ? "Ne peut entrer en jeu que par l'effet d'Eidolon Opalin LV5 ou par un effet qui invoque explicitement une carte Abyssale. "
        : "Ne peut entrer en jeu que par l'effet d'Eidolon Opalin LV5. ") +
      "À son arrivée, choisissez 2 effets différents : infligez 4 dégâts à une unité ; détruisez un Objet ; " +
      "infligez 3 dégâts à une Structure ; récupérez 2 Raison ; gagnez 3 Armure ; ajoutez une carte de votre Cimetière à " +
      "votre main. La première fois à chaque tour qu'un autre Opalin que vous contrôlez déclenche un effet, gagnez 1 Armure.",
    abilities: [
      {
        trigger: "onEnterPlay",
        description: "À son arrivée : choisissez 2 effets différents.",
        effects: [{ type: "chooseAbilityOption", target: { kind: "controllerPlayer" }, optionGroup: "lvxArrivee", uses: 2 }],
      },
      option("lvxArrivee", "Infligez 4 dégâts à une unité.", [
        { type: "pickUnits", target: { kind: "allUnits" }, filter: { cardTypes: [...UNITES] }, uses: 1, thenEffects: [{ type: "damage", target: { kind: "triggerSource" }, amount: flat(4) }] },
      ]),
      option("lvxArrivee", "Détruisez un Objet.", [
        { type: "pickUnits", target: { kind: "allUnits" }, filter: { cardTypes: ["objet"] }, uses: 1, thenEffects: [{ type: "destroy", target: { kind: "triggerSource" } }] },
      ]),
      option("lvxArrivee", "Infligez 3 dégâts à une Structure.", [
        { type: "pickUnits", target: { kind: "allUnits" }, filter: { cardTypes: ["structure"] }, uses: 1, thenEffects: [{ type: "damage", target: { kind: "triggerSource" }, amount: flat(3) }] },
      ]),
      option("lvxArrivee", "Récupérez 2 Raison.", [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: flat(2) }]),
      option("lvxArrivee", "Gagnez 3 Armure.", [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(3) }]),
      option("lvxArrivee", "Ajoutez une carte de votre Cimetière à votre main.", [{ type: "pickFromGraveyard", target: { kind: "controllerPlayer" }, uses: 1 }]),
      {
        trigger: "onAbilityResolved",
        triggeredBy: { archetype: OPALIN, excludeSelf: true },
        oncePerTurnKey: "lvxVeille",
        description: "Un autre Opalin que vous contrôlez déclenche un effet : gagnez 1 Armure.",
        effects: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  });
}

const OPALINS: CardDefinition[] = [
  opalin({
    id: "nerhal-opalin-des-marees",
    name: "Nerhal, Opalin des Marées",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 6,
    maxCopies: 2,
    text:
      "À son arrivée : déplacez immédiatement la Marée d'un état dans le sens de votre choix. La première fois à chaque " +
      "tour que la Marée change, une unité Opaline que vous contrôlez gagne +1 Puissance et +1 Résistance jusqu'à votre " +
      "prochain tour.",
    onPlayEffects: [{ type: "chooseAbilityOption", target: { kind: "controllerPlayer" }, optionGroup: "nerhalSens" }],
    abilities: [
      ...deplacerLaMaree("nerhalSens"),
      {
        trigger: "onTideStateEntered",
        oncePerTurnKey: "nerhalMaree",
        description: "La Marée change : une unité Opaline que vous contrôlez gagne +1 Puissance et +1 Résistance.",
        effects: [uneOpalineGagne(1, 1)],
      },
    ],
  }),
  opalin({
    id: "orram-opalin-des-memoires",
    name: "Orram, Opalin des Mémoires",
    type: "creature",
    cost: 5,
    attack: 4,
    health: 7,
    maxCopies: 2,
    text:
      "À son arrivée : placez jusqu'à 2 cartes de votre Cimetière sous votre pioche dans l'ordre de votre choix. La " +
      "première fois à chaque tour qu'une carte quitte votre Cimetière, récupérez 1 Raison.",
    onPlayEffects: [{ type: "pickFromGraveyard", target: { kind: "controllerPlayer" }, uses: 2, refusable: true, takeTo: "deckBottom" }],
    abilities: [
      {
        trigger: "onCardLeftGraveyard",
        oncePerTurnKey: "orramMemoire",
        description: "Une carte quitte votre Cimetière : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  }),
  opalin({
    id: "kaor-opalin-des-reliques",
    name: "Kaor, Opalin des Reliques",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 5,
    maxCopies: 2,
    text:
      "À son arrivée : ajoutez un Objet de votre Cimetière à votre main. La première fois à chaque tour que vous Brisez " +
      "un Objet, Kaor gagne +1 Puissance jusqu'à votre prochain tour.",
    onPlayEffects: [{ type: "pickFromGraveyard", target: { kind: "controllerPlayer" }, filter: { cardTypes: ["objet"] }, uses: 1 }],
    abilities: [
      {
        trigger: "onObjectBroken",
        triggeredBy: { cardTypes: ["objet"] },
        oncePerTurnKey: "kaorBris",
        description: "Vous Brisez un Objet : Kaor gagne +1 Puissance jusqu'à votre prochain tour.",
        effects: [buffSoi(1, 0, "untilYourNextTurn")],
      },
    ],
  }),
  opalin({
    id: "velm-opalin-des-armures",
    name: "Velm, Opalin des Armures",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 6,
    maxCopies: 3,
    text:
      "À son arrivée : gagnez 3 Armure. La première fois à chaque tour que votre Navire gagne de l'Armure, une unité " +
      "Opaline que vous contrôlez gagne +1 Résistance jusqu'à votre prochain tour.",
    onPlayEffects: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(3) }],
    abilities: [
      {
        trigger: "onArmorGained",
        oncePerTurnKey: "velmArmure",
        description: "Votre Navire gagne de l'Armure : une unité Opaline que vous contrôlez gagne +1 Résistance.",
        effects: [uneOpalineGagne(0, 1)],
      },
    ],
  }),
  opalin({
    id: "seren-opalin-du-silence",
    name: "Seren, Opalin du Silence",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 7,
    maxCopies: 2,
    text:
      "À son arrivée : choisissez un Objet ou une Structure adverse. Son texte est ignoré jusqu'au début de votre " +
      "prochain tour. La première activation d'Objet adverse à chaque tour coûte 1 Raison supplémentaire. Si " +
      "l'adversaire ne peut pas payer, cet Objet ne peut pas être activé.",
    onPlayEffects: [
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["objet", "structure"] } },
        attackAmount: flat(0),
        healthAmount: flat(0),
        ignoresText: true,
        duration: "untilYourNextTurn",
        expiresOnControllersTurn: true,
      },
    ],
    taxOpponentObjectBreakOncePerTurnWhileVisible: { amount: 1, blocksIfUnpayable: true },
  }),
  opalin({
    id: "tharos-opalin-des-brisants",
    name: "Tharos, Opalin des Brisants",
    type: "creature",
    cost: 6,
    attack: 7,
    health: 6,
    maxCopies: 2,
    text:
      "À son arrivée : infligez 3 dégâts à une unité. La première fois à chaque tour qu'une unité adverse survit à des " +
      "dégâts, elle perd 1 Puissance jusqu'au prochain tour de son propriétaire.",
    onPlayEffects: [{ type: "damage", target: { kind: "chosenUnit", among: { sameController: false, unitsOnly: true } }, amount: flat(3) }],
    abilities: [
      {
        trigger: "onSurvivedDamage",
        triggeredBy: { cardTypes: [...UNITES], opponentOnly: true },
        oncePerTurnKey: "tharosBrisant",
        description: "Une unité adverse survit à des dégâts : elle perd 1 Puissance jusqu'au prochain tour de son propriétaire.",
        // « Jusqu'au prochain tour de son PROPRIÉTAIRE » : le modificateur tombe
        // à l'entame du tour du plateau qui le porte (pas d'`appliedBy`).
        effects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: flat(-1), healthAmount: flat(0), duration: "untilYourNextTurn" }],
      },
    ],
  }),
  opalin({
    id: "elyor-opalin-du-retour",
    name: "Elyor, Opalin du Retour",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 5,
    maxCopies: 3,
    text:
      "À son arrivée : renvoyez une unité coûtant 2 ou moins dans la main de son propriétaire. La première fois à chaque " +
      "tour qu'une carte adverse retourne dans la main de son propriétaire, gagnez 1 Armure.",
    onPlayEffects: [{ type: "moveZone", target: { kind: "chosenUnit", among: { sameController: false, unitsOnly: true, maxCost: 2 } }, toZone: "hand" }],
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { opponentOnly: true },
        oncePerTurnKey: "elyorRetour",
        description: "Une carte adverse retourne en main : gagnez 1 Armure.",
        effects: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  }),
  opalin({
    id: "merai-opalin-des-profondeurs",
    name: "Meraï, Opalin des Profondeurs",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 6,
    maxCopies: 2,
    text:
      "À son arrivée : regardez les 4 cartes du dessous de votre pioche. Ajoutez-en une à votre main puis mélangez les " +
      "autres dans votre pioche. La première fois à chaque tour qu'une carte est placée sous votre pioche, récupérez 1 Raison.",
    onPlayEffects: [{ type: "lookAtDeckTop", target: { kind: "controllerPlayer" }, amount: flat(4), uses: 1, fromBottom: true, restTo: "shuffle" }],
    abilities: [
      {
        trigger: "onCardPutUnderDeck",
        oncePerTurnKey: "meraiDessous",
        description: "Une carte est placée sous votre pioche : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  }),
  opalin({
    id: "avar-opalin-des-structures",
    name: "Avar, Opalin des Structures",
    type: "creature",
    cost: 6,
    attack: 6,
    health: 7,
    maxCopies: 2,
    text:
      "À son arrivée : infligez 2 dégâts à une Structure. La première fois à chaque tour qu'une Structure quitte le " +
      "board, Avar gagne +1 Puissance et +1 Résistance jusqu'à votre prochain tour.",
    onPlayEffects: [{ type: "damage", target: { kind: "chosenUnit", among: { sameController: false, cardTypes: ["structure"] } }, amount: flat(2) }],
    // « Quitte le board » : détruite, Sabordée, expirée ou renvoyée en main —
    // d'un camp comme de l'autre ; une seule fois par tour en tout.
    abilities: (["onDeath", "onSaborde", "onExpire", "onReturnedToHand"] as const).map((trigger) => ({
      trigger,
      triggeredBy: { cardTypes: ["structure" as const], sameController: false },
      oncePerTurnKey: "avarStructure",
      description: "Une Structure quitte le board : Avar gagne +1 Puissance et +1 Résistance jusqu'à votre prochain tour.",
      effects: [buffSoi(1, 1, "untilYourNextTurn")],
    })),
  }),
  opalin({
    id: "sila-opalin-du-large",
    name: "Sila, Opalin du Large",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 6,
    maxCopies: 3,
    text:
      "À son arrivée : votre prochaine unité coûtant 5 ou plus coûte 1 de moins. La première unité coûtant 5 ou plus que " +
      "vous jouez à chaque tour gagne +1 Puissance et +1 Résistance.",
    onPlayEffects: [
      { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: flat(1), filter: { cardTypes: [...UNITES], minCost: 5 }, lastsExtraTurns: 999 },
    ],
    abilities: [
      {
        trigger: "onCardPlayed",
        triggeredBy: { cardTypes: [...UNITES], minCost: 5, onlyPlayed: true },
        oncePerTurnKey: "silaGrande",
        description: "Première unité coûtant 5 ou plus du tour : elle gagne +1 Puissance et +1 Résistance.",
        effects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: flat(1), healthAmount: flat(1), permanent: true }],
      },
    ],
  }),
  opalin({
    id: "morhal-opalin-des-navires",
    name: "Morhal, Opalin des Navires",
    type: "creature",
    cost: 6,
    attack: 6,
    health: 8,
    maxCopies: 1,
    text:
      "À son arrivée : choisissez : récupérez 3 Ancrage ou gagnez 3 Armure. La première fois à chaque tour que votre " +
      "Navire devrait subir des dégâts directs, réduisez-les de 1.",
    onPlayEffects: [{ type: "chooseAbilityOption", target: { kind: "controllerPlayer" }, optionGroup: "morhalChoix" }],
    abilities: [
      option("morhalChoix", "Récupérez 3 Ancrage.", [{ type: "heal", target: { kind: "controllerPlayer" }, amount: flat(3) }]),
      option("morhalChoix", "Gagnez 3 Armure.", [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(3) }]),
    ],
    reduceDirectShipDamageOncePerTurn: { amount: 1 },
  }),
  opalin({
    id: "ylenn-opalin-de-la-main-close",
    name: "Ylenn, Opalin de la Main close",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 6,
    maxCopies: 2,
    text:
      "À son arrivée : chaque joueur place une carte de sa main sous sa pioche. La première fois à chaque tour que " +
      "l'adversaire pioche une carte en dehors de sa pioche normale, il place une carte de sa main sous sa pioche.",
    // Chacun DÉSIGNE la carte qu'il place : la question se pose à chacun.
    onPlayEffects: [
      { type: "discard", target: { kind: "controllerPlayer" }, amount: flat(1), discardToDeckBottom: true },
      { type: "discard", target: { kind: "opponentPlayer" }, amount: flat(1), discardToDeckBottom: true },
    ],
    abilities: [
      {
        trigger: "onExtraCardDrawn",
        condition: { factOf: "opponent" },
        oncePerTurnKey: "ylennMainClose",
        description: "L'adversaire pioche en dehors de sa pioche normale : il place une carte de sa main sous sa pioche.",
        effects: [{ type: "discard", target: { kind: "opponentPlayer" }, amount: flat(1), discardToDeckBottom: true }],
      },
    ],
  }),
  opalin({
    id: "dhar-opalin-du-premier-coup",
    name: "Dhar, Opalin du Premier Coup",
    type: "creature",
    cost: 5,
    attack: 6,
    health: 5,
    maxCopies: 2,
    text:
      "À son arrivée : la prochaine fois qu'une de vos unités inflige des dégâts ce tour, augmentez ces dégâts de 2. La " +
      "première fois à chaque tour qu'une unité que vous contrôlez inflige des dégâts, elle gagne +1 Puissance jusqu'à " +
      "votre prochain tour.",
    onPlayEffects: [{ type: "nextUnitDamageBonus", target: { kind: "controllerPlayer" }, amount: flat(2) }],
    abilities: [
      {
        trigger: "onDealtDamage",
        triggeredBy: { cardTypes: [...UNITES], excludeSelf: false },
        oncePerTurnKey: "dharPremierCoup",
        description: "Une unité que vous contrôlez inflige des dégâts : elle gagne +1 Puissance jusqu'à votre prochain tour.",
        effects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: flat(1), healthAmount: flat(0), duration: "untilYourNextTurn" }],
      },
    ],
  }),
  opalin({
    id: "astel-opalin-de-la-derniere-veille",
    name: "Astel, Opalin de la Dernière Veille",
    type: "creature",
    cost: 7,
    attack: 7,
    health: 9,
    maxCopies: 1,
    text:
      "À son arrivée : choisissez un Objet, une Structure ou une Créature adverse. Son texte est ignoré jusqu'au début de " +
      "votre prochain tour. La première carte adverse qui cible une unité Opaline que vous contrôlez à chaque tour coûte " +
      "1 Raison supplémentaire.",
    onPlayEffects: [
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["objet", "structure", "creature"] } },
        attackAmount: flat(0),
        healthAmount: flat(0),
        ignoresText: true,
        duration: "untilYourNextTurn",
        expiresOnControllersTurn: true,
      },
    ],
    // « coûte 1 Raison supplémentaire » : l'adversaire perd 1 Raison quand sa
    // carte désigne une de vos unités Opalines (`onUnitTargeted`), la
    // première fois de chaque tour.
    abilities: [
      {
        trigger: "onUnitTargeted",
        triggeredBy: { archetype: OPALIN, cardTypes: [...UNITES] },
        oncePerTurnKey: "astelVeille",
        description: "Une carte adverse cible une unité Opaline que vous contrôlez : elle coûte 1 Raison de plus à l'adversaire.",
        effects: [{ type: "reasonLoss", target: { kind: "opponentPlayer" }, amount: flat(1) }],
      },
    ],
  }),
  opalin({
    id: "eidolon-opalin-lv1",
    name: "Eidolon Opalin LV1",
    type: "creature",
    tags: ["lv"],
    cost: 2,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text:
      "À la fin de votre tour, si Eidolon Opalin LV1 est toujours en jeu, placez 1 marqueur Niveau sur lui. À 2 marqueurs " +
      "Niveau, remplacez-le par Eidolon Opalin LV5 depuis votre main ou votre pioche.",
    levelUp: { markers: 2, into: "eidolon-opalin-lv5" },
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de votre tour : 1 marqueur Niveau.",
        effects: [{ type: "addLevelMarker", target: { kind: "self" }, amount: flat(1) }],
      },
    ],
  }),
  opalin({
    id: "eidolon-opalin-lv5",
    name: "Eidolon Opalin LV5",
    type: "creature",
    tags: ["lv"],
    cost: 5,
    attack: 5,
    health: 7,
    maxCopies: 2,
    text:
      "Ne peut être joué normalement que si vous contrôlez une unité Opaline. S'il entre en jeu par l'effet d'Eidolon " +
      "Opalin LV1, gagnez 2 Armure. Au début de votre tour, s'il est toujours en jeu, placez 1 marqueur Niveau sur lui. À " +
      "1 marqueur Niveau, remplacez-le par Eidolon Opalin LVX depuis votre main ou votre pioche.",
    playableOnlyIf: { controlsArchetypeUnit: OPALIN },
    levelUp: { markers: 1, into: "eidolon-opalin-lvx" },
    abilities: [
      {
        trigger: "onEnterPlay",
        condition: { selfArrivedVia: "eidolon-opalin-lv1" },
        description: "Arrivé par l'effet d'Eidolon Opalin LV1 : gagnez 2 Armure.",
        effects: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(2) }],
      },
      {
        trigger: "startOfTurn",
        description: "Début de votre tour : 1 marqueur Niveau.",
        effects: [{ type: "addLevelMarker", target: { kind: "self" }, amount: flat(1) }],
      },
    ],
  }),
  eidolonLvx(false),
  eidolonLvx(true),
  opalin({
    id: "veille-des-niveaux",
    name: "Veille des Niveaux",
    type: "structure",
    cost: 3,
    health: 4,
    maxCopies: 3,
    text: "La première fois qu'une carte LV que vous contrôlez survit à un tour adverse, gagnez 1 Armure.",
    // Au début de votre tour, une carte LV encore en jeu a traversé le tour
    // adverse. « La première fois » : une seule fois pour la partie.
    abilities: [
      {
        trigger: "startOfTurn",
        condition: { controlsTag: "lv" },
        oncePerTurnKey: "veilleNiveaux",
        onceEver: true,
        description: "Une carte LV a survécu au tour adverse : gagnez 1 Armure.",
        effects: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  }),
  opalin({
    id: "fragment-d-eveil",
    name: "Fragment d'Éveil",
    type: "objet",
    cost: 2,
    maxCopies: 2,
    text: "Brisez : une carte Opaline LV gagne 1 marqueur Niveau. Une seule activation de Fragment d'Éveil par tour.",
    breakOncePerTurnByName: true,
    onBreakEffects: [{ type: "addLevelMarker", target: { kind: "chosenUnit", among: { tag: "lv", unitsOnly: true } }, amount: flat(1) }],
  }),
  opalin({
    id: "sommeil-de-pierre",
    name: "Sommeil de Pierre",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Brisez : une unité Opaline gagne +0/+2 jusqu'à votre prochain tour. Si elle est LV, elle ne peut pas être renvoyée en main ce tour.",
    onBreakEffects: [
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { archetype: OPALIN, unitsOnly: true } },
        attackAmount: flat(0),
        healthAmount: flat(2),
        duration: "untilYourNextTurn",
      },
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { archetype: OPALIN, unitsOnly: true } },
        attackAmount: flat(0),
        healthAmount: flat(0),
        duration: "endOfTurn",
        preventsReturnToHand: true,
        conditionChosenTargetTag: "lv",
      },
    ],
  }),
];

// --- Génériques / passerelles (14) ------------------------------------------------

const GENERIQUES: CardDefinition[] = [
  {
    id: "cartographe-du-large",
    name: "Cartographe du Large",
    type: "marin",
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 2,
    health: 3,
    maxCopies: 3,
    text: "À l'arrivée, si une Lande est active, regardez les 2 cartes du dessus de votre deck et replacez-les dans l'ordre de votre choix.",
    onPlayEffects: [
      { type: "lookAtDeckTop", target: { kind: "controllerPlayer" }, amount: flat(2), uses: 0, restTo: "deckTopChosenOrder", refusable: true, conditionLandeActive: true },
    ],
  },
  {
    id: "aventuriere-en-retard",
    name: "Aventurière en retard",
    type: "marin",
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    attack: 3,
    health: 2,
    maxCopies: 3,
    text: "Si vous avez joué ou Brisé un Objet ce tour, elle gagne Pied marin ce tour.",
    // Lu à son arrivée, puis à chaque Objet joué ou Brisé après elle ce tour.
    onPlayEffects: [{ ...PIED_MARIN_CE_TOUR, conditionObjectPlayedOrBrokenThisTurn: true }],
    abilities: [
      { trigger: "onObjectBroken", triggeredBy: { cardTypes: ["objet"] }, description: "Vous Brisez un Objet : elle gagne Pied marin ce tour.", effects: [PIED_MARIN_CE_TOUR] },
      { trigger: "onCardPlayed", triggeredBy: { cardTypes: ["objet"], onlyPlayed: true }, description: "Vous jouez un Objet : elle gagne Pied marin ce tour.", effects: [PIED_MARIN_CE_TOUR] },
    ],
  },
  {
    id: "mousse-superstitieux",
    name: "Mousse superstitieux",
    type: "marin",
    setCode: DUNGEON_ET_LADALLE,
    cost: 1,
    attack: 1,
    health: 2,
    maxCopies: 3,
    text: "La première fois qu'un effet aléatoire que vous contrôlez vous avantage à chacun de vos tours, il gagne +1/+1.",
    // « Vous avantage » : un de vos jets de dé tourne à la Réussite.
    abilities: [
      {
        trigger: "onDieResolved",
        condition: { dieOutcomes: ["success", "criticalSuccess"], duringOwnTurn: true },
        oncePerTurnKey: "mousseChance",
        description: "Un de vos jets tourne à la Réussite : il gagne +1/+1.",
        effects: [buffSoi(1, 1, "permanent")],
      },
    ],
  },
  {
    id: "gardien-des-balises",
    name: "Gardien des Balises",
    type: "marin",
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    attack: 3,
    health: 4,
    maxCopies: 3,
    text: "Tant qu'une Lande est active, il gagne +0/+1.",
    selfBuffWhileLandeActive: { healthAmount: 1 },
  },
  {
    id: "boussole-fendue",
    name: "Boussole fendue",
    type: "objet",
    setCode: DUNGEON_ET_LADALLE,
    cost: 1,
    maxCopies: 3,
    text: "Brisez : regardez les 2 cartes du dessus. Gardez-en une au-dessus et placez l'autre dessous.",
    onBreakEffects: [{ type: "lookAtDeckTop", target: { kind: "controllerPlayer" }, amount: flat(2), uses: 1, takeTo: "deckTop" }],
  },
  {
    id: "piece-porte-bonheur",
    name: "Pièce porte-bonheur",
    type: "objet",
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 3,
    chaine: true,
    text: "Chaîne — Brisez : le jet en cours ne peut pas être considéré comme un Échec critique.",
    onBreakEffects: [{ type: "pendingDieNoCriticalFailure", target: { kind: "controllerPlayer" } }],
  },
  {
    id: "carte-detrempee",
    name: "Carte détrempée",
    type: "objet",
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 3,
    text: "Brisez : récupérez une Lande depuis votre Cimetière et placez-la sous votre deck.",
    onBreakEffects: [{ type: "pickFromGraveyard", target: { kind: "controllerPlayer" }, filter: { cardTypes: ["lande"] }, uses: 1, takeTo: "deckBottom" }],
  },
  {
    id: "corde-de-rappel-legere",
    name: "Corde de rappel",
    type: "objet",
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 3,
    text: "Brisez : renvoyez une unité alliée coûtant 3 ou moins dans votre main.",
    onBreakEffects: [{ type: "moveZone", target: { kind: "chosenUnit", among: { unitsOnly: true, maxCost: 3 } }, toZone: "hand" }],
  },
  {
    id: "campement-provisoire",
    name: "Campement provisoire",
    type: "structure",
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    health: 3,
    maxCopies: 3,
    text: "La première carte que vous rejouez depuis votre main après qu'elle y soit revenue à chacun de vos tours coûte 1 de moins.",
    replayedCardDiscount: 1,
  },
  {
    id: "tour-de-guet-mobile",
    name: "Tour de guet mobile",
    type: "structure",
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    health: 4,
    maxCopies: 3,
    text: "La première fois qu'une Lande arrive en jeu à chacun de vos tours, gagnez 1 Armure.",
    abilities: [
      {
        trigger: "onLandePlaced",
        condition: { factOf: "any", duringOwnTurn: true },
        oncePerTurnKey: "tourDeGuet",
        description: "Une Lande arrive en jeu : gagnez 1 Armure.",
        effects: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(1) }],
      },
    ],
  },
  {
    id: "maree-imprevisible",
    name: "Marée imprévisible",
    type: "anomalie",
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    maxCopies: 3,
    permanent: false,
    text: "Déplacez immédiatement la Marée d'un état dans le sens de votre choix.",
    onPlayEffects: [{ type: "chooseAbilityOption", target: { kind: "controllerPlayer" }, optionGroup: "mareeSens", cardId: "maree-imprevisible" }],
    abilities: deplacerLaMaree("mareeSens"),
  },
  {
    id: "route-barree",
    name: "Route barrée",
    type: "anomalie",
    setCode: DUNGEON_ET_LADALLE,
    cost: 4,
    maxCopies: 3,
    permanent: false,
    text: "Réduisez de 2 la durée restante de la Lande active. Si elle disparaît ainsi, gagnez 2 Armure.",
    onPlayEffects: [
      {
        type: "shortenLande",
        target: { kind: "allPlayers" },
        amount: flat(2),
        ifLandeEnds: [{ type: "gainArmor", target: { kind: "controllerPlayer" }, amount: flat(2) }],
      },
    ],
  },
  {
    id: "calme-trompeur",
    name: "Calme trompeur",
    type: "lande",
    setCode: DUNGEON_ET_LADALLE,
    cost: 2,
    maxCopies: 2,
    text: "Durée : 3 tours de table. La première unité coûtant 2 ou moins que chaque joueur joue à son tour gagne +0/+1.",
    lande: { durationTableTurns: 3, firstCheapUnitEachTurnBuff: { maxCost: 2, attack: 0, health: 1 } },
  },
  {
    id: "terres-inconnues",
    name: "Terres inconnues",
    type: "lande",
    setCode: DUNGEON_ET_LADALLE,
    cost: 3,
    maxCopies: 2,
    text:
      "Durée : 4 tours de table. La première carte que vous rejouez depuis votre main après qu'elle y soit revenue à " +
      "chacun de vos tours coûte 1 de moins.",
    lande: { durationTableTurns: 4, replayedCardDiscount: 1 },
  },
];

export const LOT17_SET: CardDefinition[] = [...DUNGEON, ...OPALINS, ...GENERIQUES];
