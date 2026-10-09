/**
 * Types d'événements du jeu auxquels une carte peut réagir via
 * `abilities` (voir `game/cards/types.ts`). Séparé de `game/events/types.ts` :
 * les `GameEvent` sont le journal *passé* (pour replay/debug), les
 * `TriggerType` sont les points d'accroche que le moteur utilise pour
 * savoir quelles capacités déclencher.
 */
export type TriggerType =
  | "onPlay" // la carte elle-même est jouée
  | "onEnterPlay" // une unité arrive en jeu (soi-même ou une autre, voir condition)
  | "onDeath" // une unité meurt
  | "onSaborde" // une unité a été volontairement sabordée par son contrôleur (déclenché en plus de onDeath)
  | "onAttack" // une unité attaque
  | "onDamaged" // une unité subit des dégâts
  | "startOfTurn"
  | "endOfTurn"
  | "onCardPlayed" // n'importe quelle carte est jouée par n'importe qui
  | "onTideStateEntered" // la Marée vient d'entrer dans un nouvel état
  | "onTideStateExited" // la Marée vient de QUITTER un état (ex: "à chaque sortie des Abysses")
  | "onTideAnnounced" // une nouvelle Marée vient d'être ANNONCÉE : son état est committé, ses effets de tour ne sont PAS encore appliqués (capacités de Navire `activationWindow: "tideAnnounced"`). Fenêtre strictement antérieure à `onTideStateEntered`.
  | "onBecomeVisible" // une Structure devient visible pour l'adversaire (entrée dans un de ses `visibleDuringTide`)
  | "onExpire" // une Structure/Objet à durée limitée quitte le board par expiration (ni mort, ni Sabordage)
  | "onObjectBroken" // le contrôleur vient de Briser un Objet (depuis le board OU depuis sa main)
  | "onPowerGained" // une carte EN JEU vient de voir sa Puissance effective augmenter, quelle qu'en soit la cause
  | "onReturnedToHand" // un permanent quitte le board pour la main de son contrôleur (Lot 11 — Théâtre Englouti)
  | "onDiscarded" // CETTE carte vient d'être défaussée de la main (Lot 13) — elle n'a jamais été sur le plateau, sa capacité est lue sur sa définition
  | "onCardDiscardedFromHand" // une carte rejoint le Cimetière DEPUIS UNE MAIN : déclencheur d'OBSERVATEUR, filtré par `triggeredBy` (Lot 13)
  | "onCardPutIntoGraveyard" // une carte rejoint le Cimetière depuis une MAIN ou une PIOCHE (défausse, meulage) — jamais une mort, que `onDeath` couvre : déclencheur d'OBSERVATEUR, filtré par `triggeredBy` (Test Verrier, 30/09/2026 : la Veillée doit pouvoir vider sa pioche pour nourrir ses récompenses)
  | "onCardRecoveredFromGraveyard" // une carte remonte du Cimetière vers la main : déclencheur d'OBSERVATEUR (Lot 13 — Maman revient)
  | "onIncomingDirectAttack" // le Navire du contrôleur va subir des dégâts directs d'une attaque — fenêtre d'INTERCEPTION, ouverte AVANT tout calcul de dégâts (pièges : Cylindre flottant, Caisses Arrimées, Cage de Flottaison)
  | "onCombatVsGarde" // une unité du contrôleur (`sourceInstanceId`) va COMBATTRE une unité adverse ayant Garde — qu'elle attaque la Garde ou que la Garde l'attaque. Ouverte à la déclaration de l'attaque, dans la fenêtre d'interception, pour le camp concerné (Lot 15 — Ouvrez la Ligne !)
  | "onUnitAttackDeclared" // une unité ADVERSE vient de déclarer une attaque, quelle qu'en soit la cible — même fenêtre, mais ouverte aussi sur un combat entre unités (Filet à la Dérive)
  | "onBecomeOnlyCreature" // la carte vient de DEVENIR la seule Créature du plateau de son contrôleur (ex: Méduse des Lanternes) — détecté par photo avant/après chaque action (`processLoneCreatureChanges`)
  | "onPermanentWouldBeDestroyed" // un permanent est sur le point de partir au Cimetière — fenêtre de SAUVETAGE, ouverte AVANT que `processDeaths` ne l'emporte (Lot 14 : Filet de Sauvetage, Cloison Étanche, Bouclier d'Écume)
  | "onSurvivedDamage" // une unité a subi des dégâts ET est toujours en jeu une fois les morts réglées (Lot 15 — Équipage de Verre) : personnel, ou observateur avec `triggeredBy`
  | "onChromaticColorChosen" // une carte EN JEU vient de recevoir la couleur choisie pour elle par une question (« À son arrivée, choisissez sa couleur » — Émissaire de Quartz) : personnel ou observateur ; `fromSummon` vaut vrai si elle n'a pas été JOUÉE (Lot 15 — Poste Chromatique)
  | "onEveil" // Lot 16 — l'Éveil d'une carte se résout : personnel (la carte résout SON Éveil, « Éveil — … »), ou observateur avec `triggeredBy` (« quand un autre Altéré s'Éveille »). Émis à l'arrivée d'une carte qui a un Éveil et par l'effet `triggerEveil` (`runEveil`, `triggerBus.ts`)
  | "onUnitTargeted" // Lot 16 — une unité vient d'être DÉSIGNÉE par un effet adverse (`UNIT_TARGETED`) : l'événement porte la cible (`sourceInstanceId`) et son contrôleur (`playerId`). Observateur, avec `triggeredBy` (L'Intangible : « quand un effet adverse cible une autre unité que vous contrôlez »). Balayé par `processUnitTargetedTriggers`
  | "onLandeStrike" // la Lande en jeu VA agir sur les permanents (Vallée de verre : juste avant le coup de fin de tour de table ; Lande qui retire des mots-clés : à l'entame de chaque tour). Fenêtre globale : « ignorez cet effet pour ce permanent » (Zone de repli)
  | "onReasonGained" // le contrôleur vient de récupérer de la Raison GRÂCE À UNE CARTE — jamais la régénération de début de tour (Lot 15 — Survivant de la Mousse)
  | "onArmorGained" // Lot 17 — FAIT DE JOUEUR : un Navire vient de gagner de l'Armure (`ARMOR_CHANGED`, delta > 0). Lu sur les deux plateaux, filtré par `condition.factOf`
  | "onDieResolved" // Lot 17 — FAIT DE JOUEUR : un jet de dé vient d'être résolu, Chaîne fermée (`DIE_RESOLVED`). `dieOutcome` porte son issue ; filtré par `condition.dieOutcomes` / `factOf`
  | "onCardPutUnderDeck" // Lot 17 — FAIT DE JOUEUR : une carte vient d'être placée SOUS la pioche de ce joueur (Meraï, Opalin des Profondeurs)
  | "onExtraCardDrawn" // Lot 17 — FAIT DE JOUEUR : ce joueur vient de piocher EN DEHORS de sa pioche de début de tour (Ylenn, Opalin de la Main close)
  | "onCardLeftGraveyard" // Lot 17 — FAIT DE JOUEUR : une carte vient de quitter le Cimetière de ce joueur, vers n'importe quelle zone (Orram, Opalin des Mémoires)
  | "onLandePlaced" // Lot 17 — FAIT DE JOUEUR : une Lande vient d'arriver dans l'emplacement partagé, posée par ce joueur (Tour de guet mobile)
  | "onChosenOption" // Lot 17 — JAMAIS déclenché par un événement : la capacité n'est qu'une OPTION, proposée par l'effet `chooseAbilityOption` de sa carte (« Choisissez : … »)
  | "onAbilityResolved" // Lot 17 — une carte EN JEU (`sourceInstanceId`) vient de résoudre une capacité déclenchée (`ABILITY_RESOLVED`) : observateur avec `triggeredBy` (Eidolon Opalin LVX)
  | "onDealtDamage" // Lot 17 — une carte EN JEU (`sourceInstanceId`) vient d'INFLIGER des dégâts — combat ou effet : personnel, ou observateur avec `triggeredBy` (Dhar, Opalin du Premier Coup)
  | "onCondition"; // condition arbitraire évaluée par un `ConditionExpression`

