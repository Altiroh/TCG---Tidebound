/**
 * Système d'effets génériques et combinables. Une carte ne fait jamais
 * "j'inflige 3 dégâts au héros ennemi" en dur : elle référence
 * `{ type: "damage", amount: { kind: "flat", value: 3 }, target: { kind: "opponentPlayer" } }`.
 *
 * Ajouter une nouvelle carte ne devrait (idéalement) jamais nécessiter
 * de nouveau code — seulement de nouvelles données, tant que la carte
 * peut s'exprimer avec les effets et cibles existants.
 */
import type { ArchetypeId } from "@/game/cards/archetypes";

export type EffectType =
  | "damage"
  | "heal"
  | "draw"
  | "discard"
  | "destroy"
  | "summon"
  | "buff"
  | "debuff"
  | "searchDeck"
  | "moveZone"
  | "transform"
  | "reasonGain"
  | "reasonLoss"
  /** Attache la source (un Équipement) au permanent choisi (`target: { kind: "chosenUnit" }`) — cf. `EQUIPPABLE_CARD_TYPES`, un seul Équipement par permanent. */
  | "attachEquipment"
  // --- Environnement : Marée, modèle "durée + intensité" -----------------
  // (cadrage "Mécaniques verrouillées" sections 20-21, orientation 2026-09-10)
  /** Réduit la durée restante de l'état de Marée courant (rapproche la progression). */
  | "tideReduceDuration"
  /** Prolonge la durée restante de l'état de Marée courant. */
  | "tideExtendDuration"
  /** Fixe l'Intensité de Marée courante à une valeur donnée. */
  | "tideSetIntensity"
  /** Modifie (delta) l'Intensité de Marée courante. */
  | "tideModifyIntensity"
  /** Pose un modificateur "maintenez cet état" : ne décompte pas au(x) prochain(s) tick(s). */
  | "tideMaintain"
  /** Pose un modificateur "doublez les prochains dégâts environnementaux". */
  | "tideAmplifyNext"
  /** Inverse l'orientation courante de la Marée (Montante ↔ Descendante). */
  | "tideInvertOrientation"
  /** Force une transition IMMÉDIATE d'un état vers les Abysses (jamais via le décompte normal). */
  | "tideForceAdvance"
  /** Force une transition IMMÉDIATE d'un état vers Calme (jamais via le décompte normal). */
  | "tideForceRetreat"
  | "ignoreNextTideDamage"
  // --- Lecture de main (purement informatif, cf. `HandCardRevealedEvent`) -
  /** Révèle `amount` cartes aléatoires DISTINCTES de la main de la cible — aucun autre effet sur l'état (ex: Guetteur de Brume, La Bouée qui Regardait). */
  | "revealRandomHandCards"
  /** Révèle une carte aléatoire de CHAQUE joueur puis inflige `amount` de perte de Raison à celui dont la carte révélée coûte le plus cher (égalité, ou un joueur sans carte en main = personne, ex: Cloche Immergée). */
  | "reasonLossToHigherRevealedHandCard"
  /** Renvoie en main la carte de la défausse choisie par le joueur (`EffectContext.chosenGraveyardInstanceId`), filtrée par `EffectDefinition.filter` (ex: Grappin de Récupération). */
  | "moveGraveyardCardToHand"
  /** Force une entrée DIRECTE dans les Abysses, en ignorant tout état intermédiaire (ex: La Gueule Sous la Mer, Sept Brasses Plus Bas — Lot 08, "Grandes Anomalies"). `amount` (optionnel) ajoute ce nombre de tours à la durée d'entrée par défaut ; `forceTideOrientation` (optionnel) fixe l'orientation résultante. */
  | "tideForceJumpToAbysses"
  /** Empêche CETTE cible de récupérer la moindre Raison (régénération de début de tour incluse) jusqu'au début de son prochain tour (ex: La Gueule Sous la Mer). */
  | "lockReasonGainUntilNextTurn"
  // --- Théâtre Englouti : retour en main, rappel d'arrivée, réduction ----
  // (Lot 11, Notion « Les Masques Noyés / Théâtre Englouti »)
  /**
   * Répète l'effet d'ARRIVÉE (`onEnterPlay`) de la cible, sans la faire
   * revenir en jeu (ex: Colombina aux Cent Visages, Le Régisseur des
   * Profondeurs). Seuls les effets qui ne demandent AUCUN choix au joueur
   * sont rejoués : une répétition ne rouvre pas de fenêtre de ciblage, et
   * rejouer un effet ciblé avec l'ancienne cible serait faux.
   */
  | "repeatEnterEffects"
  /**
   * Pose une réduction de coût sur les PROCHAINES cartes jouées par le
   * contrôleur ce tour-ci (« la prochaine Marionnette que vous jouez ce
   * tour coûte 1 de moins, minimum 1 »). `amount` porte la réduction,
   * `filter` la restriction éventuelle (sous-type, type), `uses` le nombre
   * de cartes concernées (défaut 1).
   */
  | "discountNextCards";

