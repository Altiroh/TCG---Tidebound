import { KEYWORD_INCIBLABLE, type CardDefinition, type TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * LOT 16 — LES ALTÉRÉS (Notion « Catalogue de cartes » § Lot 16 ; booster
 * « La mutation mondiale », Notion « Boosters & économie » § Booster 4).
 *
 * Une famille de Marins altérés dont les capacités passent par l'ÉVEIL
 * (`game/rules/eveil.ts`) : poser un Altéré, déclencher ou répéter son
 * Éveil, propager la chaîne vers un autre, puis convertir ces répétitions
 * en dégâts, présence de plateau ou pioche.
 *
 * Conventions de ce fichier :
 *  - « Éveil — … » est une capacité `trigger: "onEveil"` sans `triggeredBy`.
 *    Elle se résout à l'arrivée de la carte et à chaque « déclenchez
 *    l'Éveil » (`triggerEveil`), au milieu de la séquence qui le demande ;
 *  - TOUTE désignation passe par une question refusable (`pickUnits`,
 *    `pickFromGraveyard`, `lookAtDeckTop`) : les Éveils se répètent dans un
 *    même tour, parfois dans une même chaîne, et une capacité facultative ne
 *    se propose qu'une fois par fenêtre de réaction. La question, elle, se
 *    repose à chaque Éveil — le joueur choisit toujours, et peut refuser ;
 *  - « un Altéré » désigne l'UNITÉ (sous-type `altere`) ; « une carte
 *    Altéré » toute carte de la famille (archétype `alteres`).
 *
 * Textes : ceux de Notion, alignés sur le vocabulaire du jeu (décision du
 * 03/10/2026) — Puissance et Résistance pour ATQ et PV, « une unité
 * adverse » pour « une cible ennemie », « que vous contrôlez » pour
 * « allié », Cimetière, Navire adverse. Le sens ne change pas. Valeurs
 * chiffrées : celles de Notion, « à playtester » — rien n'est rééquilibré.
 *
 * Fichier à part, comme le Lot 15 : ces définitions ne dépendent que des
 * types, et `core.ts` les verse dans `CORE_SET`.
 */

/** Lot de diffusion, miroir de `cards.set_code`. */
export const LA_MUTATION_MONDIALE = "la-mutation-mondiale";

/** Sous-type des Marins Altérés — « un Altéré ». */
const ALTERE = "altere";

/** Unités — le filtre commun de « une unité ». */
const UNITES = ["marin", "creature"] as const;

/** Jeton « Péon Altéré » (`tokens.ts`), invoqué par Le Dédoublé. */
const PEON_ALTERE = "peon-altere";

/** « Déclenchez l'Éveil » de la carte désignée par la question en cours. */
const EVEIL_DE_LA_CIBLE: EffectDefinition = { type: "triggerEveil", target: { kind: "triggerSource" } };

/**
 * « Déclenchez l'Éveil d'un [autre] Altéré que vous contrôlez » : la question
 * qui le désigne. `autre` écarte la carte source ; `different` écarte aussi la
 * carte qui vient de s'Éveiller (Le Meneur).
 */
function eveilDUnAltere(options: { autre?: boolean; different?: boolean; dejaEveille?: boolean } & Partial<EffectDefinition> = {}): EffectDefinition {
  const { autre = true, different = false, dejaEveille = false, ...reste } = options;
  return {
    type: "pickUnits",
    target: { kind: "allAllyUnits" },
    filter: {
      subtype: ALTERE,
      cardTypes: [...UNITES],
      ...(autre ? { excludeSelf: true } : {}),
      ...(different ? { excludeTriggerSource: true } : {}),
      ...(dejaEveille ? { eveilledThisTurn: true } : {}),
    },
    uses: 1,
    thenEffects: [EVEIL_DE_LA_CIBLE],
    ...reste,
  };
}

/** « … à une unité adverse » : la question qui la désigne, et ce qu'elle subit. */
function uneUniteAdverse(thenEffects: EffectDefinition[]): EffectDefinition {
  return {
    type: "pickUnits",
    target: { kind: "allEnemyUnits" },
    filter: { cardTypes: [...UNITES] },
    uses: 1,
    thenEffects,
  };
}

/** L'Éveil d'une carte : la capacité qui porte « Éveil — … ». */
function eveil(description: string, effects: EffectDefinition[]): TriggeredAbility {
  return { trigger: "onEveil", description, effects };
}

/** Rang de l'Éveil en cours, pour « si c'est son deuxième Éveil ce tour ». */
const RANG = (min?: number, max?: number) => ({ conditionEveils: { of: "source" as const, min, max } });

// ===========================================================================
// MARINS ALTÉRÉS
// ===========================================================================

const MARINS_ALTERES: CardDefinition[] = [
  {
    id: "linstable",
    name: "L'Instable",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 1,
    maxCopies: 3,
    attack: 2,
    health: 2,
    text:
      "Éveil — Infligez 1 dégât à une unité adverse. Si elle est détruite ainsi, déclenchez l'Éveil d'un autre Altéré " +
      "que vous contrôlez.",
    abilities: [
      eveil("1 dégât ; une unité détruite propage l'Éveil.", [
        uneUniteAdverse([
          { type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } },
          // « détruite ainsi » : lu juste après le coup, avant la passe de morts.
          eveilDUnAltere({ conditionTriggerSourceDoomed: true }),
        ]),
      ]),
    ],
  },
  {
    id: "le-dedouble",
    name: "Le Dédoublé",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 3,
    attack: 2,
    health: 2,
    text: "Éveil — Invoquez un Péon Altéré 1 / 1. Si c'est son deuxième Éveil ce tour, invoquez-en 2 à la place.",
    // « son deuxième Éveil » : le deuxième, pas « deuxième ou plus » — un
    // troisième Éveil revient à un seul Péon.
    abilities: [
      eveil("Un Péon Altéré, deux au deuxième Éveil du tour.", [
        { type: "summon", target: { kind: "controllerPlayer" }, cardId: PEON_ALTERE, count: 1, ...RANG(undefined, 1) },
        { type: "summon", target: { kind: "controllerPlayer" }, cardId: PEON_ALTERE, count: 2, ...RANG(2, 2) },
        { type: "summon", target: { kind: "controllerPlayer" }, cardId: PEON_ALTERE, count: 1, ...RANG(3) },
      ]),
    ],
  },
  {
    id: "lentendant",
    name: "L'Entendant",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 3,
    attack: 2,
    health: 3,
    text: "Éveil — Piochez 1 carte. Si c'est son deuxième Éveil ce tour, piochez-en 2 à la place.",
    abilities: [
      eveil("Une carte, deux au deuxième Éveil du tour.", [
        { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, ...RANG(undefined, 1) },
        { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 }, ...RANG(2, 2) },
        { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, ...RANG(3) },
      ]),
    ],
  },
  {
    id: "leveilleur",
    name: "L'Éveilleur",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 3,
    attack: 3,
    health: 3,
    text: "À son arrivée, déclenchez l'Éveil d'un autre Altéré que vous contrôlez.",
    abilities: [{ trigger: "onEnterPlay", description: "Éveille un autre Altéré.", effects: [eveilDUnAltere()] }],
  },
  {
    id: "le-copieur",
    name: "Le Copieur",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 2,
    attack: 2,
    health: 3,
    text:
      "À son arrivée, choisissez un autre Altéré que vous contrôlez : déclenchez son Éveil. Puis, s'il s'était déjà " +
      "Éveillé ce tour, déclenchez-le une seconde fois.",
    abilities: [
      {
        trigger: "onEnterPlay",
        description: "Éveille un autre Altéré, deux fois s'il s'était déjà Éveillé.",
        effects: [
          eveilDUnAltere({
            thenEffects: [
              EVEIL_DE_LA_CIBLE,
              // Lu APRÈS le premier Éveil : « s'était déjà Éveillé » avant
              // celui-ci, c'est en compter au moins deux maintenant.
              { ...EVEIL_DE_LA_CIBLE, conditionEveils: { of: "triggerSource", min: 2 } },
            ],
          }),
        ],
      },
    ],
  },
  {
    id: "le-buveur",
    name: "Le Buveur",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 3,
    attack: 3,
    health: 2,
    text: "Éveil — Volez 1 Puissance à une unité adverse. Si sa Puissance tombe à 0 ainsi, piochez 1 carte.",
    // « Volez » sans durée : le transfert est conservé.
    abilities: [
      eveil("Vole 1 Puissance ; une unité vidée fait piocher.", [
        uneUniteAdverse([
          { type: "debuff", target: { kind: "triggerSource" }, attackAmount: { kind: "flat", value: 1 }, duration: "permanent" },
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 0 },
            duration: "permanent",
          },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionTriggerSourcePowerAtMost: 0 },
        ]),
      ]),
    ],
  },
  {
    id: "le-fendu",
    name: "Le Fendu",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 3,
    maxCopies: 3,
    attack: 4,
    health: 3,
    text:
      "À son arrivée, infligez 1 dégât à un autre Altéré que vous contrôlez et 1 dégât à une unité adverse. Puis " +
      "déclenchez l'Éveil de l'Altéré blessé.",
    // L'unité adverse se désigne d'abord : l'Éveil de l'Altéré blessé vient
    // en dernier, comme le dit « Puis ». Un Altéré que ce dégât emporte ne
    // s'Éveille pas — il n'est plus là.
    abilities: [
      {
        trigger: "onEnterPlay",
        description: "Blesse un Altéré et une unité adverse, puis éveille l'Altéré.",
        effects: [
          uneUniteAdverse([{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }]),
          eveilDUnAltere({
            thenEffects: [{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }, EVEIL_DE_LA_CIBLE],
          }),
        ],
      },
    ],
  },
  {
    id: "le-recousu",
    name: "Le Recousu",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 3,
    maxCopies: 3,
    attack: 3,
    health: 5,
    text:
      "Éveil — Restaurez toute sa Résistance à cette carte. Puis, si elle avait 1 Résistance restante ou moins avant " +
      "d'être soignée, déclenchez l'Éveil d'un autre Altéré que vous contrôlez.",
    // La question se pose AVANT le soin, pour lire la Résistance « avant
    // d'être soignée » ; l'Éveil désigné, lui, se résout à la réponse, donc
    // après le soin.
    abilities: [
      eveil("Se soigne ; au bord de la mort, propage l'Éveil.", [
        eveilDUnAltere({ conditionSourceRemainingResistanceAtMost: 1 }),
        { type: "heal", target: { kind: "self" }, healFully: true },
      ]),
    ],
  },
  {
    id: "lintangible",
    name: "L'Intangible",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 3,
    maxCopies: 3,
    attack: 3,
    health: 4,
    text:
      "Éveil — Jusqu'à votre prochain tour, cette carte ne peut pas être ciblée par l'adversaire. Pendant ce temps, " +
      "quand un effet adverse cible une autre unité que vous contrôlez, piochez 1 carte.",
    // « Quand un effet adverse échoue ainsi » (Notion) : l'effet qui ne peut
    // pas la viser en vise une autre — lecture arrêtée le 04/10/2026. Seules
    // les désignations de VOS unités sont visibles du moteur (`UNIT_TARGETED`).
    abilities: [
      eveil("Inciblable jusqu'à votre prochain tour.", [
        {
          type: "buff",
          target: { kind: "self" },
          attackAmount: { kind: "flat", value: 0 },
          healthAmount: { kind: "flat", value: 0 },
          grantKeywords: [KEYWORD_INCIBLABLE],
          duration: "untilYourNextTurn",
        },
      ]),
      {
        trigger: "onUnitTargeted",
        triggeredBy: { cardTypes: [...UNITES] },
        condition: { selfHasKeyword: KEYWORD_INCIBLABLE },
        description: "Un effet adverse se rabat sur une autre de vos unités : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "le-meneur",
    name: "Le Meneur",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 3,
    maxCopies: 2,
    attack: 4,
    health: 4,
    text:
      "La première fois à chaque tour qu'un autre Altéré que vous contrôlez s'Éveille, déclenchez l'Éveil d'un autre " +
      "Altéré différent que vous contrôlez.",
    abilities: [
      {
        trigger: "onEveil",
        triggeredBy: { subtype: ALTERE, cardTypes: [...UNITES] },
        oncePerTurnKey: "meneur",
        description: "Le premier Éveil du tour en appelle un autre.",
        effects: [eveilDUnAltere({ different: true })],
      },
    ],
  },
  {
    id: "le-feral",
    name: "Le Féral",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 4,
    maxCopies: 3,
    attack: 5,
    health: 4,
    text:
      "Éveil — Il gagne +2 Puissance jusqu'à la fin du tour. À son deuxième Éveil du tour, il peut attaquer " +
      "immédiatement. À son troisième, il inflige 2 dégâts au Navire adverse.",
    // « il peut attaquer immédiatement » : Pied marin jusqu'à la fin du tour,
    // à partir du deuxième Éveil (au troisième, il le garde).
    abilities: [
      eveil("+2 Puissance ; attaque au deuxième Éveil, frappe le Navire au troisième.", [
        {
          type: "buff",
          target: { kind: "self" },
          attackAmount: { kind: "flat", value: 2 },
          healthAmount: { kind: "flat", value: 0 },
          duration: "endOfTurn",
        },
        {
          type: "buff",
          target: { kind: "self" },
          attackAmount: { kind: "flat", value: 0 },
          healthAmount: { kind: "flat", value: 0 },
          grantKeywords: ["pied-marin"],
          duration: "endOfTurn",
          ...RANG(2),
        },
        { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 2 }, ...RANG(3, 3) },
      ]),
    ],
  },
  {
    id: "lattire-fer",
    name: "L'Attire-Fer",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 4,
    maxCopies: 3,
    attack: 4,
    health: 5,
    text:
      "À son arrivée, renvoyez un Objet ou un Équipement dans la main de son propriétaire. Puis déclenchez l'Éveil d'un " +
      "Altéré que vous contrôlez. Si la carte renvoyée était adverse, piochez 1 carte.",
    // « adverse » se lit AVANT le renvoi : en main, la carte n'est plus sur
    // le plateau de personne. « un Altéré » sans « autre » : L'Attire-Fer peut
    // se désigner lui-même.
    abilities: [
      {
        trigger: "onEnterPlay",
        description: "Renvoie un Objet ou un Équipement, puis éveille un Altéré.",
        effects: [
          {
            type: "pickUnits",
            target: { kind: "allUnits" },
            filter: { cardTypes: ["objet", "equipement"] },
            uses: 1,
            thenEffects: [
              { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionTriggerSourceIsOpponents: true },
              { type: "moveZone", target: { kind: "triggerSource" }, toZone: "hand" },
            ],
          },
          eveilDUnAltere({ autre: false }),
        ],
      },
    ],
  },
  {
    id: "la-conscience-commune",
    name: "La Conscience Commune",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 4,
    maxCopies: 1,
    attack: 4,
    health: 5,
    text: "La première fois à chaque tour qu'un Altéré que vous contrôlez s'Éveille, répétez son Éveil.",
    abilities: [
      {
        trigger: "onEveil",
        // « un Altéré » : n'importe lequel des vôtres. Elle-même n'a pas
        // d'Éveil, l'exclure ou non ne change rien.
        triggeredBy: { subtype: ALTERE, cardTypes: [...UNITES], excludeSelf: false },
        oncePerTurnKey: "conscienceCommune",
        description: "Le premier Éveil du tour se répète.",
        effects: [EVEIL_DE_LA_CIBLE],
      },
    ],
  },
  {
    id: "la-revenante",
    name: "La Revenante",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 5,
    maxCopies: 3,
    attack: 5,
    health: 6,
    text:
      "Éveil — Renvoyez dans votre main un Altéré coûtant 3 ou moins depuis votre Cimetière. S'il coûtait 2 ou moins, " +
      "vous pouvez le jouer pour 1 de moins ce tour.",
    abilities: [
      eveil("Repêche un petit Altéré, moins cher s'il coûte 2 ou moins.", [
        {
          type: "pickFromGraveyard",
          target: { kind: "controllerPlayer" },
          filter: { subtype: ALTERE, cardTypes: [...UNITES], maxCost: 3 },
          uses: 1,
          refusable: true,
          thenEffects: [
            {
              type: "discountNextCards",
              target: { kind: "controllerPlayer" },
              amount: { kind: "flat", value: 1 },
              discountOnlyRecoveredCard: true,
              // « s'il coûtait 2 ou moins » : la réduction ne vaut que pour lui.
              filter: { maxCost: 2 },
            },
          ],
        },
      ]),
    ],
  },
  {
    id: "la-chute-de-lange",
    name: "La Chute de l'Ange",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 4,
    maxCopies: 2,
    attack: 5,
    health: 4,
    text:
      "Éveil — Cette carte subit 1 dégât. Infligez 2 dégâts à une unité adverse. Si La Chute de l'Ange a 2 Résistance " +
      "restante ou moins après cet effet, déclenchez l'Éveil d'un autre Altéré que vous contrôlez.",
    abilities: [
      eveil("Se blesse, frappe ; à bout de force, propage l'Éveil.", [
        { type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } },
        uneUniteAdverse([{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 2 } }]),
        eveilDUnAltere({ conditionSourceRemainingResistanceAtMost: 2 }),
      ]),
    ],
  },
  {
    id: "le-diable-en-personne",
    name: "Le Diable en Personne",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 5,
    maxCopies: 1,
    attack: 6,
    health: 5,
    text:
      "Éveil — Vous perdez 1 Ancrage. Puis choisissez un autre Altéré que vous contrôlez : s'il s'est déjà Éveillé ce " +
      "tour, déclenchez de nouveau son Éveil.",
    abilities: [
      eveil("Perd 1 Ancrage, rejoue l'Éveil d'un Altéré déjà Éveillé.", [
        { type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        eveilDUnAltere({ dejaEveille: true }),
      ]),
    ],
  },
  {
    id: "lanomalie-premiere",
    name: "L'Anomalie Première",
    type: "marin",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 7,
    maxCopies: 1,
    attack: 8,
    health: 8,
    text: "À son arrivée, déclenchez l'Éveil de tous vos autres Altérés. Puis répétez l'Éveil de l'un d'eux.",
    // Rareté Abyssale (`cardRarity.ts`), mais une carte à part entière : pas
    // une variante, donc ni suffixe `-abyssal` ni `variant`.
    abilities: [
      {
        trigger: "onEnterPlay",
        description: "Éveille tous vos autres Altérés, puis l'un d'eux une seconde fois.",
        effects: [
          {
            type: "triggerEveil",
            target: { kind: "allAllyUnits" },
            filter: { subtype: ALTERE, cardTypes: [...UNITES], excludeSelf: true },
          },
          // « l'un d'eux » : ceux qui viennent de s'Éveiller.
          eveilDUnAltere({ dejaEveille: true }),
        ],
      },
    ],
  },
];