/** Issue d'un jet de dé (Lot 17) — une Réussite critique est AUSSI une Réussite. */
export type DieOutcome = "criticalSuccess" | "success" | "failure" | "criticalFailure";

export interface TriggerEvent {
  trigger: TriggerType;
  /** instanceId de l'unité concernée par l'événement, si applicable. */
  sourceInstanceId?: string;
  /** cardId de la carte jouée, pour onPlay / onCardPlayed. */
  cardId?: string;
  playerId?: string;
  /** État de Marée qui vient d'être atteint, pour onTideStateEntered / onTideAnnounced. */
  tideState?: import("@/game/environment/types").TideStateName;
  /** `onEnterPlay` : la carte arrive par INVOCATION et non par une pose depuis la main (ex: un Péon). */
  fromSummon?: boolean;
  /**
   * `onEnterPlay` : ce n'est pas une arrivée mais l'effet d'arrivée d'une
   * carte DÉJÀ en jeu qui est rejoué (`ENTER_EFFECTS_REPEATED`). Lu par
   * `matchesTriggerSource` : invisible des observateurs, sauf `includeRepeatedArrival`.
   */
  repeatedArrival?: boolean;
  /** `onDieResolved` : issue du jet (Lot 17). */
  dieOutcome?: DieOutcome;
  /** `onDiscarded` / `onCardDiscardedFromHand` : propriétaire de la carte défaussée. */
  discardedOwnerId?: string;
  /**
   * `onDeath` : COMMENT la carte est partie (combat, effet, Marée,
   * Sabordage). Lue par `triggeredBy.destroyedBy` — « quand une de vos
   * unités est détruite au combat » ne doit pas voir une destruction par
   * effet.
   */
  destructionCause?: import("@/game/cards/types").DestructionCause;
  /**
   * `onObjectBroken` : l'Objet a été Brisé DEPUIS LA MAIN. Propagé dans
   * `EffectContext.brokenFromHand` par `processTrigger`, sans quoi une
   * capacité déclenchée ne peut pas lire `conditionBrokenFromHand` (ex:
   * Pantalone Sans-Sou, « que vous Brisez directement depuis votre main »).
   */
  fromHand?: boolean;
  /**
   * `onSurvivedDamage` : les coups encaissés pendant l'action, avec leur
   * cause et le joueur dont l'effet les a portés — lus par
   * `triggeredBy.damageCauses` / `damageByController`.
   */
  damage?: Array<{ cause?: import("@/game/cards/types").DestructionCause; byPlayerId?: string }>;
  /** `onCardDiscardedFromHand` : la défausse vient d'un effet de carte, pas de la limite de main. */
  discardByEffect?: boolean;
  /** `onCardDiscardedFromHand` : cette défausse d'effet suit une pioche du même joueur dans la même suite d'effets. */
  discardAfterDraw?: boolean;
  /** `onCardPutIntoGraveyard` : d'où vient la carte — défaussée de la main, ou meulée depuis la pioche. */
  fromZone?: "hand" | "deck";
  /**
   * `onIncomingDirectAttack` : les dégâts directs viennent d'un TIR DE
   * NAVIRE (`fireShipAbility`), pas d'une unité qui attaque. Lu par
   * `condition.attackFromUnit` — « lorsqu'une UNITÉ adverse attaque / inflige
   * des dégâts directs » ne s'ouvre pas sur un tir.
   */
  fromShipShot?: boolean;
  /**
   * Marqueurs que portait la carte concernée (Lot 18) : à son arrivée
   * (`onEnterPlay`), ou juste avant de partir (`onDeath` — elle les a
   * perdus en quittant le plateau, l'événement en garde la photo). Lus par
   * `triggeredBy.withMarker` et par le sous-type qu'un marqueur donne.
   */
  markers?: import("@/game/cards/markers").CardMarkers;
}