/** Une valeur numérique d'effet, pour l'instant une constante — prête à
 * être étendue vers des formules (ex: "= nombre d'unités contrôlées"). */
export type EffectAmount = { kind: "flat"; value: number };

/**
 * Restriction d'une cible `chosenUnit` : le joueur désigne, mais seulement
 * PARMI ce que le texte autorise. Le moteur, l'UI et la liste des réactions
 * éligibles s'appuient tous sur le même filtre (`eligibleChosenUnits`,
 * `game/effects/chosenTargets.ts`) — une cible que l'UI ne devrait pas
 * proposer est aussi une cible que le moteur refuse.
 */
export interface ChosenUnitFilter {
  /**
   * "choisissez un Cra-Poiscail" : ne retient que les UNITÉS (Marins et
   * Créatures) de cette famille — même restriction que le comptage
   * d'archétype (`countArchetypeUnits`, décision du 2026-09-14). Les
   * Structures, Objets, Équipements et Anomalies de la famille ne sont pas
   * des cibles : un "+1 / +1" n'a aucun sens sur elles.
   */
  archetype?: ArchetypeId;
  /**
   * "choisissez une Marionnette alliée" : ne retient que les permanents de
   * ce SOUS-TYPE (`CardDefinition.subtype`). Le Lot 11 raisonne en
   * sous-type et non en archétype — une Marionnette est un sous-type de
   * Créature, pas une famille au sens `archetypes.ts`.
   */
  subtype?: string;
  /**
   * "un AUTRE Cra-Poiscail" : exclut la source de l'effet et — si cette
   * source est un Équipement — le permanent qu'elle équipe. C'est LUI que
   * le texte oppose à "un autre" (ex: Fourchette du Grand Étang, dont la
   * phrase parle du porteur, pas du bout de ferraille attaché).
   */
  excludeSource?: boolean;
  /** Restreint au plateau du contrôleur de la source. Défaut : `true` — aucun texte du pool actuel ne fait choisir dans le camp adverse. */
  sameController?: boolean;
  /**
   * Coût IMPRIMÉ maximum de la carte choisie (ex: Le Régisseur Sans Visage,
   * « une Marionnette de coût 2 ou moins »). Le coût imprimé et non le coût
   * réduit : un plafond qui bougerait avec les réductions en cours rendrait
   * la cible légale ou non selon l'ordre des effets.
   */
  maxCost?: number;
}

export type TargetSelector =
  | { kind: "self" } // la carte/l'unité source elle-même
  | { kind: "controllerPlayer" } // le joueur qui contrôle la source
  | { kind: "opponentPlayer" }
  | { kind: "allPlayers" } // les deux joueurs, ex: effets environnementaux
  /**
   * Choisi par le joueur au moment de la résolution. `among` restreint ce
   * choix quand le texte le restreint ("choisissez un Cra-Poiscail") ;
   * sans lui, n'importe quel permanent des deux plateaux reste éligible,
   * comme depuis toujours.
   */
  | { kind: "chosenUnit"; among?: ChosenUnitFilter }
  | { kind: "allAllyUnits" }
  | { kind: "allEnemyUnits" }
  | { kind: "allUnits" }
  | { kind: "randomEnemyUnit" }
  | { kind: "randomAllyUnit" }
  /** Le permanent que l'Équipement SOURCE équipe (`CardInstance.attachedToInstanceId`) — ex: Slip de Guerre, qui renforce son porteur. */
  | { kind: "equippedUnit" }
  /** Les unités alliées portant l'un de ces `cardIds` (ex: Le Tournoi du Grand Étang, qui renforce Chevalier, Destrier et Bourreau). */
  | { kind: "allyUnitsWithCardIds"; cardIds: string[] }
  /** La carte qui a DÉCLENCHÉ la capacité en cours (ex: Bannière en Vieille Chaussette, qui renforce le Cra-Poiscail qui vient d'être invoqué). */
  | { kind: "triggerSource" };

