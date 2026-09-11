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
  | "ignoreNextTideDamage";

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
  /** Filtre optionnel utilisé par `searchDeck` (ex: par type de carte). */
  filter?: { cardType?: import("@/game/cards/types").CardType };
  /**
   * État de Marée concerné par `ignoreNextTideDamage` (ex: "abysses" pour
   * "Bouchons de Cire : ignorez la prochaine perte d'Ancrage abyssale").
   */
  tideState?: "calme" | "houle" | "tempete" | "abysses";
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
}