/**
 * Une capacité `mode: "optional"` actuellement éligible pour un
 * `TriggerEvent` donné : son contrôleur peut l'activer via une fenêtre de
 * réaction (`game/reactions/`), ou passer. Recalculée à chaque étape
 * plutôt que mise en cache — l'éligibilité (coût payable, cible
 * disponible) peut changer entre deux étapes de la même fenêtre.
 */
export interface PendingReactionCandidate {
  controllerId: string;
  sourceInstanceId: string;
  /** Carte à l'origine de l'événement déclencheur, pour les capacités d'observateur (cible `triggerSource`) — `undefined` pour un déclenchement personnel. */
  triggerSourceInstanceId?: string;
  cardId: string;
  /** Index de la capacité dans `CardDefinition.abilities` — identifie précisément laquelle activer. */
  abilityIndex: number;
  /** Coût en Raison à payer pour activer cette capacité (0 si aucun). */
  reasonCost: number;
  /**
   * `true` : l'Objet réactif est encore EN MAIN (règle du 29/09/2026,
   * `isBreakReaction`). L'activer le Brise depuis la main — `reasonCost`
   * inclut alors `handBreakCost` — sans qu'il ait jamais pris de Slot.
   */
  fromHand?: boolean;
  /**
   * Coût en ANCRAGE (0 si aucun). Contrairement au coût en Raison, il
   * écarte la capacité quand le joueur ne peut pas le payer en restant en
   * vie : la coque n'a pas de découvert (cf. `TriggeredAbility.cost`).
   */
  anchorCost?: number;
  /**
   * `true` si au moins un de ses effets cible `chosenUnit` :
   * `activateReaction` doit alors recevoir un `targetInstanceId` LÉGAL au
   * regard du filtre de l'effet (`ChosenUnitFilter`) — un candidat n'est
   * recensé que si une telle cible existe.
   */
  needsTarget: boolean;
  /**
   * `true` si la capacité repêche au Cimetière ET qu'au moins une carte y
   * est éligible : `activateReaction` doit alors recevoir un
   * `chosenGraveyardInstanceId` LÉGAL (ex: Tu m'avais promis, Lot 13).
   *
   * Séparé de `needsTarget` : ce sont deux questions différentes posées au
   * joueur, l'une sur le plateau, l'autre dans son Cimetière, et une même
   * carte pourrait un jour poser les deux.
   */
  needsGraveyardTarget: boolean;
}