export interface EffectDefinition {
  type: EffectType;
  target: TargetSelector;
  amount?: EffectAmount;
  /** cardId à invoquer, pour `summon` ; cardId cible de transformation pour `transform`. */
  cardId?: string;

  /**
   * Pour `summon` : nombre d'exemplaires à invoquer (défaut 1). L'invocation
   * s'arrête aux Slots libres du Navire — "on n'invoque pas plus qu'il n'en
   * tient" (décision du 2026-09-14) : deux Péons sur un plateau qui n'a
   * qu'une place donnent un Péon, pas une invocation annulée.
   */
  count?: number;

  /**
   * Pour `summon` : les invoqués arrivent SANS mal d'invocation, donc
   * capables d'attaquer le tour même — c'est le mot-clé **Pied marin**
   * (ex: Fesses en Avant !). Le texte l'accorde "jusqu'à la fin du tour",
   * mais sur un corps qui vient d'arriver son seul effet réel est
   * exactement celui-ci.
   */
  rush?: boolean;

  /**
   * Pour `summon` : bonus temporaire (jusqu'à la fin du tour) accordé aux
   * corps qui viennent d'être invoqués — ex: Le Grand Saut, "ils gagnent
   * +1 Puissance et Ruée jusqu'à la fin du tour".
   */
  summonBuff?: { attackAmount?: number; healthAmount?: number };

  /**
   * Durée du `buff`/`debuff` posé. `permanent: true` reste accepté et
   * équivaut à `"permanent"` ; sinon, défaut `"endOfTurn"` — "jusqu'à la
   * fin du tour", la formulation la plus courante. Les cartes qui disent
   * "jusqu'à votre prochain tour" doivent le déclarer explicitement.
   */
  duration?: import("@/game/cards/types").StatModifierDuration;

  /**
   * Ne résout cet effet que si le contrôleur a au moins `count` permanents
   * de cet archétype sur son plateau (ex: Cra-Poiscail Sauteur, "si vous
   * contrôlez déjà un AUTRE Cra-Poiscail"). `excludeSelf` exclut la carte
   * source du décompte — c'est presque toujours ce que dit le texte pour un
   * effet d'arrivée, la carte étant déjà posée quand il se résout.
   */
  conditionControlledArchetypeAtLeast?: {
    archetype: import("@/game/cards/archetypes").ArchetypeId;
    count: number;
    excludeSelf?: boolean;
  };

  /**
   * Ne résout cet effet que si l'Objet source a été Brisé DEPUIS LA MAIN
   * (`breakObject` avec `fromHand`), ou seulement s'il l'a été depuis le
   * board (`false`) — ex: Le Seau, qui invoque un Péon de plus quand on le
   * brise directement de la main. `undefined` = indifférent.
   */
  conditionBrokenFromHand?: boolean;

  /**
   * Ne résout cet effet que si le contrôleur a TOUTES ces cartes nommées
   * en jeu (ex: Le Tournoi du Grand Étang, "si vous contrôlez les trois à
   * la résolution, piochez 1 carte").
   */
  conditionControlsAllCardIds?: string[];

