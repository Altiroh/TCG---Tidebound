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
 * générique `tideInvertOrientation` quand le texte s'y prête sans
 * branchement conditionnel ni choix optionnel (ex: "cartes-des-courants") ;
 * les cartes dont l'effet dépend d'une condition ("si montante/si
 * Abysses...") ou d'un choix optionnel ("vous pouvez... si vous le
 * faites") restent marquées "non appliqué", comme le reste des
 * mécaniques non câblées ci-dessous.
 *
 * FIDÉLITÉ MÉCANIQUE — le moteur actuel n'a pas encore de système de
 * "première fois par tour" par source, de choix de joueur en cours de
 * résolution (option "vous pouvez"), de lecture d'information cachée
 * (regarder une carte), de recherche en défausse, ou d'attachement
 * d'Équipement persistant. Chaque carte porte donc son texte RÉEL et
 * complet (`text`), mais seuls les effets structurellement exprimables
 * avec le système générique actuel (`game/effects`) sont câblés via
 * `onPlayEffects` / `onBreakEffects` / `abilities`. Quand une carte n'a
 * aucun de ces champs malgré un texte à effet, c'est volontaire : son
 * comportement n'est pas encore implémenté (même convention que les
 * capacités de Navire non appliquées, voir `game/environment/shipData.ts`).
 *
 * NOTE — "Calme", "Houle", "Tempête" et "Abysses" sont des termes réservés
 * à l'état de Marée. Résistance = champ `health`, y compris pour les
 * Structures et Objets (le moteur traite déjà tout permanent du board de
 * façon générique pour les dégâts/la mort, cf. `processDeaths.ts`).
 */
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
      "Quand il arrive en jeu, si la Marée est montante, il gagne +1 Résistance jusqu'à votre prochain tour. Si " +
      "elle est descendante, récupérez 1 Raison.",
    onPlayEffects: [
      {
        type: "buff",
        target: { kind: "self" },
        healthAmount: { kind: "flat", value: 1 },
        permanent: false,
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
    text: "La première fois par tour que vous perdez de la Raison, réduisez cette perte de 1.",
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
    text: "Quand une Structure est détruite ou Sabordée, vous pouvez récupérer 1 Raison. Une fois par tour.",
    // non appliqué : trigger large (toute Structure, y compris adverse) + choix optionnel non modélisés.
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
    text: "Quand il arrive en jeu, si la Marée actuelle est Tempête ou Abysses, récupérez 1 Raison.",
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
    // Interprété comme "la première fois PAR TOUR" (même convention que les cartes similaires du catalogue,
    // ex: Baleine aux Cicatrices Blanches) plutôt que "une seule fois pendant toute la durée de vie de la
    // carte" — le texte est ambigu sur ce point, mais un bouclier à usage unique sur 3 tours de durée de vie
    // serait d'une valeur dérisoire comparé à ses pairs.
    reduceTideShipDamageOncePerTurn: { amount: 1, tideStateIn: ["tempete"] },
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
      { type: "buff", target: { kind: "chosenUnit" }, attackAmount: { kind: "flat", value: 1 }, permanent: true },
    ],
    selfDamageOnDirectAttack: 1,
  },
  {
    id: "thermos-du-dernier-quart",
    name: "Thermos du Dernier Quart",
    type: "objet",
    cost: 2,
    health: 1,
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
      "Durée : 3 tours. Visible uniquement pendant Houle. La première fois à chaque tour que votre Navire devrait " +
      "subir des dégâts directs d'une attaque, vous pouvez déclencher Contrecoup : annulez ces dégâts et infligez " +
      "au Navire adverse la moitié des dégâts annulés, arrondie au supérieur. Après résolution, elle se brise et " +
      "quitte le board.",
    // non appliqué : Contrecoup (annulation + redirection partielle de dégâts, optionnel) non modélisé.
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
    health: 1,
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
      "Durée : 3 tours. Visible pendant Calme et Houle. La première fois à chaque tour que l'adversaire active un " +
      "Objet, il doit payer 1 Raison supplémentaire. S'il ne peut pas, l'activation est annulée.",
    // non appliqué : taxe réactive sur le bris d'Objet adverse non modélisée.
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
    // non appliqué : report conditionnel des effets de Marée non modélisé.
  },
  {
    id: "marin-aux-yeux-rouges",
    name: "Marin aux Yeux Rouges",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 2,
    text: "Quand il arrive en jeu, chaque joueur perd 1 Raison.",
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
    subtype: "abyssal",
    cost: 3,
    attack: 3,
    health: 3,
    text:
      "Quand il arrive en jeu, chaque joueur perd 1 Raison. Si la Marée est montante, l'adversaire perd 1 Raison " +
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
      "La première fois par tour que l'adversaire déclenche un effet pendant votre tour, regardez une carte " +
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
    // non appliqué : choix optionnel (défausser puis piocher) non modélisé.
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
    text: "La première fois par tour qu'une Structure que vous contrôlez devient visible, récupérez 1 Raison.",
    // non appliqué : trigger large (n'importe laquelle de vos Structures) non modélisé ; seul `onBecomeVisible` sur soi-même existe.
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
    text: "Équipez une Structure. Elle gagne +1 Résistance. Quand cette Structure quitte le board, piochez 1 carte.",
    equipTargetTypes: ["structure"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
      { type: "buff", target: { kind: "chosenUnit" }, healthAmount: { kind: "flat", value: 1 }, permanent: true },
    ],
    // non appliqué : la pioche au départ de la Structure équipée n'est pas câblée.
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
      "Durée : 3 tours. Visible pendant Calme et Houle. À votre début de tour, si elle est visible, une Créature " +
      "adverse perd 1 Puissance jusqu'à la fin du tour.",
    // non appliqué : choix de cible + effet temporaire récurrent non modélisés.
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
      "Durée : 5 tours. Visible uniquement pendant Abysses. Lorsqu'elle devient visible, récupérez 2 Raison. " +
      "Lorsqu'elle quitte Abysses sans avoir été détruite, Sabordez-la.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        description: "Lorsqu'elle devient visible, récupérez 2 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
      },
    ],
    // non appliqué : l'auto-Sabordage à la sortie des Abysses n'est pas câblé.
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
      "Durée : 4 tours. Visible pendant Houle, Tempête et Abysses. Une fois par tour, lorsque la Marée change, " +
      "vous pouvez perdre 1 Raison pour prolonger la nouvelle Marée d'1 tour.",
    // non appliqué : capacité optionnelle répétable non modélisée.
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
    // ("revenante-de-la-fosse-abyssal.png"/"-debord").
    id: "revenante-de-la-fosse-abyssal",
    name: "Revenante de la Fosse",
    type: "marin",
    subtype: "abyssal",
    cost: 5,
    attack: 4,
    health: 4,
    maxCopies: 1,
    text:
      "À son arrivée, perdez 2 Raison. Tant que vous êtes en Abysses, la première fois à chaque tour qu'il devrait " +
      "être détruit, il reste à 1 Résistance à la place.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
    // non appliqué : la survie conditionnelle à 1 Résistance pendant Abysses n'est pas câblée.
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
    // fournies ("masse-sombre-abyssal.png"/"-debord") et à la confirmation d'une vraie paire STD/ABY.
    id: "masse-sombre-abyssal",
    name: "Masse-Sombre",
    type: "creature",
    subtype: "abyssal",
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
    text: "Vous ne pouvez la jouer que si vous avez 5 Raison ou moins. Lorsqu'elle arrive en jeu, perdez 1 Ancrage.",
    requiresControllerReasonAtMost: 5,
    onPlayEffects: [{ type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "ce-qui-suit-le-navire-abyssal",
    name: "Ce Qui Suit le Navire",
    type: "creature",
    subtype: "abyssal",
    cost: 5,
    attack: 6,
    health: 6,
    maxCopies: 1,
    text:
      "Vous devez avoir exactement 5 Raison pour jouer cette carte. Après paiement de son coût, votre Raison " +
      "tombe donc à 0. Lorsqu'elle arrive en jeu, perdez 2 Ancrage.",
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
      { type: "buff", target: { kind: "chosenUnit" }, attackAmount: { kind: "flat", value: 2 }, permanent: true },
    ],
    // Bug corrigé au passage : `attachEquipment`/`equipTargetTypes` manquaient (l'Équipement ne s'attachait jamais).
    // non appliqué : la perte de Raison conditionnelle "si elle a attaqué" n'est pas câblée (pas de condition générique "l'unité équipée a attaqué ce tour-ci").
  },
  {
    id: "lanterne-aux-verres-noirs",
    name: "Lanterne aux Verres Noirs",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text:
      "Équipez un Marin. À votre début de tour, vous pouvez perdre 1 Raison : choisissez soit de réduire de 1 " +
      "tour la durée de la Marée actuelle, soit d'inverser l'orientation de sa prochaine transition.",
    // fidélité partielle : seule l'option "réduire de 1" est câblée (même convention que Horloge de Marée) — pas de choix entre deux options facultatives.
    equipTargetTypes: ["marin"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "startOfTurn",
        mode: "optional",
        cost: { reason: 1 },
        description: "Vous pouvez dépenser 1 Raison : réduisez de 1 tour la durée de la Marée actuelle.",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
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
      "Durée : 4 tours. Visible pendant Calme, Houle et Tempête. La première fois par tour qu'une Créature " +
      "devrait infliger des dégâts directs à votre Navire, réduisez ces dégâts de 1.",
    reduceDirectShipDamageOncePerTurn: 1,
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
      "Durée : 5 tours. Visible uniquement pendant Tempête et Abysses. À chaque fois qu'elle devient visible, " +
      "regardez une carte aléatoire de la main adverse. Si vous êtes en Abysses, regardez-en 2 à la place.",
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
    subtype: "abyssal",
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
    text: "La première fois par tour qu'une Structure adverse devient visible, elle perd 1 Résistance.",
    // non appliqué : trigger sur Structure ADVERSE (portée large) non modélisé ; seul `onBecomeVisible` sur soi-même existe.
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
    text: "Équipez une Structure. À votre début de tour, si elle est visible, elle récupère 1 Résistance. Maximum 1 fois par tour.",
    equipTargetTypes: ["structure"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    // Bug corrigé au passage : l'Équipement ne s'attachait jamais (onPlayEffects absent).
    // non appliqué : la capacité récurrente elle-même reste non câblée — cible "l'unité équipée par
    // cette carte", un type de cible qui n'existe pas encore dans `TargetSelector` (seul `chosenUnit`
    // existe, résolu au moment de la pose, pas "le permanent que JE équipe" à un moment ultérieur).
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
    text: "Durée : 3 tours. Visible : Calme et Houle. Lorsqu'il quitte le board sans avoir été détruit, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onExpire",
        description: "Lorsqu'il expire (sans avoir été détruit), récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
    // fidélité partielle : ne couvre que la sortie par expiration, pas un éventuel Sabordage volontaire.
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
      "Durée : 4 tours. Visible : Houle et Tempête. Lorsqu'une autre Structure que vous contrôlez est détruite, " +
      "cette carte gagne +1 Résistance. Maximum +2.",
    buffSelfOnOtherOwnStructureDestroyed: { healthAmount: 1, maxStacks: 2 },
  },
  {
    id: "levier-de-lest",
    name: "Levier de Lest",
    type: "objet",
    cost: 1,
    health: 1,
    text: "Brisez cet Objet et Sabordez une Structure que vous contrôlez : récupérez 1 Raison et 1 Ancrage.",
    onBreakEffects: [
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
    // fidélité partielle : accorde les ressources au bris, mais ne force pas le Sabordage conjoint d'une Structure.
  },
  {
    id: "grappin-de-recuperation",
    name: "Grappin de Récupération",
    type: "objet",
    cost: 2,
    health: 1,
    text:
      "Brisez cet Objet : choisissez dans votre défausse une Structure ou un Équipement coûtant 2 ou moins. " +
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
    id: "second-au-visage-pale",
    name: "Second au Visage Pâle",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 4,
    text:
      "Tant que vous êtes en Tempête ou Abysses, la première fois par tour que vous devriez perdre de la Raison, " +
      "réduisez cette perte de 1.",
    reduceOwnReasonLossOncePerTurn: { amount: 1, tideStateIn: ["tempete", "abysses"] },
  },
  {
    id: "veilleur-des-profondeurs",
    name: "Veilleur des Profondeurs",
    type: "marin",
    cost: 4,
    attack: 3,
    health: 4,
    text:
      "À son arrivée, si la Marée est en Abysses, forcez son orientation à devenir descendante. Sinon, vous " +
      "pouvez réduire de 1 tour la durée de la Marée actuelle.",
    // non appliqué : branchement conditionnel à l'ETB (Abysses ou non) + choix optionnel non modélisés (l'orientation elle-même existe dans le moteur).
  },
  {
    id: "mecanicien-aux-mains-noires",
    name: "Mécanicien aux Mains Noires",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 3,
    text: "Quand une Structure que vous contrôlez est détruite, une autre Structure que vous contrôlez gagne +1 Résistance. Une fois par tour.",
    // non appliqué : trigger + choix de cible conditionnels non modélisés.
  },
  {
    id: "meduse-des-lanternes",
    name: "Méduse des Lanternes",
    type: "creature",
    cost: 2,
    attack: 2,
    health: 2,
    text: "Quand elle devient votre seule Créature en jeu, récupérez 1 Raison.",
    // non appliqué : condition dynamique sur la composition du board non modélisée.
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
    subtype: "abyssal",
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
      { type: "buff", target: { kind: "chosenUnit" }, attackAmount: { kind: "flat", value: 1 }, permanent: true },
    ],
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
    // non appliqué : plafonnement réactif des dégâts d'attaque non modélisé.
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
      "Durée : 5 tours. Visible uniquement pendant Tempête et Abysses. Lorsqu'elle devient visible, chaque " +
      "joueur révèle une carte aléatoire de sa main. Le joueur ayant révélé la carte au coût le plus élevé perd " +
      "1 Raison. En cas d'égalité, personne ne perd de Raison.",
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
      "Durée : 4 tours. Visible pendant Houle et Abysses. La première fois par tour qu'une Créature adverse " +
      "attaque votre Navire, elle perd 1 Puissance jusqu'à la fin de ce combat.",
    reduceAttackerPowerOnDirectAttackOncePerTurn: 1,
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
    // non appliqué : nécessite un vrai choix de joueur (deux effets alternatifs proposés au joueur ACTIF à
    // chaque début de tour) — contrairement aux autres Anomalies de ce lot, `game/state/anomalies.ts` ne
    // modélise que des règles appliquées automatiquement, sans décision. Demanderait un sous-système dédié
    // (état "choix en attente" façon `pendingReaction`, nouvelle action `resolveChoice`, UI de sélection) —
    // signalé comme chantier séparé plutôt que deviné (un défaut fixe changerait la valeur stratégique réelle
    // de la carte).
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "le-fond-vous-regarde-abyssal",
    name: "Le Fond Vous Regarde",
    type: "anomalie",
    subtype: "abyssal",
    cost: 7,
    health: 5, // cf. commentaire sur Quelque Chose Sous la Coque : valeur absente du cadrage, fixée par cohérence.
    maxCopies: 1,
    durationTurns: 2,
    text: "Pendant 2 tours, au début de chaque tour, le joueur actif choisit : perdre 2 Raison, ou infliger 2 dégâts d'Ancrage à son propre Navire.",
    // non appliqué : même chantier que la version Standard ci-dessus (choix de joueur non modélisé).
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
        description: "Sabordage : réduisez de 1 tour la durée restante de la Marée actuelle.",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
    // fidélité partielle : la réduction est câblée, le passage immédiat à l'état suivant si elle tombe à 0 ne l'est pas.
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
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : réduit de 2 tours la durée restante de la Marée actuelle.",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 2 } }],
      },
    ],
    // fidélité partielle : seule l'option "réduire de 2" est câblée, le choix entre les deux options n'est pas modélisé.
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
    // non appliqué : amplificateur réactif conditionnel non modélisé.
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
      "Durée : 3 tours. Visible uniquement pendant Abysses. Lorsque vous entrez dans les Abysses, vous pouvez " +
      "perdre 2 Raison. Si vous le faites, augmentez la durée des Abysses de 1 tour.",
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
    subtype: "abyssal",
    cost: 4,
    maxCopies: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 4 tours. Visible uniquement pendant Tempête et Abysses. Lorsque vous entrez dans les Abysses, " +
      "vous pouvez perdre 2 Raison. Si vous le faites, augmentez la durée des Abysses de 1 tour.",
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
    subtype: "abyssal",
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
    // Grande Anomalie : coûteuse et dangereuse pour son propre contrôleur, jamais un finisher universel
    // (Notion "Catalogue de cartes", Lot 08, "Intention de design — Grandes Anomalies").
    id: "la-gueule-sous-la-mer",
    name: "La Gueule Sous la Mer",
    type: "anomalie",
    // Résolution immédiate (onPlayEffects uniquement, aucune règle durable) : comme un Équipement consommable,
    // part directement au cimetière plutôt que d'occuper indéfiniment un Slot sans plus aucun effet (cf.
    // `isPermanentCard`).
    permanent: false,
    cost: 6,
    maxCopies: 1,
    text:
      "Forcez immédiatement la Marée en Abysses. Les états intermédiaires sont ignorés. Après résolution, votre " +
      "Navire perd 2 Ancrage. Jusqu'au début de votre prochain tour, vous ne pouvez pas récupérer de Raison.",
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
    permanent: false, // cf. commentaire sur La Gueule Sous la Mer ci-dessus.
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
    text: "La première fois par tour qu'une Structure alliée perd de la Résistance, rendez-lui 1 Résistance.",
    restoreResistanceOnAllyStructureLossOncePerTurn: 1,
  },
  {
    id: "carape-hus",
    name: "Carape Hus",
    type: "creature",
    cost: 3,
    attack: 2,
    health: 5,
    text: "Si la Marée est Calme, obtient Garde.",
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
    subtype: "abyssal",
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
    health: 1,
    text:
      "Si la Marée est Calme, coûte 0 Raison. Brisez cet Objet : récupérez 2 Raison. Cet effet ne peut être " +
      "activé que pendant Calme.",
    costOverrideWhenTideStateIn: { tideStateIn: ["calme"], cost: 0 },
    requiresTideStateForBreak: ["calme"],
    onBreakEffects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
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
  const allowedTypes = equipmentDef.equipTargetTypes ?? EQUIPPABLE_CARD_TYPES;
  if (!allowedTypes.includes(getCardDefinition(candidate.cardId).type)) return false;
  return !board.some(
    (u) => u.instanceId !== candidate.instanceId && u.attachedToInstanceId === candidate.instanceId
  );
}

/** Au moins un permanent du plateau donné peut-il recevoir cet Équipement ? Détermine si sa pose doit exiger une cible ou peut être jouée sans lien ("si possible"). */
export function hasAnyValidEquipTarget(equipmentDef: CardDefinition, board: CardInstance[]): boolean {
  return board.some((u) => canBeEquipTarget(equipmentDef, board, u));
}
