import { HIDDEN_CARD_DEFINITION, HIDDEN_CARD_ID } from "@/game/cards/hiddenCard";
import { TOKEN_SET } from "@/game/cards/sets/tokens";
import { EQUIPPABLE_CARD_TYPES, type CardDefinition, type CardInstance } from "@/game/cards/types";

/**
 * Set de base ("Core") — catalogue verrouillé sur Notion (`Catalogue de
 * cartes`, Lots 01 à 09, resynchronisé le 2026-09-11) : Lots 01-07 et 09
 * comme précédemment, plus le Lot 08 ("Grandes Anomalies de Marée",
 * "La Gueule Sous la Mer" / "Sept Brasses Plus Bas") désormais intégré.
 * Cette resynchronisation a aussi scindé en couple STANDARD/ABYSSALE
 * plusieurs cartes dont seule la variante Abyssale existait par erreur
 * sous l'id de base ("Ce Qui Suit le Navire", "Ils Sont Sous Nous",
 * "L'Œil Sous la Mer", "Le Fond Vous Regarde", "Cloche du Grand Fond",
 * "La Mer Réclame Davantage"), corrigé "Bat-Marin — ABYSSALE" qui
 * dupliquait par erreur les stats/texte de sa Standard, et repris deux
 * renommages du catalogue ("Masse Noire" → "Masse-Sombre", "L'Homme
 * Revenu de la Fosse" → "Revenante de la Fosse", cette dernière n'ayant
 * plus de variante Abyssale). Toutes les cartes sont exprimées en
 * données pures : pas de code spécifique à une carte dans le moteur.
 *
 * ÉVICTION DES EAUX (2026-09-10) — le sous-système autonome des Eaux
 * (paquet séparé, révélation, effet environnemental parallèle à la
 * Marée) est abandonné côté design ET retiré du moteur (l'ancien
 * `game/environment/waterData.ts` et les champs `currentWaterId`/
 * `waterRemainingTurns` d'`EnvironmentState` n'existent plus). Ses
 * anciennes fonctions sont absorbées par la Marée : son état, sa durée,
 * et sa nouvelle **orientation** (`EnvironmentState.tideOrientation`,
 * "montante" vers les Abysses / "descendante" vers le Calme — bascule
 * naturellement à ces deux bornes, cf. `game/environment/types.ts`).
 * L'inversion d'orientation par une carte est câblée via l'effet
 * générique `tideInvertOrientation` (ex: "cartes-des-courants") ou
 * `tideSetOrientation` quand le texte fixe un sens précis.
 *
 * FIDÉLITÉ MÉCANIQUE — chaque carte porte son texte RÉEL et complet
 * (`text`), et sa définition doit le réaliser : c'est vérifié carte par
 * carte par `tests/game/cardConformity.test.ts`, qui relit les textes et
 * contrôle la structure (fréquence, caractère facultatif, déclencheur,
 * durée, visibilité, mots-clés, montants, vocabulaire). Un écart assumé
 * s'inscrit dans les `EXCEPTIONS` de ce test AVEC son motif, et se
 * commente ici ; il n'y a plus de convention "non appliqué".
 *
 * Le moteur exprime aujourd'hui : "première fois par tour" par source
 * (`oncePerTurnKey`) et "première fois" définitive (`onceEver`), les
 * déclencheurs d'observateur de portée large (`triggeredBy` : archétype,
 * sous-type, type de carte, camp adverse, permanent équipé), les
 * conditions de capacité évaluées avant consommation (`condition`), les
 * choix de joueur — en fenêtre de réaction (`mode: "optional"") comme en
 * choix bloquant (`choiceGroup` automatique), l'attachement d'Équipement
 * persistant, la lecture d'information cachée, la récupération au
 * Cimetière, le Sabordage forcé (`saborde`) et les boucliers "première
 * fois par tour" (`game/state/shields.ts`). Les capacités de Navire, elles,
 * restent partiellement appliquées (voir `game/environment/shipData.ts`).
 *
 * NOTE — "Calme", "Houle", "Tempête" et "Abysses" sont des termes réservés
 * à l'état de Marée. Résistance = champ `health`, y compris pour les
 * Structures et Objets (le moteur traite déjà tout permanent du board de
 * façon générique pour les dégâts/la mort, cf. `processDeaths.ts`).
 */
/**
 * Lot de diffusion du premier booster Cra-Poiscail (`CardDefinition.setCode`).
 * Tant qu'aucun booster ne déclare ce lot, ses cartes restent hors de tous
 * les pools de tirage — cf. `features/boosters/actions.ts`.
 */
export const CRA_POISCAIL_BOOSTER_1 = "cra-poiscail-1";
/** Deuxième booster de l'archétype — variantes Bris d'Objets, Marée et value. */
export const CRA_POISCAIL_BOOSTER_2 = "cra-poiscail-2";
/** Troisième booster — branche Chevalier/Destrier/Bourreau, finishers et variantes Abyssales. */
export const CRA_POISCAIL_BOOSTER_3 = "cra-poiscail-3";

/** Lot 11 — Les Masques Noyés / Théâtre Englouti (`CardDefinition.setCode`). */
export const THEATRE_ENGLOUTI = "theatre-englouti";

/**
 * Sous-type de la troupe du Théâtre Englouti. Constante plutôt que chaîne
 * répétée : c'est la clé que lisent les filtres de ciblage, les réductions
 * de coût et les capacités d'observateur du lot — une faute de frappe y
 * serait silencieuse.
 */
export const MARIONNETTE = "marionnette";

/** Lot 12 — Rapiécer la Coque (`CardDefinition.setCode`). */
export const RAPIECER_LA_COQUE = "rapiecer-la-coque";

/**
 * Sous-type des volatiles du Lot 12 (Sterne, Goéland, Cormoran, Albatros,
 * Pélican, Mouette). Comme MARIONNETTE : une famille de ciblage et une
 * identité visuelle, pas un mot-clé — aucun volatile ne gagne quoi que ce
 * soit du seul fait d'en être un.
 */
export const VOLATILE = "volatile";