// ===========================================================================
// VARIANTES ABYSSALES
// ===========================================================================

/**
 * Les deux Abyssales du booster (décision du 04/10/2026) : le lot n'en
 * prévoyait qu'une, L'Anomalie Première, qui n'est pas une variante et
 * plafonne donc à Légendaire. Même modèle que les autres variantes — un de
 * plus au coût, un corps plus solide, l'effet renforcé. Valeurs « à
 * playtester », validées en séance ; illustrations à venir.
 */
const ABYSSALES: CardDefinition[] = [
  {
    id: "la-chute-de-lange-abyssal",
    name: "La Chute de l'Ange",
    type: "marin",
    variant: "abyssale",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 5,
    maxCopies: 1,
    attack: 6,
    health: 5,
    text:
      "Éveil — Cette carte subit 1 dégât. Infligez 3 dégâts à une unité adverse. Si La Chute de l'Ange a 3 Résistance " +
      "restante ou moins après cet effet, déclenchez l'Éveil d'un autre Altéré que vous contrôlez.",
    abilities: [
      eveil("Se blesse, frappe fort ; à bout de force, propage l'Éveil.", [
        { type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } },
        uneUniteAdverse([{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 3 } }]),
        eveilDUnAltere({ conditionSourceRemainingResistanceAtMost: 3 }),
      ]),
    ],
  },
  {
    id: "le-diable-en-personne-abyssal",
    name: "Le Diable en Personne",
    type: "marin",
    variant: "abyssale",
    subtype: ALTERE,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 6,
    maxCopies: 1,
    attack: 7,
    health: 6,
    text:
      "Éveil — Vous perdez 1 Ancrage. Puis choisissez jusqu'à deux autres Altérés que vous contrôlez : pour chacun qui " +
      "s'est déjà Éveillé ce tour, déclenchez de nouveau son Éveil.",
    abilities: [
      eveil("Perd 1 Ancrage, rejoue l'Éveil de deux Altérés déjà Éveillés.", [
        { type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        eveilDUnAltere({ dejaEveille: true, uses: 2 }),
      ]),
    ],
  },
];