  /** Variante "au moins une" (ex: La Quête du Grand Nénuphar, "alors que vous contrôlez un Destrier du Grand Étang"). */
  conditionControlsAnyCardIds?: string[];
  /** Zone de destination, pour `moveZone` (ex: retourner une carte en main). */
  toZone?: "hand" | "deck" | "graveyard" | "board";
  /** `discountNextCards` : nombre de cartes concernées par la réduction. Défaut 1. */
  uses?: number;
  /**
   * Filtre optionnel utilisé par `searchDeck`/`moveGraveyardCardToHand` :
   * `cardType` (un seul type) ou `cardTypes` (plusieurs types acceptés, ex:
   * "Structure OU Équipement" pour Grappin de Récupération) ; `maxCost`
   * plafonne le coût imprimé de la carte choisie.
   */
  filter?: {
    cardType?: import("@/game/cards/types").CardType;
    cardTypes?: import("@/game/cards/types").CardType[];
    /** Sous-type exact (ex: "marionnette") — utilisé par `discountNextCards`. */
    subtype?: string;
    maxCost?: number;
  };
  /**
   * État de Marée concerné par `ignoreNextTideDamage` (ex: "abysses" pour
   * "Bouchons de Cire : ignorez la prochaine perte d'Ancrage abyssale").
   */
  tideState?: "calme" | "houle" | "tempete" | "abysses";

  /** Pour `tideForceJumpToAbysses` UNIQUEMENT : force l'orientation résultante au lieu de la déduire naturellement (ex: Sept Brasses Plus Bas, "l'orientation devient Descendante"). */
  forceTideOrientation?: "montante" | "descendante";
  /**
   * Pour `buff`/`debuff` : `true` = modificateur permanent (ex: un
   * Équipement qui attache "+1 Puissance" tant qu'il reste en jeu), sinon
   * temporaire (retiré en fin de tour). Défaut : temporaire.
   */
  permanent?: boolean;
  /**
   * Pour `buff`/`debuff` : composantes séparées Puissance/Résistance,
   * quand l'effet n'est pas symétrique (ex: "+1 Résistance" seul). Si
   * absents, retombe sur `amount` pour les deux (comportement "+N/+N").
   */
  attackAmount?: EffectAmount;
  healthAmount?: EffectAmount;

  /**
   * Restreint la résolution de CET effet à certains états de Marée courants
   * (ex: Poisson-Lanterne, "récupérez 1 Raison" seulement pendant Tempête/
   * Abysses) — vérifié une fois pour toutes dans `resolveEffect`, avant le
   * `switch` sur `type`, pour rester utilisable par n'importe quel type
   * d'effet sans dupliquer la vérification carte par carte.
   */
  conditionTideStateIn?: Array<"calme" | "houle" | "tempete" | "abysses">;

  /** Restreint la résolution de CET effet à l'orientation de Marée courante (ex: Marin des Jetées, un effet différent selon Montante/Descendante). Même principe que `conditionTideStateIn`. */
  conditionOrientationIs?: "montante" | "descendante";

  /**
   * Restreint la résolution de CET effet à la Raison courante du joueur
   * contrôleur au moment de la résolution (ex: Mousse du Premier Quart,
   * "si votre Raison est inférieure à celle de l'adversaire"). Comparée à
   * `context.controllerId` — jamais à une autre cible.
   */
  conditionControllerReasonBelowOpponent?: boolean;

  /**
   * Restreint la résolution de CET effet au cas où la carte SOURCE
   * (`context.sourceInstanceId`) est actuellement visible selon son propre
   * `visibleDuringTide` (ex: Bouée de Dérive, capacité de début de tour
   * "si elle est visible"). Une carte sans `visibleDuringTide` est toujours
   * visible. Distinct de `onBecomeVisible`, qui ne se déclenche que sur une
   * TRANSITION d'invisible à visible — ceci vérifie l'état courant à chaque
   * résolution, utile pour une capacité récurrente (ex: `startOfTurn`).
   */
  conditionSelfVisible?: boolean;

  /**
   * Restreint la résolution de CET effet à un plafond ABSOLU de Raison du
   * contrôleur (ex: Thermos du Dernier Quart, "récupérez 3 Raison à la
   * place si vous avez 3 Raison ou moins" — un bonus qui s'ajoute à un
   * effet de base non conditionnel). Contrairement à
   * `conditionControllerReasonBelowOpponent`, compare à une valeur fixe,
   * pas à l'adversaire. Vérifié dans l'ordre du tableau `effects` : placer
   * l'effet conditionnel AVANT l'effet de base pour qu'il lise la Raison
   * telle qu'elle était avant que le reste de la liste ne la modifie.
   */
  conditionControllerReasonAtMost?: number;
}