export const CORE_SET: CardDefinition[] = [
  // ======================================================================
  // LOT 01 — Premières cartes
  // ======================================================================
  {
    id: "marin-des-jetees",
    name: "Marin des Jetées",
    type: "marin",
    cost: 1,
    attack: 1,
    health: 2,
    text:
      "À son arrivée, si la Marée est montante, il gagne +1 Résistance jusqu'à votre prochain tour. Si elle est " +
      "descendante, récupérez 1 Raison.",
    onPlayEffects: [
      {
        type: "buff",
        target: { kind: "self" },
        healthAmount: { kind: "flat", value: 1 },
        // "jusqu'à votre prochain tour" : couvre aussi le tour adverse.
        duration: "untilYourNextTurn",
        conditionOrientationIs: "montante",
      },
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionOrientationIs: "descendante" },
    ],
  },
  {
    id: "vieux-loup-de-mer",
    name: "Vieux Loup de Mer",
    type: "marin",
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text: "La première fois à chaque tour que vous perdez de la Raison, réduisez cette perte de 1.",
    reduceOwnReasonLossOncePerTurn: { amount: 1 },
  },
  {
    id: "plongeur-des-epaves",
    name: "Plongeur des Épaves",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 2,
    maxCopies: 2,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, vous pouvez " +
      "récupérer 1 Raison.",
    // « vous pouvez » : proposé, jamais imposé. Le Sabordage déclenche
    // toujours `onDeath` en plus de `onSaborde` (cf. `saborder.ts`) — un
    // seul déclencheur couvre les deux cas du texte.
    abilities: [
      {
        trigger: "onDeath",
        mode: "optional",
        triggeredBy: { cardTypes: ["structure"], sameController: false },
        oncePerTurnKey: "plongeurRecupere",
        description: "Quand une Structure (des deux camps) est détruite ou Sabordée : récupérez 1 Raison. Une fois par tour.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "murene-aveugle",
    name: "Murène Aveugle",
    type: "creature",
    cost: 2,
    attack: 3,
    health: 1,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : corps agressif lisible à 3/1 pour coût 2.
  },
  {
    id: "poisson-lanterne",
    name: "Poisson-Lanterne",
    type: "creature",
    cost: 1,
    attack: 1,
    health: 1,
    text: "À son arrivée, si la Marée actuelle est Tempête ou Abysses, récupérez 1 Raison.",
    onPlayEffects: [
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionTideStateIn: ["tempete", "abysses"],
      },
    ],
  },
  {
    id: "chose-des-hauts-fonds",
    name: "Chose des Hauts-Fonds",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 4,
    text: "Tant que vous avez 5 Raison ou moins, elle gagne Garde.",
    conditionalKeywords: [{ keyword: "garde", controllerReasonAtMost: 5 }],
  },
  {
    id: "caisses-arrimees",
    name: "Caisses Arrimées",
    type: "structure",
    cost: 1,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["calme", "houle"],
    text: "Durée : 4 tours. Visible pendant Calme et Houle. Sabordage : récupérez 2 Ancrage.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : récupérez 2 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
      },
    ],
  },
  {
    id: "brise-vague-de-fortune",
    name: "Brise-Vague de Fortune",
    type: "structure",
    cost: 2,
    health: 4,
    durationTurns: 3,
    visibleDuringTide: ["houle", "tempete"],
    text:
      "Durée : 3 tours. Visible pendant Houle et Tempête. La première fois que votre Navire subit des dégâts de " +
      "Tempête, réduisez-les de 1.",
    // « La première fois que » se lit au pied de la lettre : UN seul usage
    // pour toute la partie, jamais réarmé d'un tour à l'autre (décision du
    // 17/09/2026, tranchée contre la lecture « une fois par tour » qui
    // valait auparavant ici).
    reduceTideShipDamageOncePerTurn: { amount: 1, tideStateIn: ["tempete"], onceEver: true },
  },
  {
    id: "harpon-de-pont",
    name: "Harpon de Pont",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text:
      "Équipez un Marin ou une Créature. Il gagne +1 Puissance. S'il attaque directement le Navire adverse, il " +
      "subit 1 dégât après l'attaque.",
    equipTargetTypes: ["marin", "creature"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 1 },
    selfDamageOnDirectAttack: 1,
  },
  {
    id: "thermos-du-dernier-quart",
    name: "Thermos du Dernier Quart",
    type: "objet",
    cost: 2,
    text: "Brisez cet Objet : récupérez 2 Raison. Si vous avez 3 Raison ou moins, récupérez-en 3 à la place.",
    onBreakEffects: [
      // Ordre important : l'effet conditionnel lit la Raison AVANT que le
      // gain de base ne l'augmente (cf. `conditionControllerReasonAtMost`).
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionControllerReasonAtMost: 3 },
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
    ],
  },
  {
    id: "cylindre-flottant",
    name: "Cylindre flottant",
    type: "structure",
    subtype: "objet-flottant",
    cost: 2,
    maxCopies: 2,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["houle"],
    text:
      "Durée : 3 tours. Visible pendant Houle. La première fois à chaque tour que votre Navire devrait subir des " +
      "dégâts directs d'une attaque, vous pouvez déclencher Contrecoup : annulez ces dégâts et infligez au Navire " +
      "adverse la moitié des dégâts annulés, arrondie au supérieur. Après résolution, elle se brise et quitte le " +
      "board.",
    // Contrecoup résolu automatiquement ("vous pouvez" : renvoyer les dégâts
    // n'est jamais un désavantage) — cf. `game/actions/attack.ts`.
    contrecoupOnDirectShipDamageWhileVisible: { reflectedFraction: 0.5 },
  },
  {
    id: "quelque-chose-sous-la-coque",
    name: "Quelque Chose Sous la Coque",
    type: "anomalie",
    cost: 4,
    // Valeur de Résistance absente du cadrage Notion pour cette famille de cartes (texte muet sur ce point,
    // comme pour les Structures) : fixée ici par cohérence avec des permanents de coût comparable, PLUTÔT
    // que de laisser `health` undefined — `computeEffectiveStats` retombe alors sur 0, ce qui ferait mourir
    // l'Anomalie instantanément dès le premier `processDeaths` après sa pose (0 dégât marqué >= 0 PV). À
    // ajuster si un vrai chiffrage Notion existe pour ce lot.
    health: 3,
    maxCopies: 2,
    durationTurns: 2,
    text: "Pendant 2 tours, chaque joueur perd 1 Raison la première fois qu'il joue une carte pendant son tour.",
    anomalyReasonLossOnFirstCardPlayedPerTurn: 1,
  },

  // ======================================================================
  // LOT 02 — Contrôle, environnement et permanents déclenchés
  // ======================================================================
  {
    id: "cartes-des-courants",
    name: "Cartes des Courants",
    type: "objet",
    cost: 2,
    text: "Brisez cet Objet : inversez l'orientation de la prochaine transition de Marée (montante ↔ descendante).",
    onBreakEffects: [{ type: "tideInvertOrientation", target: { kind: "allPlayers" } }],
  },
  {
    id: "cloche-dalerte",
    name: "Cloche d'Alerte",
    type: "structure",
    cost: 1,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle"],
    maxCopies: 2,
    text:
      "Durée : 3 tours. Visible pendant Calme et Houle. La première fois à chaque tour que l'adversaire Brise un " +
      "Objet, il doit payer 1 Raison supplémentaire. S'il ne peut pas payer, l'Objet ne peut pas être Brisé.",
    // La taxe s'ajoute au coût du Bris (depuis la main : demi-coût + 1 ;
    // depuis le plateau : 1 au lieu de rien) ET le rend impossible si la
    // Raison ne couvre pas le total — c'est la seule entorse au « pas de
    // plancher de Déraison », portée par la carte (cf. `objectBreakTax`).
    taxOpponentObjectBreakOncePerTurnWhileVisible: { amount: 1, blocksIfUnpayable: true },
  },
  {
    id: "ancre-de-derive",
    name: "Ancre de Dérive",
    type: "structure",
    cost: 2,
    health: 3,
    durationTurns: 3,
    visibleDuringTide: ["houle", "tempete"],
    maxCopies: 2,
    text:
      "Durée : 3 tours. Visible pendant Houle et Tempête. Lorsqu'une nouvelle Marée est annoncée, vous pouvez " +
      "Saborder cette carte : les effets de cette Marée ne s'appliquent qu'à la fin du tour en cours.",
    // Résolu automatiquement au changement d'état (Sabordage + report), tant
    // qu'elle est visible dans la nouvelle Marée — cf. `resolveTideTurnStep`.
    defersTideEffectsOnChangeWhileVisible: true,
  },
  {
    id: "marin-aux-yeux-rouges",
    name: "Marin aux Yeux Rouges",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 2,
    text: "À son arrivée, chaque joueur perd 1 Raison.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    // Première carte à capacité FACULTATIVE (`mode: "optional"`) du
    // catalogue — démontre le pipeline de fenêtre de réaction de bout en
    // bout (Notion "Moteur de partie — déroulement, Raison & chaînes
    // d'effets", section "Effets facultatifs / réactions", verrouillage
    // du 2026-09-10). `onCardPlayed` se déclenche pour n'importe quelle
    // carte jouée par n'importe quel joueur (même convention que les
    // capacités automatiques existantes sur ce trigger) : le texte reste
    // volontairement neutre plutôt que de prétendre à tort "seulement
    // l'adversaire".
    id: "guetteur-mefiant",
    name: "Guetteur Méfiant",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 2,
    text: "Réaction : quand une carte est jouée, vous pouvez dépenser 1 Raison : infligez 2 dégâts à une unité de votre choix.",
    abilities: [
      {
        trigger: "onCardPlayed",
        mode: "optional",
        cost: { reason: 1 },
        effects: [{ type: "damage", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 2 } }],
        description: "Vous pouvez dépenser 1 Raison : infligez 2 dégâts à une unité de votre choix.",
      },
    ],
  },
  {
    // Variante ABYSSALE distincte de "marin-aux-yeux-rouges" (coexiste avec la
    // Standard, cf. Notion "Catalogue de cartes" — règle des variantes Abyssales) :
    // le catalogue verrouillé compte cette carte comme le "+1" au-delà des 80
    // cartes de base ("80 cartes de base conçues et auditées + 1 variante
    // Abyssale distincte", TCG_DATABASE.md).
    id: "marin-aux-yeux-rouges-abyssal",
    name: "Marin aux Yeux Rouges",
    type: "marin",
    variant: "abyssale",
    cost: 3,
    attack: 3,
    health: 3,
    text:
      "À son arrivée, chaque joueur perd 1 Raison. Si la Marée est montante, l'adversaire perd 1 Raison " +
      "supplémentaire. Si elle est descendante, récupérez 1 Raison.",
    onPlayEffects: [
      { type: "reasonLoss", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonLoss",
        target: { kind: "opponentPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionOrientationIs: "montante",
      },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionOrientationIs: "descendante",
      },
    ],
  },
  {
    id: "guetteur-de-brume",
    name: "Guetteur de Brume",
    type: "marin",
    cost: 2,
    attack: 1,
    health: 3,
    text:
      "La première fois à chaque tour que l'adversaire active une réaction pendant votre tour, révélez 1 carte " +
      "aléatoire de sa main.",
    revealOpponentHandOnReactionOncePerTurn: { amount: 1 },
  },
  {
    id: "matelot-du-sans-nom",
    name: "Matelot du Sans-Nom",
    type: "marin",
    cost: 3,
    attack: 3,
    health: 4,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : 3/4 pour coût 3 sert de référence de corps simple.
  },
  {
    id: "anguille-des-profondeurs",
    name: "Anguille des Profondeurs",
    type: "creature",
    cost: 3,
    attack: 3,
    health: 2,
    text: "Pendant Abysses, lorsqu'elle inflige des dégâts directs au Navire adverse, celui-ci perd aussi 1 Raison.",
    opponentReasonLossOnDirectAttack: { amount: 1, tideStateIn: ["abysses"] },
  },
  {
    id: "crabe-de-fer",
    name: "Crabe de Fer",
    type: "creature",
    cost: 3,
    attack: 2,
    health: 5,
    keywords: ["garde"],
    text: "Garde. Perd Garde pendant Calme.",
    conditionalKeywordSuppressions: [{ keyword: "garde", tideStateIn: ["calme"] }],
  },
  {
    id: "bouee-de-derive",
    name: "Bouée de Dérive",
    type: "structure",
    cost: 1,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle"],
    text:
      "Durée : 3 tours. Visible pendant Calme et Houle. À votre début de tour, si elle est visible et que la " +
      "Marée est descendante, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "À votre début de tour, si elle est visible et que la Marée est descendante, récupérez 1 Raison.",
        effects: [
          {
            type: "reasonGain",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionOrientationIs: "descendante",
            conditionSelfVisible: true,
          },
        ],
      },
    ],
  },
  {
    id: "epave-a-fleur-deau",
    name: "Épave à Fleur d'Eau",
    type: "structure",
    cost: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["houle"],
    text:
      "Durée : 4 tours. Visible pendant Houle uniquement. Lorsqu'elle devient visible, vous pouvez défausser 1 " +
      "carte. Si vous le faites, piochez 1 carte.",
    // Réaction facultative à sa propre apparition (`STRUCTURE_REVEALED`).
    // Fidélité partielle : la carte défaussée est la plus ancienne de la
    // main, pas choisie. Pioche AVANT défausse (même résultat) pour que la
    // garde "au moins 1 carte en main" lise la main d'avant l'échange.
    abilities: [
      {
        trigger: "onBecomeVisible",
        mode: "optional",
        description: "Vous pouvez défausser 1 carte. Si vous le faites, piochez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionControllerHandAtLeast: 1 },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionControllerHandAtLeast: 2 },
        ],
      },
    ],
  },
  {
    id: "le-chant-sous-la-ligne",
    name: "Le Chant Sous la Ligne",
    type: "anomalie",
    cost: 4,
    health: 3, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 2,
    durationTurns: 2,
    text: "Pendant 2 tours, chaque fois qu'un joueur récupère de la Raison, il en récupère 1 de moins, minimum 0.",
    anomalyReduceAllReasonGains: 1,
  },
  {
    id: "plaque-de-fortune",
    name: "Plaque de Fortune",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 1,
    text:
      "Équipez un permanent. La première fois qu'il devrait être détruit, détruisez la Plaque de Fortune à la " +
      "place et ce permanent perd 1 Résistance.",
    // « Un permanent » : la seule Plaque qui se pose AUSSI sur une Structure
    // — par défaut un Équipement ne va que sur une unité.
    equipTargetTypes: ["marin", "creature", "structure"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    destructionSubstitute: { healthPenalty: 1 },
  },

  // ======================================================================
  // LOT 03 — Abysses, visibilité et contrôle de Marée
  // ======================================================================
  {
    id: "cartographe-du-large",
    name: "Cartographe du Large",
    type: "marin",
    cost: 2,
    attack: 1,
    health: 3,
    text: "À son arrivée, vous pouvez inverser l'orientation de la Marée. Si vous le faites, perdez 1 Raison.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        cost: { reason: 1 },
        description: "Vous pouvez dépenser 1 Raison : inversez l'orientation de la Marée.",
        effects: [{ type: "tideInvertOrientation", target: { kind: "allPlayers" } }],
      },
    ],
  },
  {
    id: "matelot-insomniaque",
    name: "Matelot Insomniaque",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 3,
    text: "Tant que votre Raison est inférieure ou égale à 4, il gagne +1 Puissance.",
    selfBuffWhileControllerReasonAtMost: { reasonAtMost: 4, attackAmount: 1 },
  },
  {
    id: "gardien-du-sondeur",
    name: "Gardien du Sondeur",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 4,
    text: "La première fois à chaque tour qu'une Structure que vous contrôlez devient visible, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        triggeredBy: { cardTypes: ["structure"] },
        oncePerTurnKey: "sondeurVisible",
        description: "La première fois par tour qu'une de vos Structures devient visible : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "raie-des-fosses",
    name: "Raie des Fosses",
    type: "creature",
    cost: 3,
    maxCopies: 2,
    attack: 3,
    health: 3,
    text: "Pendant Abysses, elle peut attaquer le Navire adverse même si celui-ci est protégé par une carte avec Garde.",
    bypassesGardeTideStateIn: ["abysses"],
  },
  {
    id: "poisson-aux-dents-de-verre",
    name: "Poisson aux Dents de Verre",
    type: "creature",
    cost: 2,
    attack: 2,
    health: 3,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : récompense de combat lisible via ses stats seules.
  },
  {
    id: "la-chose-qui-remonte",
    name: "La Chose qui Remonte",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 5,
    requiresTideState: ["tempete", "abysses"],
    text: "Ne peut être jouée que pendant Tempête ou Abysses. À son arrivée, perdez 2 Raison.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
  },
  {
    id: "treuil-rouille",
    name: "Treuil Rouillé",
    type: "equipement",
    permanent: true,
    cost: 1,
    health: 2,
    text:
      "Équipez une Structure. Elle gagne +1 Résistance. Quand la Structure équipée quitte le board, piochez 1 " +
      "carte.",
    equipTargetTypes: ["structure"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    // Le porteur part (détruit, Sabordé — qui déclenche aussi `onDeath` —
    // ou expiré) : l'Équipement est encore sur le plateau à cet instant
    // (`destroyOrphanedEquipment` ne le retire qu'ensuite), il peut donc
    // suivre son porteur via `triggeredBy.equippedUnit`.
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { equippedUnit: true },
        description: "Quand la Structure équipée quitte le board : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onExpire",
        triggeredBy: { equippedUnit: true },
        description: "Quand la Structure équipée expire : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "lampe-de-pont-rouge",
    name: "Lampe de Pont Rouge",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text: "Équipez un Marin. Tant que vous êtes en Houle ou Tempête, il gagne +1 Puissance et +1 Résistance.",
    equipTargetTypes: ["marin"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    // Bug corrigé au passage : l'Équipement ne s'attachait même pas (onPlayEffects absent).
    equipGrantsBuffWhileTideStateIn: { tideStateIn: ["houle", "tempete"], attackAmount: 1, healthAmount: 1 },
  },
  {
    id: "filet-a-la-derive",
    name: "Filet à la Dérive",
    type: "structure",
    cost: 2,
    health: 3,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle"],
    text:
      "Durée : 3 tours. Visible pendant Calme et Houle. À votre début de tour, si elle est visible, vous pouvez " +
      "choisir une Créature adverse : elle perd 1 Puissance jusqu'à la fin du tour.",
    // La Créature visée est désignée par le joueur.
    abilities: [
      {
        trigger: "startOfTurn",
        mode: "optional",
        // « si elle est visible » : gardé au niveau de la CAPACITÉ, sinon le
        // Filet caché se proposerait dans la fenêtre pour ne rien faire. Le
        // `conditionSelfVisible` de l'effet reste : la Marée peut changer
        // entre l'ouverture de la fenêtre et l'activation.
        condition: { selfVisible: true },
        description: "À votre début de tour, si elle est visible : une Créature adverse perd 1 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "debuff",
            target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["creature"] } },
            attackAmount: { kind: "flat", value: 1 },
            conditionSelfVisible: true,
          },
        ],
      },
    ],
  },
  {
    id: "epave-engloutie",
    name: "Épave Engloutie",
    type: "structure",
    cost: 3,
    health: 4,
    durationTurns: 5,
    visibleDuringTide: ["abysses"],
    maxCopies: 2,
    text:
      "Durée : 5 tours. Visible pendant Abysses. Lorsqu'elle devient visible, récupérez 2 Raison. Lorsqu'elle " +
      "quitte Abysses sans avoir été détruite, Sabordez-la.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        description: "Lorsqu'elle devient visible, récupérez 2 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
      },
      {
        trigger: "onTideStateExited",
        condition: { tideState: "abysses" },
        description: "Lorsque la Marée quitte les Abysses : Sabordez-la.",
        effects: [{ type: "saborde", target: { kind: "self" } }],
      },
    ],
  },
  {
    id: "balise-des-profondeurs",
    name: "Balise des Profondeurs",
    type: "structure",
    subtype: "objet-flottant",
    cost: 2,
    health: 2,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete", "abysses"],
    maxCopies: 2,
    text:
      "Durée : 4 tours. Visible pendant Houle, Tempête et Abysses. La première fois à chaque tour que la Marée " +
      "change, vous pouvez perdre 1 Raison. Si vous le faites, augmentez de 1 tour la durée du nouvel état.",
    abilities: [
      {
        trigger: "onTideStateEntered",
        mode: "optional",
        cost: { reason: 1 },
        oncePerTurnKey: "baliseProlonge",
        description: "Vous pouvez perdre 1 Raison : prolongez la nouvelle Marée d'1 tour.",
        effects: [{ type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "les-voix-dans-le-sillage",
    name: "Les Voix dans le Sillage",
    type: "anomalie",
    cost: 5,
    health: 4, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 2,
    durationTurns: 2,
    text: "Pendant 2 tours, chaque joueur perd 1 Raison la première fois qu'un de ses permanents quitte le board.",
    anomalyReasonLossOnFirstPermanentLeavingPerTurn: 1,
  },

  // ======================================================================
  // LOT 04 — Pression, horreur et cartes de rupture
  // ======================================================================
  {
    id: "harponneur-du-dernier-quai",
    name: "Harponneur du Dernier Quai",
    type: "marin",
    cost: 3,
    attack: 3,
    health: 3,
    text: "Lorsqu'il attaque pendant Tempête, il gagne +1 Puissance pour ce combat. Après l'attaque, perdez 1 Raison.",
    bonusDamageInTideState: { tideStateIn: ["tempete"], amount: 1 },
    controllerReasonLossAfterAttack: 1,
  },
  {
    id: "capitaine-sans-sommeil",
    name: "Capitaine Sans Sommeil",
    type: "marin",
    cost: 4,
    maxCopies: 2,
    attack: 3,
    health: 5,
    text: "Tant que votre Raison est à 3 ou moins, les autres Marins que vous contrôlez gagnent +1 Résistance.",
    auraBuffOtherUnitsWhileControllerReasonAtMost: { reasonAtMost: 3, targetType: "marin", healthAmount: 1 },
  },
  {
    // Renommée "L'Homme Revenu de la Fosse" → "Revenante de la Fosse" (Notion "Catalogue de cartes", Lot 04)
    // — id conservé (référencée par testDecks.ts). Coexiste avec une variante ABYSSALE distincte ci-dessous
    // (confirmée malgré la note de lot qui la disait "STANDARD seule" — texte non mis à jour côté Notion).
    id: "lhomme-revenu-de-la-fosse",
    name: "Revenante de la Fosse",
    type: "marin",
    cost: 4,
    attack: 3,
    health: 4,
    text: "À son arrivée, perdez 1 Raison. Tant que vous êtes en Abysses, il gagne +1 Résistance.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
    tideAffinity: { abysses: { attack: 3, health: 5 } },
  },
  {
    // Variante ABYSSALE distincte — reprend les stats/texte de l'ancienne entrée unique sous
    // "L'Homme Revenu de la Fosse" avant renommage, correspondant aux illustrations fournies
    // ("revenante-de-la-fosse-abyssal.webp"/"-debord").
    id: "revenante-de-la-fosse-abyssal",
    name: "Revenante de la Fosse",
    type: "marin",
    variant: "abyssale",
    cost: 5,
    attack: 4,
    health: 4,
    maxCopies: 1,
    text:
      "À son arrivée, perdez 2 Raison. Tant que vous êtes en Abysses, la première fois à chaque tour qu'il devrait " +
      "être détruit, il reste à 1 Résistance à la place.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
    survivesLethalOncePerTurn: { tideStateIn: ["abysses"] },
  },
  {
    id: "requin-balafre",
    name: "Requin Balafré",
    type: "creature",
    cost: 3,
    attack: 4,
    health: 2,
    text: "Lorsqu'il inflige des dégâts directs au Navire adverse, il subit 1 dégât.",
    selfDamageOnDirectAttack: 1,
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 04, confirmée coexister avec une variante ABYSSALE
    // distincte — non reflété dans le texte du lot, qui ne montre qu'une ligne). Stats inférées (aucune
    // ligne STANDARD publiée) en cohérence avec l'écart Standard/Abyssale observé ailleurs dans ce lot ;
    // à corriger si des chiffres officiels sont publiés.
    id: "masse-sombre",
    name: "Masse-Sombre",
    type: "creature",
    cost: 3,
    attack: 3,
    health: 4,
    text: "Pendant Calme, elle ne peut pas attaquer. Pendant Abysses, elle gagne +1 Puissance.",
    tideAffinity: {
      calme: { attack: 3, health: 4, inactive: true },
      abysses: { attack: 4, health: 4 },
    },
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée du
    // catalogue sous l'id "masse-noire" ; renommée et scindée pour correspondre aux illustrations
    // fournies ("masse-sombre-abyssal.webp"/"-debord") et à la confirmation d'une vraie paire STD/ABY.
    id: "masse-sombre-abyssal",
    name: "Masse-Sombre",
    type: "creature",
    variant: "abyssale",
    cost: 4,
    attack: 4,
    health: 5,
    text: "Pendant Calme, elle ne peut pas attaquer. Pendant Abysses, elle gagne +1 Puissance.",
    tideAffinity: {
      calme: { attack: 4, health: 5, inactive: true },
      abysses: { attack: 5, health: 5 },
    },
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 04) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "ce-qui-suit-le-navire",
    name: "Ce Qui Suit le Navire",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 5,
    text: "Vous ne pouvez la jouer que si vous avez 5 Raison ou moins. À son arrivée, perdez 1 Ancrage.",
    requiresControllerReasonAtMost: 5,
    onPlayEffects: [{ type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "ce-qui-suit-le-navire-abyssal",
    name: "Ce Qui Suit le Navire",
    type: "creature",
    variant: "abyssale",
    cost: 5,
    attack: 6,
    health: 6,
    maxCopies: 1,
    text:
      "Vous devez avoir exactement 5 Raison pour jouer cette carte. Après paiement de son coût, votre Raison tombe " +
      "donc à 0. À son arrivée, perdez 2 Ancrage.",
    requiresControllerReasonExactly: 5,
    onPlayEffects: [{ type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
  },
  {
    id: "treuil-a-chair",
    name: "Treuil à Chair",
    type: "equipement",
    permanent: true,
    cost: 3,
    health: 2,
    text: "Équipez une Créature. Elle gagne +2 Puissance. À chaque fin de votre tour où elle a attaqué, perdez 1 Raison.",
    equipTargetTypes: ["creature"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 2 },
    // Bug corrigé au passage : `attachEquipment`/`equipTargetTypes` manquaient (l'Équipement ne s'attachait jamais).
    abilities: [
      {
        trigger: "endOfTurn",
        description: "À la fin de votre tour, si la Créature équipée a attaqué : perdez 1 Raison.",
        effects: [
          {
            type: "reasonLoss",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionEquippedUnitAttackedThisTurn: true,
          },
        ],
      },
    ],
  },
  {
    id: "lanterne-aux-verres-noirs",
    name: "Lanterne aux Verres Noirs",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text:
      "Équipez un Marin. À votre début de tour, vous pouvez perdre 1 Raison. Si vous le faites, choisissez : " +
      "réduisez de 1 tour la durée de la Marée actuelle ; ou inversez l'orientation de la Marée.",
    // Deux capacités facultatives d'un même `choiceGroup` : activer l'une
    // écarte l'autre pour le tour (une seule option, comme le texte).
    equipTargetTypes: ["marin"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "startOfTurn",
        mode: "optional",
        cost: { reason: 1 },
        choiceGroup: "lanterneChoix",
        description: "Vous pouvez dépenser 1 Raison : réduisez de 1 tour la durée de la Marée actuelle.",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "startOfTurn",
        mode: "optional",
        cost: { reason: 1 },
        choiceGroup: "lanterneChoix",
        description: "Vous pouvez dépenser 1 Raison : inversez l'orientation de la prochaine transition de Marée.",
        effects: [{ type: "tideInvertOrientation", target: { kind: "allPlayers" } }],
      },
    ],
  },
  {
    id: "cage-de-flottaison",
    name: "Cage de Flottaison",
    type: "structure",
    cost: 3,
    maxCopies: 2,
    health: 5,
    durationTurns: 4,
    visibleDuringTide: ["calme", "houle", "tempete"],
    text:
      "Durée : 4 tours. Visible pendant Calme, Houle et Tempête. La première fois à chaque tour qu'une Créature " +
      "devrait infliger des dégâts directs à votre Navire, réduisez ces dégâts de 1.",
    reduceDirectShipDamageOncePerTurn: { amount: 1, attackerCardTypes: ["creature"] },
  },
  {
    id: "ponton-aux-cloches",
    name: "Ponton aux Cloches",
    type: "structure",
    cost: 3,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete"],
    text: "Durée : 4 tours. Visible pendant Houle et Tempête. Lorsqu'il devient visible, chaque joueur perd 1 Raison.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        description: "Lorsqu'il devient visible, chaque joueur perd 1 Raison.",
        effects: [{ type: "reasonLoss", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "la-bouee-qui-regardait",
    name: "La Bouée qui Regardait",
    type: "structure",
    subtype: "objet-flottant",
    cost: 4,
    health: 3,
    durationTurns: 5,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 5 tours. Visible pendant Tempête et Abysses. Lorsqu'elle devient visible, révélez 1 carte aléatoire " +
      "de la main adverse. Si la Marée est en Abysses, révélez-en 2 à la place.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        description: "Regardez une carte aléatoire de la main adverse (2 en Abysses).",
        effects: [
          { type: "revealRandomHandCards", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } },
          {
            type: "revealRandomHandCards",
            target: { kind: "opponentPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionTideStateIn: ["abysses"],
          },
        ],
      },
    ],
    // NOTE : `onBecomeVisible` ne se déclenche que sur la transition
    // invisible → visible (`game/environment/resolveEnvironment.ts`), qui,
    // en progression normale (un état à la fois), passe TOUJOURS par
    // Tempête avant d'atteindre l'Abysses — la branche "2 cartes" ci-dessus
    // n'est donc atteignable aujourd'hui que si un futur effet fait entrer
    // directement dans l'Abysses depuis un état invisible (ex: un saut de
    // Marée multi-états façon Lot 08, "La Gueule Sous la Mer"). Comportement
    // correct tel qu'écrit, simplement pas encore démontrable en jeu normal.
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 04) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "ils-sont-sous-nous",
    name: "Ils Sont Sous Nous",
    type: "anomalie",
    cost: 5,
    health: 4, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 2,
    durationTurns: 2,
    text: "Pendant 2 tours, la première fois à chaque tour qu'un joueur joue un permanent, ce joueur perd 1 Raison.",
    anomalyReasonLossOnFirstPermanentPlayedPerTurn: { amount: 1 },
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "ils-sont-sous-nous-abyssal",
    name: "Ils Sont Sous Nous",
    type: "anomalie",
    variant: "abyssale",
    cost: 6,
    health: 5, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 1,
    durationTurns: 2,
    text:
      "Pendant 2 tours, la première fois à chaque tour qu'un joueur joue un permanent, ce joueur perd 1 Raison. " +
      "Si ce permanent est une Créature, il perd 1 Raison supplémentaire.",
    anomalyReasonLossOnFirstPermanentPlayedPerTurn: { amount: 1, bonusIfCreature: 1 },
  },

  // ======================================================================
  // LOT 05 — Fondations, anti-Structure et recyclage
  // ======================================================================
  {
    id: "mousse-du-premier-quart",
    name: "Mousse du Premier Quart",
    type: "marin",
    cost: 1,
    attack: 1,
    health: 2,
    text: "À son arrivée, si votre Raison est inférieure à celle de l'adversaire, récupérez 1 Raison.",
    onPlayEffects: [
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionControllerReasonBelowOpponent: true,
      },
    ],
  },
  {
    // Renommée "Charpentier de Bord" → "Gabière du Grand Large" (Notion "Catalogue de cartes", Lot 05) — id
    // conservé (référencé par preconstructed.ts) ; perd son effet d'arrivée, devient une carte simple sans texte.
    id: "charpentier-de-bord",
    name: "Gabière du Grand Large",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 3,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : 2/3 pour coût 2 sert de référence de corps simple.
  },
  {
    id: "contremaitre-des-amarres",
    name: "Contremaître des Amarres",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 3,
    text: "La première fois à chaque tour qu'une Structure adverse devient visible, elle perd 1 Résistance.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        triggeredBy: { cardTypes: ["structure"], opponentOnly: true },
        oncePerTurnKey: "contremaitreVisible",
        description: "La première fois par tour qu'une Structure adverse devient visible : elle perd 1 Résistance.",
        effects: [{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "barracuda-des-hauts-fonds",
    name: "Barracuda des Hauts-Fonds",
    type: "creature",
    cost: 2,
    attack: 3,
    health: 2,
    text: "Lorsqu'il attaque une Structure, il gagne +1 Puissance pour ce combat.",
    bonusDamageVsTargetType: { type: "structure", amount: 1 },
  },
  {
    id: "bernard-lermite-dacier",
    name: "Bernard-l'Ermite d'Acier",
    type: "creature",
    cost: 1,
    attack: 1,
    health: 3,
    text: "Tant que vous contrôlez une Structure visible, il gagne +1 Résistance.",
    selfBuffWhileControllingVisibleStructure: { healthAmount: 1 },
  },
  {
    id: "poisson-scie-gris",
    name: "Poisson-Scie Gris",
    type: "creature",
    cost: 3,
    attack: 3,
    health: 3,
    text: "Lorsqu'il inflige des dégâts à une Structure, infligez 1 dégât supplémentaire à cette Structure.",
    bonusDamageVsTargetType: { type: "structure", amount: 1 },
  },
  {
    id: "corde-de-remorquage",
    name: "Corde de Remorquage",
    type: "equipement",
    permanent: true,
    cost: 1,
    health: 1,
    tags: ["equipement"],
    equipTargetTypes: ["marin"],
    text: "Équipez un Marin. Lorsqu'il attaque une Structure, il gagne +1 Puissance.",
    // Bug corrigé au passage : l'Équipement ne s'attachait jamais (onPlayEffects absent), rendant
    // `bonusDamageVsTargetType` ci-dessous inerte en pratique (jamais d'`attachedToInstanceId` à trouver).
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    bonusDamageVsTargetType: { type: "structure", amount: 1 },
  },
  {
    id: "kit-de-calfatage",
    name: "Kit de Calfatage",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text: "Équipez une Structure. À votre début de tour, si elle est visible, elle récupère 1 Résistance.",
    equipTargetTypes: ["structure"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "startOfTurn",
        description: "À votre début de tour, si la Structure équipée est visible : elle récupère 1 Résistance.",
        effects: [
          {
            type: "heal",
            target: { kind: "equippedUnit" },
            amount: { kind: "flat", value: 1 },
            conditionEquippedUnitVisible: true,
          },
        ],
      },
    ],
  },
  {
    id: "radeau-de-fortune",
    name: "Radeau de Fortune",
    type: "structure",
    subtype: "objet-flottant",
    cost: 1,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle"],
    text:
      "Durée : 3 tours. Visible pendant Calme et Houle. Lorsqu'il quitte le board sans avoir été détruit, récupérez " +
      "1 Ancrage.",
    abilities: [
      {
        trigger: "onExpire",
        description: "Lorsqu'il expire (sans avoir été détruit), récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onSaborde",
        description: "Lorsqu'il est Sabordé (sans avoir été détruit), récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "epaves-accrochees",
    name: "Épaves Accrochées",
    type: "structure",
    cost: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete"],
    text:
      "Durée : 4 tours. Visible pendant Houle et Tempête. Lorsqu'une autre Structure que vous contrôlez est " +
      "détruite, cette carte gagne +1 Résistance. Maximum +2.",
    buffSelfOnOtherOwnStructureDestroyed: { healthAmount: 1, maxStacks: 2 },
  },
  {
    id: "levier-de-lest",
    name: "Levier de Lest",
    type: "objet",
    cost: 1,
    text: "Brisez cet Objet et Sabordez une Structure que vous contrôlez : récupérez 1 Raison et 1 Ancrage.",
    // Le Sabordage est un COÛT du Bris : sans Structure à Saborder, le Bris
    // est refusé (`breakObject` exige une cible légale).
    onBreakEffects: [
      { type: "saborde", target: { kind: "chosenUnit", among: { cardTypes: ["structure"] } } },
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "grappin-de-recuperation",
    name: "Grappin de Récupération",
    type: "objet",
    cost: 2,
    text:
      "Brisez cet Objet : choisissez dans votre Cimetière une Structure ou un Équipement coûtant 2 ou moins. " +
      "Remettez cette carte dans votre main.",
    onBreakEffects: [
      {
        type: "moveGraveyardCardToHand",
        target: { kind: "controllerPlayer" },
        filter: { cardTypes: ["structure", "equipement"], maxCost: 2 },
      },
    ],
  },

  // ======================================================================
  // LOT 06 — Profondeurs, endurance et pression mentale
  // ======================================================================
  {
    // Id historique conservé (référencé par `public.cards`, collections et decks) : la carte a été renommée
    // "Seconde" pour la parité (Notion "Catalogue de cartes", Lot 06).
    id: "second-au-visage-pale",
    name: "Seconde au Visage Pâle",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 4,
    text:
      "Tant que vous êtes en Tempête ou Abysses, la première fois à chaque tour que vous devriez perdre de la " +
      "Raison, réduisez cette perte de 1.",
    reduceOwnReasonLossOncePerTurn: { amount: 1, tideStateIn: ["tempete", "abysses"] },
  },
  {
    // Id historique conservé (référencé par `public.cards`, collections et decks) : la carte a été renommée
    // "Veilleuse" pour la parité (Notion "Catalogue de cartes", Lot 06).
    id: "veilleur-des-profondeurs",
    name: "Veilleuse des Profondeurs",
    type: "marin",
    cost: 4,
    attack: 3,
    health: 4,
    text:
      "À son arrivée, si la Marée est en Abysses, forcez son orientation à devenir descendante. Sinon, vous " +
      "pouvez réduire de 1 tour la durée de la Marée actuelle.",
    abilities: [
      {
        trigger: "onEnterPlay",
        condition: { tideStateIn: ["abysses"] },
        description: "À son arrivée, si la Marée est en Abysses : son orientation devient descendante.",
        effects: [{ type: "tideSetOrientation", target: { kind: "allPlayers" }, forceTideOrientation: "descendante" }],
      },
      {
        trigger: "onEnterPlay",
        mode: "optional",
        condition: { tideStateIn: ["calme", "houle", "tempete"] },
        description: "À son arrivée, hors Abysses : vous pouvez réduire de 1 tour la durée de la Marée actuelle.",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "mecanicien-aux-mains-noires",
    name: "Mécanicien aux Mains Noires",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 3,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite, vous pouvez choisir une " +
      "autre Structure que vous contrôlez : elle gagne +1 Résistance.",
    // La cible est DÉSIGNÉE par le joueur, dans une fenêtre de réaction : le
    // moteur ne choisit jamais à sa place (décision du 17/09/2026).
    abilities: [
      {
        trigger: "onDeath",
        mode: "optional",
        triggeredBy: { cardTypes: ["structure"] },
        oncePerTurnKey: "mecanicienRepare",
        description: "Quand une de vos Structures est détruite : une autre de vos Structures gagne +1 Résistance. Une fois par tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { cardTypes: ["structure"] } },
            healthAmount: { kind: "flat", value: 1 },
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "meduse-des-lanternes",
    name: "Méduse des Lanternes",
    type: "creature",
    cost: 2,
    attack: 2,
    health: 2,
    text: "Lorsqu'elle devient la seule Créature que vous contrôlez, récupérez 1 Raison.",
    // Photo du plateau avant/après chaque action (`processLoneCreatureChanges`) :
    // se déclenche dès qu'elle devient la seule Créature de son contrôleur.
    abilities: [
      {
        trigger: "onBecomeOnlyCreature",
        description: "Quand elle devient votre seule Créature en jeu : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "baleine-aux-cicatrices-blanches",
    name: "Baleine aux Cicatrices Blanches",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 6,
    text: "La première fois à chaque tour qu'elle subit des dégâts, réduisez-les de 1.",
    reduceOwnDamageTakenOncePerTurn: 1,
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 06) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "loeil-sous-la-mer",
    name: "L'Œil Sous la Mer",
    type: "creature",
    cost: 5,
    attack: 4,
    health: 6,
    requiresTideState: ["abysses"],
    text: "Ne peut être jouée que pendant Abysses. À son arrivée, chaque joueur perd 1 Raison.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "loeil-sous-la-mer-abyssal",
    name: "L'Œil Sous la Mer",
    type: "creature",
    variant: "abyssale",
    cost: 6,
    attack: 5,
    health: 7,
    maxCopies: 1,
    requiresTideState: ["abysses"],
    text: "Ne peut être jouée que pendant Abysses. À son arrivée, chaque joueur perd 2 Raison.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 2 } }],
  },
  {
    id: "masque-de-plongee-fissure",
    name: "Masque de Plongée Fissuré",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text: "Équipez un Marin. Pendant Abysses, il gagne +2 Résistance. À chaque sortie des Abysses, son contrôleur perd 1 Raison.",
    equipTargetTypes: ["marin"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "onTideStateExited",
        condition: { tideState: "abysses" },
        description: "À chaque sortie des Abysses, son contrôleur perd 1 Raison.",
        effects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
    // Bug corrigé au passage : l'Équipement ne s'attachait jamais (onPlayEffects absent).
    equipGrantsBuffWhileTideStateIn: { tideStateIn: ["abysses"], healthAmount: 2 },
  },
  {
    id: "chaine-de-fer-noir",
    name: "Chaîne de Fer Noir",
    type: "equipement",
    permanent: true,
    cost: 3,
    health: 3,
    text: "Équipez une Créature. Elle gagne +1 Puissance et Garde. Si elle est détruite, perdez 1 Raison.",
    equipTargetTypes: ["creature"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 1 },
    equipGrantsKeywords: ["garde"],
    controllerReasonLossOnOwnDestruction: 1,
  },
  {
    id: "carcasse-renversee",
    name: "Carcasse Renversée",
    type: "structure",
    cost: 3,
    maxCopies: 2,
    health: 5,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete", "abysses"],
    text: "Durée : 4 tours. Visible pendant Houle, Tempête et Abysses. Tant qu'elle est visible, votre Navire ne peut pas subir plus de 4 dégâts d'une même attaque.",
    capDirectShipDamageWhileVisible: 4,
  },
  {
    id: "cloche-immergee",
    name: "Cloche Immergée",
    type: "structure",
    cost: 4,
    maxCopies: 2,
    health: 4,
    durationTurns: 5,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 5 tours. Visible pendant Tempête et Abysses. Lorsqu'elle devient visible, chaque joueur révèle une " +
      "carte aléatoire de sa main. Le joueur ayant révélé la carte au coût le plus élevé perd 1 Raison. En cas " +
      "d'égalité, personne ne perd de Raison.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        description: "Chaque joueur révèle une carte aléatoire de sa main ; le coût le plus élevé perd 1 Raison (égalité = personne).",
        effects: [{ type: "reasonLossToHigherRevealedHandCard", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "le-filet-qui-respire",
    name: "Le Filet qui Respire",
    type: "structure",
    subtype: "objet-flottant",
    cost: 3,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["houle", "abysses"],
    text:
      "Durée : 4 tours. Visible pendant Houle et Abysses. La première fois à chaque tour qu'une Créature adverse " +
      "attaque votre Navire, elle perd 1 Puissance jusqu'à la fin de ce combat.",
    reduceAttackerPowerOnDirectAttackOncePerTurn: { amount: 1, attackerCardTypes: ["creature"] },
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 06) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "le-fond-vous-regarde",
    name: "Le Fond Vous Regarde",
    type: "anomalie",
    cost: 5,
    health: 4, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 2,
    durationTurns: 2,
    text: "Pendant 2 tours, au début de chaque tour, le joueur actif choisit : perdre 1 Raison, ou infliger 1 dégât d'Ancrage à son propre Navire.",
    anomalyForceChoiceAtStartOfTurn: { reasonLossAmount: 1, anchorDamageAmount: 1 },
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "le-fond-vous-regarde-abyssal",
    name: "Le Fond Vous Regarde",
    type: "anomalie",
    variant: "abyssale",
    cost: 7,
    health: 5, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 1,
    durationTurns: 2,
    text: "Pendant 2 tours, au début de chaque tour, le joueur actif choisit : perdre 2 Raison, ou infliger 2 dégâts d'Ancrage à son propre Navire.",
    anomalyForceChoiceAtStartOfTurn: { reasonLossAmount: 2, anchorDamageAmount: 2 },
  },

  // ======================================================================
  // LOT 07 — Manipulation de Marée
  // ======================================================================
  {
    id: "regulateur-de-courant",
    name: "Régulateur de Courant",
    type: "structure",
    subtype: "objet",
    cost: 2,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle", "tempete"],
    text:
      "Durée : 3 tours. Visible pendant Calme, Houle et Tempête. Sabordage : réduisez de 1 tour la durée " +
      "restante de la Marée actuelle. Si cette réduction la fait prendre fin, passez immédiatement à la Marée " +
      "suivante.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : réduisez de 1 tour la durée restante de la Marée actuelle ; si elle prend fin, passez immédiatement à la Marée suivante.",
        // Conçu pour contourner la règle "une durée ne descend jamais sous 1" (`advanceTideOnZero`).
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 }, advanceTideOnZero: true }],
      },
    ],
  },
  {
    id: "compas-aux-aiguilles-noires",
    name: "Compas aux Aiguilles Noires",
    type: "structure",
    subtype: "objet",
    cost: 3,
    maxCopies: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete"],
    text:
      "Durée : 4 tours. Visible pendant Houle et Tempête. Sabordage : uniquement pendant Houle ou Tempête, " +
      "avancez immédiatement la Marée d'un état, puis perdez 1 Raison.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : uniquement pendant Houle ou Tempête, avancez immédiatement la Marée d'un état, puis perdez 1 Raison.",
        effects: [
          // La perte de Raison DOIT être vérifiée avant l'avancée (sinon
          // `tideForceAdvance` aurait déjà changé l'état de Marée que ce
          // second effet vérifie, faussant la condition).
          {
            type: "reasonLoss",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionTideStateIn: ["houle", "tempete"],
          },
          { type: "tideForceAdvance", target: { kind: "allPlayers" }, conditionTideStateIn: ["houle", "tempete"] },
        ],
      },
    ],
  },
  {
    id: "bouee-de-rappel",
    name: "Bouée de Rappel",
    type: "structure",
    subtype: "objet-flottant",
    cost: 3,
    maxCopies: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 4 tours. Visible pendant Tempête et Abysses. Sabordage : reculez immédiatement la Marée d'un " +
      "état. La Marée ne peut pas reculer au-delà de Calme.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : reculez immédiatement la Marée d'un état (jamais au-delà de Calme).",
        effects: [{ type: "tideForceRetreat", target: { kind: "allPlayers" } }],
      },
    ],
  },
  {
    id: "horloge-de-maree",
    name: "Horloge de Marée",
    type: "structure",
    subtype: "objet",
    cost: 2,
    maxCopies: 2,
    health: 2,
    durationTurns: 3,
    text:
      "Durée : 3 tours. Visible pendant toutes les Marées. Sabordage : choisissez soit de réduire de 2 tours " +
      "la durée actuelle, soit de l'augmenter de 1 tour.",
    // Deux capacités automatiques d'un même `choiceGroup` : au Sabordage, le
    // moteur ouvre un choix (`GameState.pendingChoice`) et le joueur désigne
    // l'option qui se résout.
    abilities: [
      {
        trigger: "onSaborde",
        choiceGroup: "horlogeChoix",
        description: "Réduire de 2 tours la durée de la Marée actuelle",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 2 } }],
      },
      {
        trigger: "onSaborde",
        choiceGroup: "horlogeChoix",
        description: "Augmenter d'1 tour la durée de la Marée actuelle",
        effects: [{ type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "sondeur-des-mauvaises-eaux",
    name: "Sondeur des Mauvaises Eaux",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 3,
    text: "Une fois par tour, vous pouvez perdre 1 Raison : réduisez de 1 tour la durée de la Marée actuelle.",
    activatableOncePerTurn: {
      cost: { reason: 1 },
      effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" } }],
    },
  },
  {
    id: "ancre-de-tempete",
    name: "Ancre de Tempête",
    type: "structure",
    cost: 3,
    maxCopies: 2,
    health: 4,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete"],
    text:
      "Durée : 4 tours. Visible pendant Houle et Tempête. Tant qu'elle est visible, la première réduction de " +
      "durée de Marée que vous provoquez chaque tour est augmentée de 1.",
    amplifyTideReductionOncePerTurnWhileVisible: 1,
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 07) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "cloche-du-grand-fond",
    name: "Cloche du Grand Fond",
    type: "structure",
    cost: 3,
    maxCopies: 2,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["abysses"],
    text:
      "Durée : 3 tours. Visible pendant Abysses. À chaque entrée en Abysses, vous pouvez perdre 2 Raison. Si vous " +
      "le faites, augmentez de 1 tour la durée des Abysses.",
    abilities: [
      {
        trigger: "onTideStateEntered",
        condition: { tideState: "abysses" },
        mode: "optional",
        cost: { reason: 2 },
        description: "Vous pouvez dépenser 2 Raison : augmentez la durée des Abysses de 1 tour.",
        effects: [{ type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "cloche-du-grand-fond-abyssal",
    name: "Cloche du Grand Fond",
    type: "structure",
    variant: "abyssale",
    cost: 4,
    maxCopies: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 4 tours. Visible pendant Tempête et Abysses. À chaque entrée en Abysses, vous pouvez perdre 2 " +
      "Raison. Si vous le faites, augmentez de 1 tour la durée des Abysses.",
    abilities: [
      {
        trigger: "onTideStateEntered",
        condition: { tideState: "abysses" },
        mode: "optional",
        cost: { reason: 2 },
        description: "Vous pouvez dépenser 2 Raison : augmentez la durée des Abysses de 1 tour.",
        effects: [{ type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 07) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "la-mer-reclame-davantage",
    name: "La Mer Réclame Davantage",
    type: "anomalie",
    cost: 5,
    health: 4, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 2,
    durationTurns: 2,
    text: "Pendant 2 tours, chaque fois qu'une Marée change, elle entre avec 1 tour de durée en moins, minimum 1.",
    anomalyReduceTideEntryDuration: { amount: 1 },
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "la-mer-reclame-davantage-abyssal",
    name: "La Mer Réclame Davantage",
    type: "anomalie",
    variant: "abyssale",
    cost: 6,
    health: 5, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 1,
    durationTurns: 2,
    text:
      "Pendant 2 tours, chaque fois qu'une Marée change, elle entre avec 1 tour de durée en moins, minimum 1. " +
      "Chaque changement de Marée inflige aussi 1 dégât d'Ancrage à chaque Navire.",
    anomalyReduceTideEntryDuration: { amount: 1, anchorDamagePerShip: 1 },
  },

  // ======================================================================
  // LOT 08 — Grandes Anomalies de Marée
  // ======================================================================
  {
    // Ancienne Grande Anomalie devenue Créature (Notion "Catalogue de cartes", Lot 08, mise à jour du 13/09) :
    // reste coûteuse et dangereuse pour son propre contrôleur, mais occupe désormais un Slot en 3/5 une fois posée.
    id: "la-gueule-sous-la-mer",
    name: "La Gueule Sous la Mer",
    type: "creature",
    cost: 6,
    maxCopies: 1,
    attack: 3,
    health: 5,
    text:
      "Lorsqu'il est posé, forcez immédiatement la Marée en Abysses. Les états intermédiaires sont ignorés. Après " +
      "résolution, votre Navire perd 2 Ancrage. Jusqu'au début de votre prochain tour, vous ne pouvez pas récupérer " +
      "de Raison.",
    onPlayEffects: [
      { type: "tideForceJumpToAbysses", target: { kind: "allPlayers" } },
      { type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
      { type: "lockReasonGainUntilNextTurn", target: { kind: "controllerPlayer" } },
    ],
  },
  {
    id: "sept-brasses-plus-bas",
    name: "Sept Brasses Plus Bas",
    type: "anomalie",
    // Résolution immédiate (onPlayEffects uniquement, aucune règle durable) : comme un Équipement consommable,
    // part directement au cimetière plutôt que d'occuper indéfiniment un Slot sans plus aucun effet (cf.
    // `isPermanentCard`).
    permanent: false,
    cost: 7,
    maxCopies: 1,
    text:
      "Forcez immédiatement la Marée en Abysses, puis augmentez de 1 tour sa durée restante. Chaque joueur perd " +
      "2 Raison. L'orientation devient Descendante après l'arrivée en Abysses.",
    onPlayEffects: [
      {
        type: "tideForceJumpToAbysses",
        target: { kind: "allPlayers" },
        amount: { kind: "flat", value: 1 },
        forceTideOrientation: "descendante",
      },
      { type: "reasonLoss", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 2 } },
    ],
  },

  // ======================================================================
  // LOT 09 — Références, clins d'œil & cartes fun
  // ======================================================================
  {
    id: "wood-vy",
    name: "Wood Vy",
    type: "marin",
    cost: 3,
    attack: 2,
    health: 4,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez perd de la Résistance, rendez-lui 1 " +
      "Résistance.",
    restoreResistanceOnAllyStructureLossOncePerTurn: 1,
  },
  {
    id: "carape-hus",
    name: "Carape Hus",
    type: "creature",
    cost: 3,
    attack: 2,
    health: 5,
    text: "Tant que la Marée est Calme, elle a Garde.",
    conditionalKeywords: [{ keyword: "garde", tideStateIn: ["calme"] }],
  },
  {
    id: "si-raie-ponce",
    name: "Si, Raie Ponce",
    type: "creature",
    cost: 4,
    attack: 3,
    health: 4,
    text:
      "À son arrivée, si la Marée est descendante, récupérez 2 Raison. Si elle est montante, l'adversaire perd " +
      "1 Raison.",
    onPlayEffects: [
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 }, conditionOrientationIs: "descendante" },
      { type: "reasonLoss", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 }, conditionOrientationIs: "montante" },
    ],
  },
  {
    id: "bat-marin",
    name: "Bat-Marin",
    type: "marin",
    cost: 3,
    attack: 3,
    health: 2,
    text:
      "Tant que la Marée est Tempête ou Abysses, il peut attaquer directement le Navire adverse même si un " +
      "permanent possède Garde.",
    bypassesGardeTideStateIn: ["tempete", "abysses"],
  },
  {
    // Corrigée : reprenait par erreur les mêmes stats/texte que la Standard (aucune plus-value réelle) —
    // le catalogue (Notion "Catalogue de cartes", Lot 09) distingue bien coût/stats et ajoute une clause.
    id: "bat-marin-abyssal",
    name: "Bat-Marin",
    type: "marin",
    variant: "abyssale",
    cost: 4,
    attack: 4,
    health: 3,
    text:
      "Tant que la Marée est Tempête ou Abysses, il peut attaquer directement le Navire adverse même si un " +
      "permanent possède Garde. Lorsqu'il inflige des dégâts directs pendant Abysses, l'adversaire perd aussi 1 Raison.",
    bypassesGardeTideStateIn: ["tempete", "abysses"],
    opponentReasonLossOnDirectAttack: { amount: 1, tideStateIn: ["abysses"] },
  },
  {
    id: "chope",
    name: "Choppe !",
    type: "objet",
    cost: 1,
    text:
      "Si la Marée est Calme, coûte 0 Raison. Brisez cet Objet : récupérez 2 Raison. Cet effet ne peut être " +
      "activé que pendant Calme.",
    costOverrideWhenTideStateIn: { tideStateIn: ["calme"], cost: 0 },
    requiresTideStateForBreak: ["calme"],
    onBreakEffects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
  },

  // ======================================================================
  // LOT 10 — Cra-Poiscail (Booster 1)
  // ======================================================================
  // Catalogue Notion "Lot 10 — paramètres d'équilibrage retenus"
  // (2026-09-14), qui fait foi sur les coûts, stats, raretés, limites de
  // deck et répartition en boosters. Les trois boosters de la famille et
  // les variantes Abyssales sont intégrés (sections ci-dessous) : les
  // primitives qui leur manquaient existent — déclencheurs d'observateur
  // (`triggeredBy`), Équipements restreints à un archétype
  // (`equipTargetArchetype`) et auras nommées (`auraBuffCardIds`).
  //
  // `setCode` les tient hors des boosters existants (cf. `CardDefinition`) :
  // le plan de diffusion veut aucun Cra-Poiscail dans le Bienvenue, et une
  // arrivée progressive en trois boosters dédiés.
  {
    id: "tetard-fesse",
    name: "Têtard-Fesse",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 1,
    attack: 1,
    health: 1,
    // Volontairement sans effet : petite unité de base de l'archétype.
  },
  {
    id: "ptite-fesse",
    name: "P'tite Fesse",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 1,
    attack: 1,
    health: 2,
  },
  {
    id: "cra-poiscail-grand-gueule",
    name: "Cra-Poiscail Grand-Gueule",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    attack: 3,
    health: 1,
  },
  {
    id: "cra-poiscail-sauteur",
    name: "Cra-Poiscail Sauteur",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    attack: 1,
    health: 1,
    text: "À son arrivée, si vous contrôlez déjà une autre unité Cra-Poiscail, invoquez 1 Péon Cra-Poiscail 1 / 1.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        // "un AUTRE Cra-Poiscail" : le Sauteur est déjà sur le plateau quand
        // son effet d'arrivée se résout, il ne doit pas se compter lui-même.
        conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 1, excludeSelf: true },
      },
    ],
  },
  {
    id: "banc-de-cra-poiscail",
    name: "Banc de Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 3,
    attack: 2,
    health: 3,
    text: "Tant que vous contrôlez au moins 3 autres unités Cra-Poiscail, il gagne +1 Puissance.",
    selfBuffWhileControllingArchetype: {
      archetype: "cra-poiscail",
      atLeast: 3,
      excludeSelf: true,
      attackAmount: 1,
    },
  },
  {
    id: "le-seau",
    name: "Le Seau",
    type: "objet",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    // Le catalogue laisse la Résistance vide pour les Objets, mais un
    // permanent à 0 meurt dès le `processDeaths` qui suit sa pose (0 dégât
    // marqué >= 0 Résistance) : il ne pourrait jamais être Brisé plus tard.
    // 1, comme tous les autres Objets du set (Thermos, Choppe !, Levier de
    // Lest, Grappin, Cartes des Courants).
    text:
      "Brisez cet Objet : invoquez 1 Péon Cra-Poiscail 1 / 1. S'il a été Brisé directement depuis votre main et que " +
      "vous contrôlez déjà une unité Cra-Poiscail, invoquez-en 2 à la place.",
    // ORDRE IMPORTANT : le Péon supplémentaire est évalué AVANT l'invocation
    // de base. Dans l'autre sens, le Péon que la base vient de créer
    // satisferait lui-même la condition "vous contrôlez déjà un
    // Cra-Poiscail" et la carte invoquerait toujours 2 corps.
    onBreakEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        conditionBrokenFromHand: true,
        conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 1 },
      },
      { type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail" },
    ],
  },
  {
    id: "la-flaque-sacree",
    name: "La Flaque Sacrée",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    health: 3,
    durationTurns: 3,
    text:
      "Durée : 3 tours. La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez arrive en " +
      "jeu, cette unité gagne +1 Résistance jusqu'à votre prochain tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        // Elle-même est un Cra-Poiscail, mais une Structure n'"arrive" pas
        // pour se renforcer elle-même : `excludeSelf` par défaut suffit.
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "flaqueAllyEnter",
        description: "Un Cra-Poiscail arrive : il gagne +1 Résistance.",
        effects: [
          {
            type: "buff",
            target: { kind: "triggerSource" },
            healthAmount: { kind: "flat", value: 1 },
            duration: "untilYourNextTurn",
          },
        ],
      },
    ],
  },
  {
    id: "fesses-en-avant",
    name: "Fesses en Avant !",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    // Résolution immédiate : part au cimetière sans occuper durablement un
    // Slot (même traitement que les Grandes Anomalies du Lot 08).
    permanent: false,
    cost: 3,
    text: "Invoquez 2 Péons Cra-Poiscail 1 / 1. Ils gagnent Pied marin jusqu'à la fin du tour.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        count: 2,
        // "Pied marin" sur un corps qui vient d'arriver revient exactement
        // à le priver de son mal d'invocation.
        rush: true,
      },
    ],
  },

  // ======================================================================
  // LOT 10 — Cra-Poiscail (Booster 2)
  // ======================================================================
  // "Ouvre les variantes Bris / Marée / value" (Notion, Répartition
  // Booster du Lot 10).
  {
    id: "cra-poiscail-bavard",
    name: "Cra-Poiscail Bavard",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 1,
    health: 3,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez arrive en jeu, cette unité " +
      "gagne +1 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "bavardAllyEnter",
        description: "Un autre Cra-Poiscail arrive : il gagne +1 Puissance jusqu'à la fin du tour.",
        // "il gagne" = le Cra-Poiscail QUI ARRIVE, pas le Bavard — même
        // lecture que La Flaque Sacrée, dont le texte a la même forme.
        // Le mot "celui-ci" lève l'ambiguïté sur la carte imprimée.
        effects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "cra-poiscail-chef-de-banc",
    name: "Cra-Poiscail Chef de Banc",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 3,
    attack: 2,
    health: 3,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez arrive en jeu, " +
      "Cra-Poiscail Chef de Banc gagne +1 / +1 jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "chefDeBancAllyEnter",
        description: "Un autre Cra-Poiscail arrive : il gagne +1 / +1 jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            // Comme le Bavard : c'est l'arrivant qui est renforcé.
            target: { kind: "triggerSource" },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
            permanent: false,
          },
        ],
      },
    ],
  },
  {
    id: "cra-poiscail-ramasseur",
    name: "Cra-Poiscail Ramasseur",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 2,
    health: 2,
    text: "La première fois à chaque tour que vous Brisez un Objet, il gagne +1 / +1 jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onObjectBroken",
        // Filtre vide : n'importe quel Objet, du moment que c'est SON
        // contrôleur qui le brise (`sameController` par défaut).
        triggeredBy: {},
        oncePerTurnKey: "ramasseurObjectBroken",
        description: "Vous Brisez un Objet : +1 / +1 jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
            permanent: false,
          },
        ],
      },
    ],
  },
  {
    id: "cra-poiscail-des-bas-fonds",
    name: "Cra-Poiscail des Bas-Fonds",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 2,
    health: 2,
    text: "Tant que la Marée est descendante, il gagne +1 Puissance.",
    selfBuffWhileTideOrientation: { orientation: "descendante", attackAmount: 1 },
  },
  {
    id: "cra-poiscail-des-hautes-eaux",
    name: "Cra-Poiscail des Hautes-Eaux",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 1,
    health: 3,
    text: "Tant que la Marée est montante, il gagne +1 Puissance.",
    selfBuffWhileTideOrientation: { orientation: "montante", attackAmount: 1 },
  },
  {
    id: "slip-de-guerre-cra-poiscail",
    name: "Slip de Guerre Cra-Poiscail",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    permanent: true,
    cost: 2,
    health: 2,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Résistance. La première fois à chaque tour qu'une autre unité " +
      "Cra-Poiscail que vous contrôlez arrive en jeu, le porteur gagne +1 Puissance jusqu'à la fin du tour.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "slipAllyEnter",
        description: "Un autre Cra-Poiscail arrive : le porteur gagne +1 Puissance jusqu'à la fin du tour.",
        effects: [{ type: "buff", target: { kind: "equippedUnit" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "casque-coquille",
    name: "Casque-Coquille",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    permanent: true,
    cost: 2,
    health: 1,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Résistance. La première fois qu'il devrait subir des dégâts d'un " +
      "effet, réduisez ces dégâts de 1 puis détruisez cet Équipement.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    // "Dégâts d'un effet" = la Marée et le texte d'une carte, jamais le
    // combat (arbitrage du 2026-09-14). Le porteur garde le +1 Résistance
    // après la destruction du Casque : convention du moteur pour tout
    // Équipement qui quitte le plateau, pas une exception d'ici.
    reduceEquippedEffectDamageThenDestroy: 1,
  },
  {
    id: "le-tas-de-trucs",
    name: "Le Tas de Trucs",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    health: 3,
    text:
      "La première fois à chaque tour que vous Brisez un Objet, vous pouvez choisir une unité Cra-Poiscail que vous " +
      "contrôlez : elle gagne +1 / +1 jusqu'à la fin du tour.",
    // "Choisissez" passe par une fenêtre de réaction (`mode: "optional"`),
    // seul mécanisme du moteur qui laisse le joueur DÉSIGNER sa cible.
    // Écart assumé (arbitrage du 2026-09-14) : l'effet devient refusable,
    // ce que le design accepte — « si on peut choisir quelque chose on le
    // fait, et faut nous laisser cibler ». La fenêtre ne s'ouvre de toute
    // façon que s'il existe un Cra-Poiscail à renforcer.
    abilities: [
      {
        trigger: "onObjectBroken",
        // Filtre vide, comme le Cra-Poiscail Ramasseur : n'importe quel
        // Objet, du moment que c'est SON contrôleur qui le brise
        // (`sameController` par défaut). L'Objet brisé a déjà quitté le
        // plateau quand l'événement part : seul ce chemin d'observateur
        // voit le Bris.
        triggeredBy: {},
        mode: "optional",
        oncePerTurnKey: "tasDeTrucsBreak",
        description: "Choisissez un Cra-Poiscail : il gagne +1 / +1 jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { archetype: "cra-poiscail" } },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "le-trone-de-bouchon",
    name: "Le Trône de Bouchon",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 3,
    health: 4,
    maxCopies: 2,
    text: "Tant que vous contrôlez au moins 3 unités Cra-Poiscail, vos unités Cra-Poiscail gagnent +1 Puissance.",
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1, requiresArchetypeCountAtLeast: 3 },
  },
  {
    id: "la-grande-migration",
    name: "La Grande Migration",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 4,
    // Résistance absente du cadrage Notion pour les Anomalies, comme pour
    // "Quelque Chose Sous la Coque" : fixée par cohérence avec les
    // permanents de coût comparable plutôt que laissée à 0, ce qui la
    // ferait mourir au premier `processDeaths`.
    health: 3,
    maxCopies: 2,
    durationTurns: 2,
    text:
      "Pendant 2 tours, la première fois à chaque tour qu'une unité Cra-Poiscail que vous contrôlez est détruite, " +
      "invoquez 1 Péon Cra-Poiscail 1 / 1.",
    // « un Cra-Poiscail » sans « autre » : elle compte aussi sa propre
    // destruction (décision du 17/09/2026).
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { archetype: "cra-poiscail", excludeSelf: false },
        oncePerTurnKey: "grandeMigrationAllyDeath",
        description: "Un de vos Cra-Poiscail est détruit : invoquez 1 Péon Cra-Poiscail.",
        effects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail" }],
      },
    ],
  },

  // ======================================================================
  // LOT 10 — Cra-Poiscail (Booster 3) + variantes Abyssales
  // ======================================================================
  // Branche pseudo-médiévale (Chevalier / Destrier / Bourreau) et finishers.
  {
    id: "ecuyer-cra-poiscail",
    name: "Écuyer Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 2,
    attack: 1,
    health: 3,
    text: "Votre Chevalier Cra-Poiscail gagne +1 Résistance tant que l'Écuyer est en jeu.",
    auraBuffCardIds: { cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"], healthAmount: 1 },
  },
  {
    id: "chevalier-cra-poiscail",
    name: "Chevalier Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 3,
    health: 3,
    maxCopies: 2,
    text: "Tant que vous contrôlez un Destrier du Grand Étang, il gagne +1 Puissance et Garde.",
    selfBuffWhileControllingCardIds: { cardIds: ["destrier-du-grand-etang"], attackAmount: 1 },
    conditionalKeywords: [{ keyword: "garde", controllingCardIds: ["destrier-du-grand-etang"] }],
  },
  {
    id: "destrier-du-grand-etang",
    name: "Destrier du Grand Étang",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 2,
    attack: 2,
    health: 3,
    text: "Tant qu'il est en jeu, votre Chevalier Cra-Poiscail gagne +1 Résistance.",
    auraBuffCardIds: { cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"], healthAmount: 1 },
  },
  {
    id: "bourreau-cra-poiscail",
    name: "Bourreau Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 3,
    health: 2,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez est détruite, il gagne +1 " +
      "Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "bourreauAllyDeath",
        description: "Un autre Cra-Poiscail est détruit : +1 Puissance jusqu'à la fin du tour.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "cra-poiscail-porte-etendard",
    name: "Cra-Poiscail Porte-Étendard",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 1,
    health: 4,
    maxCopies: 2,
    text: "Vos autres unités Cra-Poiscail gagnent +1 Puissance.",
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1 },
  },
  {
    id: "roi-cra-poiscail",
    name: "Roi Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 5,
    attack: 4,
    health: 5,
    maxCopies: 1,
    text:
      "À son arrivée, si vous contrôlez déjà au moins 2 autres unités Cra-Poiscail, invoquez 2 Péons Cra-Poiscail 1 " +
      "/ 1. Vos autres unités Cra-Poiscail gagnent +1 Puissance.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        count: 2,
        conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 2, excludeSelf: true },
      },
    ],
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1 },
  },
  {
    id: "ptite-fesse-grand-reve",
    name: "P'tite Fesse, Grand Rêve",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 2,
    attack: 1,
    health: 2,
    maxCopies: 2,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez gagne de la Puissance, " +
      "P'tite Fesse, Grand Rêve gagne +1 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onPowerGained",
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "grandReveAllyPowerGain",
        description: "Un autre Cra-Poiscail gagne de la Puissance : +1 Puissance jusqu'à la fin du tour.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "fourchette-du-grand-etang",
    name: "Fourchette du Grand Étang",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: true,
    cost: 2,
    health: 2,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Puissance. La première fois à chaque tour qu'il attaque, vous " +
      "pouvez choisir une autre unité Cra-Poiscail que vous contrôlez : elle gagne +1 Puissance jusqu'à la fin du " +
      "tour.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 1 },
    // « un autre Cra-Poiscail » est DÉSIGNÉ par le joueur, en fenêtre de
    // réaction (décision du 17/09/2026 : le moteur ne choisit jamais une
    // cible à sa place, et le joueur peut refuser). `equippedUnit` fait
    // suivre le porteur : c'est LUI qui attaque, et c'est lui que « un
    // autre » exclut, avec l'Équipement lui-même.
    abilities: [
      {
        trigger: "onAttack",
        mode: "optional",
        triggeredBy: { equippedUnit: true },
        oncePerTurnKey: "fourchetteBearerAttack",
        description: "Un autre Cra-Poiscail gagne +1 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { archetype: "cra-poiscail", excludeSource: true } },
            attackAmount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "banniere-en-vieille-chaussette",
    name: "Bannière en Vieille Chaussette",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: true,
    cost: 3,
    health: 2,
    maxCopies: 2,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Résistance. La première fois à chaque tour que vous invoquez une " +
      "unité Cra-Poiscail, cette unité gagne +1 Puissance jusqu'à la fin du tour.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    abilities: [
      {
        trigger: "onEnterPlay",
        // "que vous INVOQUEZ" : une carte posée depuis la main ne compte pas.
        triggeredBy: { archetype: "cra-poiscail", onlySummoned: true },
        oncePerTurnKey: "banniereSummon",
        description: "Vous invoquez un Cra-Poiscail : il gagne +1 Puissance jusqu'à la fin du tour.",
        effects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "la-quete-du-grand-nenuphar",
    name: "La Quête du Grand Nénuphar",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    health: 4,
    maxCopies: 2,
    durationTurns: 4,
    text:
      "Durée : 4 tours. La première fois à chaque tour que votre Chevalier Cra-Poiscail attaque alors que vous " +
      "contrôlez un Destrier du Grand Étang, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onAttack",
        triggeredBy: { cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"] },
        oncePerTurnKey: "queteChevalierAttack",
        // Condition AU NIVEAU de la capacité : une attaque sans Destrier ne
        // doit pas consommer le « une fois par tour ».
        condition: { controlsAnyCardIds: ["destrier-du-grand-etang"] },
        description: "Votre Chevalier attaque avec son Destrier : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "le-grand-saut",
    name: "Le Grand Saut",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: false,
    cost: 5,
    maxCopies: 1,
    text: "Invoquez 3 Péons Cra-Poiscail 1 / 1. Ils gagnent +1 Puissance et Pied marin jusqu'à la fin du tour.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        count: 3,
        rush: true,
        summonBuff: { attackAmount: 1 },
      },
    ],
  },
  {
    id: "le-tournoi-du-grand-etang",
    name: "Le Tournoi du Grand Étang",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: false,
    cost: 4,
    maxCopies: 2,
    text:
      "Jusqu'à la fin du tour, vos Chevalier Cra-Poiscail, Destrier du Grand Étang et Bourreau Cra-Poiscail " +
      "gagnent +1 / +1. Si vous contrôlez les trois à la résolution, piochez 1 carte.",
    onPlayEffects: [
      {
        type: "buff",
        target: {
          kind: "allyUnitsWithCardIds",
          cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal", "destrier-du-grand-etang", "bourreau-cra-poiscail"],
        },
        attackAmount: { kind: "flat", value: 1 },
        healthAmount: { kind: "flat", value: 1 },
        permanent: false,
      },
      {
        type: "draw",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        // « les trois » : le Chevalier peut être l'une ou l'autre version.
        conditionControlsAllCardIds: [
          ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"],
          "destrier-du-grand-etang",
          "bourreau-cra-poiscail",
        ],
      },
    ],
  },
  {
    id: "roi-cra-poiscail-abyssal",
    name: "Roi Cra-Poiscail",
    type: "creature",
    variant: "abyssale",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 6,
    attack: 5,
    health: 7,
    maxCopies: 1,
    text:
      "À son arrivée, invoquez 2 Péons Cra-Poiscail 1 / 1. Vos autres unités Cra-Poiscail gagnent +1 / +1. La " +
      "première fois à chaque tour qu'une unité Péon Cra-Poiscail arrive en jeu sous votre contrôle, vous perdez 1 " +
      "Raison.",
    onPlayEffects: [
      { type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail", count: 2 },
    ],
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1, healthAmount: 1 },
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { cardIds: ["peon-cra-poiscail"] },
        oncePerTurnKey: "roiAbyssalPeonEnter",
        description: "Un Péon arrive sous votre contrôle : vous perdez 1 Raison.",
        effects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "ptite-fesse-grand-reve-abyssal",
    name: "P'tite Fesse, Grand Rêve",
    type: "creature",
    variant: "abyssale",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 2,
    health: 3,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez gagne de la Puissance, " +
      "P'tite Fesse, Grand Rêve gagne +2 Puissance et Pied marin jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onPowerGained",
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "grandReveAbyssalAllyPowerGain",
        description: "Un autre Cra-Poiscail gagne de la Puissance : +2 Puissance et Pied marin jusqu'à la fin du tour.",
        // Pied marin = peut attaquer dès le tour de son arrivée (`KEYWORD_PIED_MARIN`).
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 2 }, grantKeywords: ["pied-marin"] }],
      },
    ],
  },
  {
    id: "chevalier-cra-poiscail-abyssal",
    name: "Chevalier Cra-Poiscail",
    type: "creature",
    variant: "abyssale",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 4,
    attack: 4,
    health: 5,
    maxCopies: 1,
    text:
      "Tant que vous contrôlez un Destrier du Grand Étang, il gagne Garde et +1 Puissance. La première fois à " +
      "chaque tour qu'il attaque, vous pouvez choisir une autre unité Cra-Poiscail que vous contrôlez : elle gagne " +
      "+1 / +1 jusqu'à la fin du tour.",
    selfBuffWhileControllingCardIds: { cardIds: ["destrier-du-grand-etang"], attackAmount: 1 },
    conditionalKeywords: [{ keyword: "garde", controllingCardIds: ["destrier-du-grand-etang"] }],
    // Seconde phrase : même règle que la Fourchette du Grand Étang — la
    // cible est désignée par le joueur en fenêtre de réaction. Déclencheur
    // PERSONNEL ici : c'est le Chevalier lui-même qui attaque, et
    // `excludeSource` l'écarte de ses propres cibles.
    abilities: [
      {
        trigger: "onAttack",
        mode: "optional",
        oncePerTurnKey: "chevalierAbyssalAttack",
        description: "Un autre Cra-Poiscail gagne +1 / +1 jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { archetype: "cra-poiscail", excludeSource: true } },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  // ======================================================================
  // LOT 11 — LES MASQUES NOYÉS / THÉÂTRE ENGLOUTI
  // ======================================================================
  // Source : Notion « Lot 11 — Les Masques Noyés / Théâtre Englouti »,
  // passe d'équilibrage du 15 septembre 2026.
  //
  // Mini-archétype de SOUS-TYPE, pas d'`archetype` au sens
  // `game/cards/archetypes.ts` : la troupe se reconnaît au sous-type
  // `MARIONNETTE`, et les effets de dénombrement d'archétype (seuils
  // Cra-Poiscail) ne doivent pas s'y appliquer.
  //
  // Boucle : jouer une Marionnette → profiter de son arrivée → la renvoyer
  // en main → la rejouer. Toutes les répétitions, réductions et
  // remboursements sont limités à la première fois par tour ; aucune
  // réduction ne descend sous 1 Raison (plancher tenu par
  // `MIN_DISCOUNTED_COST`, cf. `game/actions/playCard.ts`).
  {
    id: "pulcinella-gonfle",
    name: "Pulcinella Gonflé",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    attack: 2,
    health: 3,
    maxCopies: 3,
    text: "Quand il est détruit, vous pouvez choisir une Créature adverse : infligez-lui 1 dégât.",
    abilities: [
      {
        trigger: "onDeath",
        mode: "optional",
        description: "Détruit : 1 dégât à une créature ennemie.",
        // La cible est désignée par le joueur, depuis le cimetière : Pulcinella
        // est déjà mort quand la fenêtre s'ouvre.
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
    id: "arlecchino-des-profondeurs",
    name: "Arlecchino des Profondeurs",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    attack: 2,
    health: 2,
    maxCopies: 3,
    text:
      "À son arrivée, vous pouvez renvoyer une autre unité Marionnette que vous contrôlez dans votre main. Si vous " +
      "le faites, il gagne +2 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Renvoyez une autre Marionnette alliée en main : il gagne +2 Puissance jusqu'à la fin du tour.",
        effects: [
          { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, excludeSource: true } } },
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 2 }, permanent: false },
        ],
      },
    ],
  },
  {
    id: "le-masque-fendu",
    name: "Le Masque Fendu",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    maxCopies: 3,
    text:
      "Brisez cet Objet : renvoyez une unité Marionnette que vous contrôlez dans votre main, puis piochez 1 carte " +
      "et défaussez 1 carte.",
    onBreakEffects: [
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE } } },
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "colombina-aux-cent-visages",
    name: "Colombina aux Cent Visages",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    attack: 3,
    health: 3,
    maxCopies: 2,
    text:
      "À son arrivée, choisissez une autre unité Marionnette que vous contrôlez : répétez son effet d'arrivée. Une " +
      "seule fois par tour.",
    // « Choisissez » : c'est le joueur qui désigne la Marionnette, via la
    // fenêtre de réaction. La répétition rallume l'arrivée de la cible
    // (`ENTER_EFFECTS_REPEATED`) : ses capacités automatiques se résolvent,
    // ses capacités facultatives (Il Dottore, Arlecchino) se reproposent.
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        oncePerTurnKey: "colombinaRepeat",
        description: "Répète l'effet d'arrivée d'une autre Marionnette alliée.",
        effects: [
          { type: "repeatEnterEffects", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, excludeSource: true } } },
        ],
      },
    ],
  },
  {
    id: "pantalone-sans-sou",
    name: "Pantalone Sans-Sou",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 3,
    text: "La première fois à chaque tour que vous Brisez un Objet directement depuis votre main, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onObjectBroken",
        // Observateur : l'événement vise l'Objet brisé, jamais Pantalone —
        // sans ce filtre la capacité n'est collectée par aucun circuit.
        triggeredBy: {},
        oncePerTurnKey: "pantaloneHandBreak",
        description: "Premier Bris depuis la main du tour : récupérez 1 Raison.",
        // Le remboursement ne vaut QUE pour un Bris depuis la main : sinon
        // les Objets déjà posés sur le board deviendraient gratuits.
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionBrokenFromHand: true }],
      },
    ],
  },
  {
    id: "il-capitano-naufrage",
    name: "Il Capitano Naufragé",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    attack: 6,
    health: 6,
    maxCopies: 2,
    text: "La première fois qu'il subit des dégâts de combat, il perd 3 Puissance et 2 Résistance.",
    abilities: [
      {
        trigger: "onDamaged",
        oncePerTurnKey: "capitanoDeflated",
        onceEver: true,
        description: "Première blessure : -3 Puissance et -2 Résistance, définitivement.",
        // Volontairement sur-staté avant sa première blessure ; après
        // déclenchement il devient 3 / 4, cohérent avec son fanfaron.
        effects: [
          {
            type: "debuff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 3 },
            healthAmount: { kind: "flat", value: 2 },
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "il-dottore-des-noyes",
    name: "Il Dottore des Noyés",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 2,
    text:
      "À son arrivée, choisissez : une unité que vous contrôlez gagne +2 / +2 jusqu'à votre prochain tour ; ou une " +
      "unité adverse perd 2 Puissance et 2 Résistance jusqu'à votre prochain tour.",
    // Les DEUX modes sont deux capacités facultatives distinctes, proposées
    // ensemble dans la fenêtre de réaction ; elles forment un groupe de
    // choix : en activer une écarte l'autre (`choiceGroup`, pas une clé
    // « une fois par tour » — Colombina doit pouvoir rejouer le choix dans
    // le même tour). Chaque cible est filtrée par son camp — sans quoi le
    // « +2 / +2 » se posait sur une créature ENNEMIE (constaté le 2026-09-16).
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        choiceGroup: "dottoreArrival",
        description: "Une créature alliée gagne +2 / +2 jusqu'à votre prochain tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { unitsOnly: true } },
            attackAmount: { kind: "flat", value: 2 },
            healthAmount: { kind: "flat", value: 2 },
            duration: "untilYourNextTurn",
          },
        ],
      },
      {
        trigger: "onEnterPlay",
        mode: "optional",
        choiceGroup: "dottoreArrival",
        description: "Une créature ennemie perd 2 / 2 jusqu'à votre prochain tour.",
        effects: [
          {
            type: "debuff",
            target: { kind: "chosenUnit", among: { unitsOnly: true, opponentOnly: true } },
            // Un `debuff` RETIRE ses montants : 2 et 2, pas -2 et -2.
            attackAmount: { kind: "flat", value: 2 },
            healthAmount: { kind: "flat", value: 2 },
            duration: "untilYourNextTurn",
          },
        ],
      },
    ],
  },
  {
    id: "le-regisseur-sans-visage",
    name: "Le Régisseur Sans Visage",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 5,
    attack: 4,
    health: 6,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez arrive en jeu, vous pouvez " +
      "renvoyer une autre unité Marionnette que vous contrôlez de coût 2 ou moins dans votre main. Si vous le " +
      "faites, la prochaine unité Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { subtype: MARIONNETTE },
        oncePerTurnKey: "regisseurRecall",
        mode: "optional",
        description: "Renvoyez une Marionnette de coût 2 ou moins en main : elle coûte 1 de moins à rejouer ce tour.",
        // Le plafond de coût 2 empêche les boucles de valeur avec Colombina
        // ou Il Dottore (audit du 15 septembre).
        effects: [
          {
            type: "moveZone",
            toZone: "hand",
            target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, excludeSource: true, maxCost: 2 } },
          },
          { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE } },
        ],
      },
    ],
  },
  {
    id: "la-clochette-du-rappel",
    name: "La Clochette du Rappel",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    maxCopies: 3,
    text:
      "Brisez cet Objet : renvoyez une carte Marionnette que vous contrôlez dans votre main. La prochaine carte " +
      "Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    onBreakEffects: [
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE } } },
      { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE } },
    ],
  },
  {
    id: "le-theatre-englouti",
    name: "Le Théâtre Englouti",
    type: "structure",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    health: 4,
    durationTurns: 4,
    maxCopies: 1,
    text:
      "Durée : 4 tours. La première fois à chaque tour qu'une unité Marionnette que vous contrôlez revient dans " +
      "votre main, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE, excludeSelf: false },
        oncePerTurnKey: "theatreRecall",
        description: "Première Marionnette revenue en main du tour : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
    // Décision du 2026-09-16 : l'effet se limite à cette phrase (la clause
    // « 3 Marionnettes de noms différents » du lot initial est abandonnée).
  },
  {
    id: "les-coulisses-inondees",
    name: "Les Coulisses Inondées",
    type: "structure",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    health: 3,
    durationTurns: 3,
    maxCopies: 3,
    text:
      "Durée : 3 tours. La première fois à chaque tour qu'une carte Marionnette que vous contrôlez revient dans " +
      "votre main, la prochaine carte Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE, excludeSelf: false },
        oncePerTurnKey: "coulissesRecall",
        description: "Première Marionnette revenue en main du tour : elle coûte 1 de moins à rejouer ce tour.",
        effects: [
          { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE } },
        ],
      },
    ],
  },
  {
    id: "changement-de-role",
    name: "Changement de rôle !",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    maxCopies: 3,
    text:
      "Brisez cet Objet : renvoyez une unité Marionnette que vous contrôlez dans votre main. La prochaine unité " +
      "Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    // Réduction abaissée de 2 à 1 par l'audit : Brisé depuis la main, il ne
    // doit pas transformer un retour défensif en accélération explosive.
    onBreakEffects: [
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE } } },
      { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE } },
    ],
  },
  {
    id: "rappel-du-public",
    name: "Rappel du Public",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    maxCopies: 3,
    text: "Brisez cet Objet : choisissez une carte Marionnette dans votre Cimetière. Remettez-la dans votre main.",
    // Décision du 2026-09-16 : pas de réduction conditionnelle, le Bris
    // récupère simplement une Marionnette du Cimetière.
    onBreakEffects: [
      { type: "moveGraveyardCardToHand", target: { kind: "controllerPlayer" }, filter: { subtype: MARIONNETTE } },
    ],
  },
  {
    id: "le-rideau-se-leve",
    name: "Le Rideau se Lève",
    type: "anomalie",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 5,
    health: 3,
    durationTurns: 2,
    maxCopies: 1,
    text:
      "Pendant 2 tours, la première carte Marionnette que vous jouez à chacun de vos tours déclenche une seconde " +
      "fois son effet d'arrivée.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { subtype: MARIONNETTE, excludeSelf: false },
        oncePerTurnKey: "rideauEncore",
        description: "Première Marionnette du tour : son effet d'arrivée se déclenche une seconde fois.",
        effects: [{ type: "repeatEnterEffects", target: { kind: "triggerSource" } }],
      },
    ],
  },

  // --- Variantes ABYSSALES du Lot 11 ------------------------------------
  {
    id: "arlecchino-celui-derriere-le-masque-abyssal",
    name: "Arlecchino, Celui derrière le Masque",
    type: "creature",
    subtype: MARIONNETTE,
    variant: "abyssale",
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    attack: 4,
    health: 4,
    maxCopies: 1,
    text:
      "À son arrivée, vous pouvez renvoyer une autre unité Marionnette que vous contrôlez dans votre main. Si vous " +
      "le faites, il gagne +2 / +2 jusqu'à votre prochain tour et la prochaine carte Marionnette que vous jouez ce " +
      "tour coûte 2 de moins, minimum 1.",
    // Décision du 2026-09-16 : la clause « le laisser en jeu » du lot initial
    // est abandonnée ; le renvoi lui donne +2 / +2, sans condition.
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Renvoyez une autre Marionnette alliée en main : il gagne +2 / +2 et la prochaine coûte 2 de moins ce tour.",
        effects: [
          { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, excludeSource: true } } },
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 2 },
            healthAmount: { kind: "flat", value: 2 },
            duration: "untilYourNextTurn",
          },
          { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 }, filter: { subtype: MARIONNETTE } },
        ],
      },
    ],
  },
  {
    id: "le-regisseur-des-profondeurs-abyssal",
    name: "Le Régisseur des Profondeurs",
    type: "creature",
    subtype: MARIONNETTE,
    variant: "abyssale",
    setCode: THEATRE_ENGLOUTI,
    cost: 7,
    attack: 6,
    health: 8,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez arrive en jeu, répétez son " +
      "effet d'arrivée. La première fois à chaque tour qu'une unité Marionnette que vous contrôlez revient dans " +
      "votre main, la prochaine unité Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { subtype: MARIONNETTE },
        oncePerTurnKey: "regisseurAbyssalEcho",
        description: "Première autre Marionnette du tour : son effet d'arrivée se répète.",
        effects: [{ type: "repeatEnterEffects", target: { kind: "triggerSource" } }],
      },
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE, excludeSelf: false },
        oncePerTurnKey: "regisseurAbyssalRecall",
        description: "Première Marionnette revenue en main du tour : la prochaine coûte 1 de moins.",
        effects: [
          { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE } },
        ],
      },
    ],
  },
  // ======================================================================
  // Lot 12 — Rapiécer la Coque (Notion « Catalogue de cartes », 18/09/2026)
  //
  // Lot TRANSVERSAL de consolidation : pioche et filtrage, récupération
  // d'Ancrage, Garde, Pied marin, volatiles, et renforts ciblés des familles
  // existantes (Cra-Poiscail, Marionnettes). Aucun nouveau mot-clé, et aucune
  // primitive nouvelle en dehors de `condition.controllerHandAtLeast` — tout
  // le reste se dit avec ce que le moteur portait déjà.
  //
  // Le « piochez puis défaussez » du lot s'appuie sur l'effet `discard`
  // existant, qui prend en TÊTE de main : le texte ne dit jamais « de votre
  // choix », et c'est déjà ainsi que Le Masque Fendu se comporte.
  // ======================================================================
  {
    id: "mousse-des-quarts",
    name: "Mousse des Quarts",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    attack: 1,
    health: 2,
    text: "À son arrivée, piochez 1 carte puis défaussez 1 carte.",
    onPlayEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    // `condition.controllerHandAtLeast` plutôt qu'une condition par effet :
    // la défausse précède la pioche, donc une condition posée sur la pioche
    // lirait une main déjà amputée et le texte casserait pile au seuil.
    id: "gabier-au-carnet-mouille",
    name: "Gabier au Carnet Mouillé",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 2,
    health: 2,
    text: "À son arrivée, si vous avez au moins 4 cartes en main, défaussez 1 carte puis piochez 1 carte.",
    abilities: [
      {
        trigger: "onEnterPlay",
        condition: { controllerHandAtLeast: 4 },
        description: "À son arrivée, avec 4 cartes en main ou plus : défaussez 1 carte puis piochez 1 carte.",
        effects: [
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "quartier-maitre-des-vivres",
    name: "Quartier-maître des Vivres",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text: "À votre début de tour, si vous avez au moins 5 cartes en main, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "startOfTurn",
        condition: { controllerHandAtLeast: 5 },
        description: "Début de tour, main de 5 cartes ou plus : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "charpentiere-de-veille",
    name: "Charpentière de Veille",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 1,
    health: 3,
    maxCopies: 2,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, récupérez " +
      "1 Ancrage.",
    abilities: [
      {
        // Un Sabordage émet TOUJOURS `onDeath` en plus de `onSaborde` : un
        // seul déclencheur couvre les deux cas du texte.
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["structure"] },
        oncePerTurnKey: "charpentiereAncrage",
        description: "Une de vos Structures part : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "chirurgien-de-coque",
    name: "Chirurgien de Coque",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 3,
    text: "À son arrivée, récupérez 1 Ancrage. Si vous avez 0 Raison ou moins, récupérez également 1 Raison.",
    onPlayEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionControllerReasonAtMost: 0,
      },
    ],
  },
  {
    id: "capitaine-du-dernier-retour",
    name: "Capitaine du Dernier Retour",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 2,
    text: "À la fin de votre tour, si vous avez 3 Raison ou moins, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de tour en Raison basse : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          {
            type: "draw",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 3,
          },
          {
            type: "discard",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 3,
          },
        ],
      },
    ],
  },
  {
    id: "journal-de-bord-detrempe",
    name: "Journal de Bord Détrempé",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    maxCopies: 2,
    text: "Brisez cet Objet : piochez 2 cartes puis défaussez 1 carte.",
    onBreakEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "pansements-de-coque",
    name: "Pansements de Coque",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    text: "Brisez cet Objet : récupérez 1 Ancrage. Si vous avez 0 Raison ou moins, récupérez également 2 Raison.",
    onBreakEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 2 },
        conditionControllerReasonAtMost: 0,
      },
    ],
  },
  {
    id: "caisse-de-pieces-seches",
    name: "Caisse de Pièces Sèches",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    text: "Brisez cet Objet : récupérez 2 Ancrage puis perdez 1 Raison.",
    onBreakEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
      { type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "rations-du-matin-gris",
    name: "Rations du Matin Gris",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    text: "Brisez cet Objet : piochez 1 carte puis défaussez 1 carte. Si vous avez 3 Raison ou moins, récupérez 1 Raison.",
    onBreakEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionControllerReasonAtMost: 3,
      },
    ],
  },
  {
    id: "derniere-planche",
    name: "Dernière Planche",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    maxCopies: 2,
    requiresTideStateForBreak: ["tempete", "abysses"],
    text: "Brisable seulement pendant Tempête ou Abysses. Brisez cet Objet : récupérez 3 Ancrage.",
    onBreakEffects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 3 } }],
  },
  {
    id: "lettre-jamais-ouverte",
    name: "Lettre Jamais Ouverte",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    text: "Brisez cet Objet : piochez 1 carte. Pendant Abysses, piochez 1 carte supplémentaire puis défaussez 1 carte.",
    onBreakEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "draw",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionTideStateIn: ["abysses"],
      },
      {
        type: "discard",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionTideStateIn: ["abysses"],
      },
    ],
  },
  {
    id: "atelier-de-calfatage",
    name: "Atelier de Calfatage",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 4,
    maxCopies: 2,
    text:
      "Durée : 4 tours. La première fois à chaque tour qu'une autre Structure que vous contrôlez est Sabordée, " +
      "récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onSaborde",
        triggeredBy: { cardTypes: ["structure"], excludeSelf: true },
        oncePerTurnKey: "atelierAncrage",
        description: "Une autre de vos Structures est Sabordée : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "infirmerie-de-pont",
    name: "Infirmerie de Pont",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 3,
    maxCopies: 2,
    text: "Durée : 3 tours. À la fin de votre tour, si vous avez 3 Raison ou moins, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de tour en Raison basse : récupérez 1 Ancrage.",
        effects: [
          {
            type: "heal",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 3,
          },
        ],
      },
    ],
  },
  {
    id: "bibliotheque-salee",
    name: "Bibliothèque Salée",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    durationTurns: 4,
    text: "Durée : 4 tours. À votre début de tour, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "Début de tour : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "caisse-des-dernieres-planches",
    name: "Caisse des Dernières Planches",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 3,
    text: "Durée : 3 tours. Sabordage : récupérez 1 Ancrage et piochez 1 carte.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : récupérez 1 Ancrage et piochez 1 carte.",
        effects: [
          { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "caisse-des-dernieres-planches-abyssal",
    name: "Caisse des Dernières Planches",
    type: "structure",
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    health: 5,
    durationTurns: 3,
    maxCopies: 1,
    text:
      "Durée : 3 tours. Sabordage : récupérez 2 Ancrage et piochez 1 carte. Si vous avez 0 Raison ou moins, " +
      "récupérez également 1 Raison.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : 2 Ancrage, 1 carte, et 1 Raison si vous êtes en Déraison.",
        effects: [
          { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          {
            type: "reasonGain",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 0,
          },
        ],
      },
    ],
  },
  {
    id: "longue-vue-rayee",
    name: "Longue-Vue Rayée",
    type: "equipement",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    health: 2,
    text:
      "Équipez un Marin ou une Créature. La première fois à chaque tour que l'unité équipée attaque, piochez " +
      "1 carte puis défaussez 1 carte.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "onAttack",
        triggeredBy: { equippedUnit: true },
        oncePerTurnKey: "longueVueFiltre",
        description: "Le porteur attaque : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  // --- Volatiles : le sous-type du lot. Aucun mot-clé propre — il sert de
  // famille de ciblage et d'identité visuelle, comme « objet flottant ».
  {
    id: "sterne-des-embruns",
    name: "Sterne des Embruns",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    attack: 1,
    health: 1,
    keywords: ["pied-marin"],
    text: "Pied marin. Lorsqu'elle attaque, elle gagne +1 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onAttack",
        description: "Elle attaque : +1 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            duration: "endOfTurn",
          },
        ],
      },
    ],
  },
  {
    id: "goeland-chapardeur",
    name: "Goéland Chapardeur",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 2,
    health: 2,
    keywords: ["pied-marin"],
    text: "Pied marin. La première fois à chaque tour qu'il attaque, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onAttack",
        oncePerTurnKey: "goelandFiltre",
        description: "Il attaque : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "cormoran-de-fer",
    name: "Cormoran de Fer",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    keywords: ["garde", "pied-marin"],
    text: "Garde. Pied marin.",
  },
  {
    id: "cormoran-de-fer-abyssal",
    name: "Cormoran de Fer",
    type: "creature",
    subtype: VOLATILE,
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 1,
    keywords: ["garde", "pied-marin"],
    text: "Garde. Pied marin. La première fois à chaque tour qu'il attaque, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onAttack",
        oncePerTurnKey: "cormoranRaison",
        description: "Il attaque : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "albatros-de-mauvais-temps",
    name: "Albatros de Mauvais Temps",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    attack: 4,
    health: 3,
    maxCopies: 2,
    keywords: ["pied-marin"],
    // Le contournement de Garde est un champ de données, pas un mot-clé
    // accordé : il ne vaut que pour CET attaquant, pendant Tempête.
    bonusDamageInTideState: { tideStateIn: ["tempete"], amount: 1 },
    bypassesGardeTideStateIn: ["tempete"],
    text: "Pied marin. Pendant Tempête, il gagne +1 Puissance et ignore Garde.",
  },
  {
    id: "pelican-des-cales",
    name: "Pélican des Cales",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text: "À son arrivée, piochez 1 carte puis défaussez 1 carte.",
    onPlayEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "mouette-du-brise-lames",
    name: "Mouette du Brise-Lames",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 1,
    health: 4,
    keywords: ["garde"],
    text: "Garde. Quand elle est détruite, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onDeath",
        description: "Elle est détruite : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "harnois-de-vigie",
    name: "Harnois de Vigie",
    type: "equipement",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 2,
    equipGrantsBuff: { healthAmount: 1 },
    equipGrantsKeywords: ["garde"],
    text: "Équipez un Marin ou une Créature. Il gagne +1 Résistance et Garde.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
  },
  {
    id: "cra-poiscail-medecin",
    name: "Cra-Poiscail Médecin",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 1,
    health: 3,
    text: "La première fois à chaque tour que vous Brisez un Objet, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onObjectBroken",
        oncePerTurnKey: "medecinAncrage",
        description: "Vous Brisez un Objet : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "cra-poiscail-medecin-abyssal",
    name: "Cra-Poiscail Médecin",
    type: "creature",
    archetype: "cra-poiscail",
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 1,
    text: "La première fois à chaque tour que vous Brisez un Objet, récupérez 1 Ancrage et piochez 1 carte.",
    abilities: [
      {
        trigger: "onObjectBroken",
        oncePerTurnKey: "medecinAncrage",
        description: "Vous Brisez un Objet : récupérez 1 Ancrage et piochez 1 carte.",
        effects: [
          { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "cra-poiscail-messager",
    name: "Cra-Poiscail Messager",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    attack: 1,
    health: 1,
    keywords: ["pied-marin"],
    text:
      "Pied marin. Lorsqu'il attaque, si vous contrôlez au moins 3 unités Cra-Poiscail, il gagne +1 Puissance " +
      "jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onAttack",
        description: "Il attaque avec un banc de 3 Cra-Poiscail : +1 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            duration: "endOfTurn",
            // « au moins 3 unités » : lui compris, d'où `excludeSelf: false`.
            conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 3, excludeSelf: false },
          },
        ],
      },
    ],
  },
  {
    id: "tas-de-bouts-de-bois",
    name: "Tas de Bouts de Bois",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    durationTurns: 3,
    text:
      "Durée : 3 tours. La première fois à chaque tour qu'une unité Cra-Poiscail que vous contrôlez est détruite, " +
      "cette Structure gagne +1 Résistance. Sabordage : récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { archetype: "cra-poiscail" },
        oncePerTurnKey: "tasDeBoisRenfort",
        description: "Un de vos Cra-Poiscail tombe : +1 Résistance, définitivement.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            healthAmount: { kind: "flat", value: 1 },
            duration: "permanent",
          },
        ],
      },
      {
        trigger: "onSaborde",
        description: "Sabordage : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "la-prima-noyee",
    name: "La Prima Noyée",
    type: "marin",
    subtype: MARIONNETTE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez revient dans votre main, " +
      "piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE },
        oncePerTurnKey: "primaFiltre",
        description: "Une autre Marionnette revient en main : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "la-prima-noyee-abyssal",
    name: "La Prima Noyée",
    type: "marin",
    subtype: MARIONNETTE,
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 5,
    attack: 4,
    health: 5,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez revient dans votre main, " +
      "piochez 1 carte et récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE },
        oncePerTurnKey: "primaFiltre",
        description: "Une autre Marionnette revient en main : piochez 1 carte et récupérez 1 Raison.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "arlequin-raccommodeur",
    name: "Arlequin Raccommodeur",
    type: "marin",
    subtype: MARIONNETTE,
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 2,
    health: 3,
    text: "Quand il est détruit, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onDeath",
        description: "Il est détruit : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "trappe-du-souffleur",
    name: "Trappe du Souffleur",
    type: "structure",
    subtype: MARIONNETTE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    text:
      "Durée : 3 tours. La première fois à chaque tour qu'une carte Marionnette que vous contrôlez revient dans " +
      "votre main, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE },
        oncePerTurnKey: "trappeAncrage",
        description: "Une Marionnette revient en main : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "charpentier-des-epaves",
    name: "Charpentier des Épaves",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, piochez " +
      "1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["structure"] },
        oncePerTurnKey: "charpentierFiltre",
        description: "Une de vos Structures part : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "barge-de-reparation",
    name: "Barge de Réparation",
    type: "structure",
    subtype: "objet-flottant",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 3,
    visibleDuringTide: ["houle", "tempete"],
    maxCopies: 2,
    text: "Durée : 3 tours. Visible pendant Houle et Tempête. À votre début de tour, si elle est visible, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "startOfTurn",
        condition: { selfVisible: true },
        description: "Début de tour, si elle est visible : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "clous-de-recuperation",
    name: "Clous de Récupération",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    text: "Brisez cet Objet : choisissez une Structure dans votre Cimetière. Remettez-la dans votre main.",
    onBreakEffects: [
      {
        type: "moveGraveyardCardToHand",
        target: { kind: "controllerPlayer" },
        filter: { cardType: "structure" },
      },
    ],
  },
  {
    id: "etau-du-calfat",
    name: "Étau du Calfat",
    type: "equipement",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    equipTargetTypes: ["structure"],
    text: "Équipez une Structure. Quand la Structure équipée est Sabordée, récupérez 1 Ancrage.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit", among: { cardTypes: ["structure"] } } }],
    abilities: [
      {
        trigger: "onSaborde",
        triggeredBy: { equippedUnit: true },
        description: "La Structure équipée est Sabordée : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "sonde-des-courants-perdus",
    name: "Sonde des Courants Perdus",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    durationTurns: 4,
    maxCopies: 2,
    text: "Durée : 4 tours. La première fois à chaque tour que la Marée change, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onTideStateEntered",
        oncePerTurnKey: "sondeFiltre",
        description: "La Marée change : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "ce-que-la-maree-rend",
    name: "Ce que la Marée Rend",
    type: "anomalie",
    setCode: RAPIECER_LA_COQUE,
    cost: 5,
    health: 3,
    durationTurns: 2,
    maxCopies: 2,
    // Choix IMPOSÉ : le joueur tranche, mais il ne peut pas refuser les deux
    // (même primitive que Le Fond Vous Regarde).
    anomalyForceChoiceAtStartOfTurn: { reasonLossAmount: 1, anchorDamageAmount: 1 },
    text: "Pendant 2 tours, au début du tour de chaque joueur, celui-ci choisit : perdre 1 Raison ou subir 1 dégât d'Ancrage.",
  },
];