// ===========================================================================
// ANOMALIES DE SOUTIEN
// ===========================================================================

const SOUTIENS: CardDefinition[] = [
  {
    id: "alteration-forcee",
    name: "Altération Forcée",
    type: "anomalie",
    permanent: false,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 1,
    maxCopies: 3,
    text: "Déclenchez l'Éveil d'un Altéré que vous contrôlez. Il gagne +1 Puissance jusqu'à la fin du tour.",
    onPlayEffects: [
      { type: "triggerEveil", target: { kind: "chosenUnit", among: { subtype: ALTERE, unitsOnly: true } } },
      {
        type: "buff",
        target: { kind: "chosenUnit", among: { subtype: ALTERE, unitsOnly: true } },
        attackAmount: { kind: "flat", value: 1 },
        healthAmount: { kind: "flat", value: 0 },
        duration: "endOfTurn",
      },
    ],
  },
  {
    id: "propagation",
    name: "Propagation",
    type: "anomalie",
    permanent: false,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 1,
    maxCopies: 3,
    text: "Après qu'un Altéré que vous contrôlez s'est Éveillé : déclenchez l'Éveil d'un autre Altéré que vous contrôlez.",
    // Une réaction JOUÉE depuis la main (`playedFromHand`) : elle se propose
    // dans la fenêtre qui suit un Éveil, se paie à son coût, part au
    // Cimetière et se résout. En phase principale, elle ne se joue pas.
    abilities: [
      {
        trigger: "onEveil",
        mode: "optional",
        playedFromHand: true,
        triggeredBy: { subtype: ALTERE, cardTypes: [...UNITES] },
        description: "Propage l'Éveil à un autre Altéré.",
        effects: [
          {
            type: "triggerEveil",
            target: { kind: "chosenUnit", among: { subtype: ALTERE, unitsOnly: true, excludeTriggerSource: true } },
          },
        ],
      },
    ],
  },
  {
    id: "mutation-reflexe",
    name: "Mutation Réflexe",
    type: "anomalie",
    permanent: false,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 3,
    text: "Quand un Altéré que vous contrôlez est attaqué : déclenchez l'Éveil de cet Altéré, puis annulez cette attaque.",
    // « Brisez 1 carte de votre main » (Notion) : c'est Mutation Réflexe
    // elle-même qui part, jouée depuis la main en réaction — lecture arrêtée
    // le 04/10/2026, comme Propagation (`playedFromHand`).
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        playedFromHand: true,
        condition: { attackTargetIsOwnUnit: true, attackTargetSubtype: ALTERE },
        description: "L'Altéré attaqué s'Éveille, et l'attaque est annulée.",
        effects: [
          { type: "triggerEveil", target: { kind: "attackTarget" } },
          { type: "cancelIncomingAttack", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "ils-etaient-deja-la",
    name: "Ils Étaient Déjà Là",
    type: "anomalie",
    permanent: false,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 3,
    text:
      "Regardez les 5 premières cartes de votre pioche. Ajoutez à votre main une carte Altéré coûtant 2 ou moins parmi " +
      "elles. Remettez les autres au-dessus de votre pioche dans l'ordre de votre choix.",
    // « une carte Altéré » : toute carte de la famille, unité ou Anomalie.
    onPlayEffects: [
      {
        type: "lookAtDeckTop",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 5 },
        uses: 1,
        filter: { archetype: "alteres", maxCost: 2 },
        restTo: "deckTopChosenOrder",
      },
    ],
  },
  {
    id: "surcharge",
    name: "Surcharge",
    type: "anomalie",
    permanent: false,
    archetype: "alteres",
    setCode: LA_MUTATION_MONDIALE,
    cost: 2,
    maxCopies: 2,
    text: "Déclenchez deux fois l'Éveil d'un Altéré que vous contrôlez. Puis il subit 1 dégât.",
    onPlayEffects: [
      { type: "triggerEveil", target: { kind: "chosenUnit", among: { subtype: ALTERE, unitsOnly: true } }, count: 2 },
      { type: "damage", target: { kind: "chosenUnit", among: { subtype: ALTERE, unitsOnly: true } }, amount: { kind: "flat", value: 1 } },
    ],
  },
];

/** Les 22 cartes du Lot 16 et leurs deux variantes Abyssales. */
export const ALTERES_SET: CardDefinition[] = [...MARINS_ALTERES, ...ABYSSALES, ...SOUTIENS];
