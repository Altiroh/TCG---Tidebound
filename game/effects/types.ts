/**
 * Système d'effets génériques et combinables. Une carte ne fait jamais
 * "j'inflige 3 dégâts au héros ennemi" en dur : elle référence
 * `{ type: "damage", amount: { kind: "flat", value: 3 }, target: { kind: "opponentPlayer" } }`.
 *
 * Ajouter une nouvelle carte ne devrait (idéalement) jamais nécessiter
 * de nouveau code — seulement de nouvelles données, tant que la carte
 * peut s'exprimer avec les effets et cibles existants.
 */

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
  | "lockReasonGainUntilNextTurn";

/** Une valeur numérique d'effet, pour l'instant une constante — prête à
 * être étendue vers des formules (ex: "= nombre d'unités contrôlées"). */
export type EffectAmount = { kind: "flat"; value: number };

export type TargetSelector =
  | { kind: "self" } // la carte/l'unité source elle-même
  | { kind: "controllerPlayer" } // le joueur qui contrôle la source
  | { kind: "opponentPlayer" }
  | { kind: "allPlayers" } // les deux joueurs, ex: effets environnementaux
  | { kind: "chosenUnit" } // choisi par le joueur au moment de la résolution
  | { kind: "allAllyUnits" }
  | { kind: "allEnemyUnits" }
  | { kind: "allUnits" }
  | { kind: "randomEnemyUnit" }
  | { kind: "randomAllyUnit" };

export interface EffectDefinition {
  type: EffectType;
  target: TargetSelector;
  amount?: EffectAmount;
  /** cardId à invoquer, pour `summon` ; cardId cible de transformation pour `transform`. */
  cardId?: string;
  /** Zone de destination, pour `moveZone` (ex: retourner une carte en main). */
  toZone?: "hand" | "deck" | "graveyard" | "board";
  /**
   * Filtre optionnel utilisé par `searchDeck`/`moveGraveyardCardToHand` :
   * `cardType` (un seul type) ou `cardTypes` (plusieurs types acceptés, ex:
   * "Structure OU Équipement" pour Grappin de Récupération) ; `maxCost`
   * plafonne le coût imprimé de la carte choisie.
   */
  filter?: {
    cardType?: import("@/game/cards/types").CardType;
    cardTypes?: import("@/game/cards/types").CardType[];
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