/**
 * Index de résolution : le catalogue collectionnable PLUS les jetons
 * (`TOKEN_SET`). Les jetons ne sont volontairement pas dans `CORE_SET` —
 * collection, deckbuilding, boosters et rareté itèrent `CORE_SET` et ne
 * doivent jamais les voir — mais `getCardDefinition` doit savoir les
 * résoudre : un Péon invoqué est une carte comme une autre sur le plateau.
 */
export const CARD_DATABASE: ReadonlyMap<string, CardDefinition> = new Map(
  [...CORE_SET, ...TOKEN_SET].map((card) => [card.id, card])
);

export function getCardDefinition(cardId: string): CardDefinition {
  // Carte masquée d'une vue projetée (`game/state/playerView.ts`) : jamais
  // dans le catalogue, seulement côté client.
  if (cardId === HIDDEN_CARD_ID) return HIDDEN_CARD_DEFINITION;
  const def = CARD_DATABASE.get(cardId);
  if (!def) {
    throw new Error(`Carte inconnue: ${cardId}`);
  }
  return def;
}

/**
 * Ce permanent est-il un choix légal pour équiper `equipmentDef` — d'un
 * type que CET Équipement accepte (`equipmentDef.equipTargetTypes`, sinon
 * `EQUIPPABLE_CARD_TYPES` par défaut : certains Équipements restreignent
 * davantage, ex: "Treuil Rouillé" → Structure uniquement) ET pas déjà
 * équipé par un autre Équipement du même plateau ?
 */
export function canBeEquipTarget(
  equipmentDef: CardDefinition,
  board: CardInstance[],
  candidate: CardInstance
): boolean {
  const candidateDef = getCardDefinition(candidate.cardId);
  const allowedTypes = equipmentDef.equipTargetTypes ?? EQUIPPABLE_CARD_TYPES;
  if (!allowedTypes.includes(candidateDef.type)) return false;
  // "Équipez un Cra-Poiscail" : la famille restreint la cible en plus du type.
  if (equipmentDef.equipTargetArchetype && candidateDef.archetype !== equipmentDef.equipTargetArchetype) return false;
  return !board.some(
    (u) => u.instanceId !== candidate.instanceId && u.attachedToInstanceId === candidate.instanceId
  );
}

/** Au moins un permanent du plateau donné peut-il recevoir cet Équipement ? Détermine si sa pose doit exiger une cible ou peut être jouée sans lien ("si possible"). */
export function hasAnyValidEquipTarget(equipmentDef: CardDefinition, board: CardInstance[]): boolean {
  return board.some((u) => canBeEquipTarget(equipmentDef, board, u));
}
