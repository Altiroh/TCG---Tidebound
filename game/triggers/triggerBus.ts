import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import { isVisibleDuringTide, UNIT_CARD_TYPES, type CardInstance, type TriggeredAbility, type TriggerSourceFilter } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { hasGraveyardArrival, resolveEffect, revealRandomHandCards } from "@/game/effects/resolveEffect";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import type { GameEvent } from "@/game/events/types";
import { applyCardPlayedAnomalies, applyPermanentLeftAnomalies } from "@/game/state/anomalies";
import { chosenTargetRequirement, eligibleChosenUnits } from "@/game/effects/chosenTargets";
import { graveyardChoicesFor } from "@/game/effects/graveyardChoices";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import { chromaticColorsOf } from "@/game/rules/chromatic";
import { consumeOpponentReactionRevealShield, payReasonCost } from "@/game/state/shields";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";
import type { PendingReactionCandidate, TriggerEvent } from "@/game/triggers/types";

interface TriggeredWork {
  effects: EffectDefinition[];
  context: EffectContext;
  /** Toujours renseignés : réutilisés par `collectReactionCandidates` pour identifier précisément une capacité `optional`. */
  cardId: string;
  abilityIndex: number;
  ability: TriggeredAbility;
}

/** Une unité rendue inactive par la Marée ne peut pas utiliser ses capacités (sauf onDeath : mourir n'est pas "utiliser une capacité"). */
function isInactive(state: GameState, unit: CardInstance): boolean {
  return computeEffectiveStats(unit, state.environment.tideState).inactive;
}

/**
 * Déclencheurs de DÉPART, plus la révélation elle-même : partir ou se
 * découvrir n'est pas « agir », donc le masquage ne les bloque pas.
 */
const TRIGGERS_HORS_MASQUAGE = new Set(["onDeath", "onSaborde", "onExpire", "onTideStateExited", "onBecomeVisible"]);

/**
 * Une carte MASQUÉE par la Marée est inactive : ses capacités ne se
 * déclenchent pas (grammaire des Structures, 21/09/2026).
 *
 * Avant cette règle, le masquage ne bloquait rien — il fallait que chaque
 * capacité déclare `condition: { selfVisible: true }` ou que chacun de ses
 * effets porte `conditionSelfVisible`. Le catalogue le faisait bien, mais
 * par discipline : rien n'empêchait une nouvelle carte d'agir masquée sans
 * que personne ne le remarque. La règle est désormais tenue par le moteur,
 * et l'exception doit se déclarer — `hiddenReaction`.
 */
function blocqueParMasquage(state: GameState, unit: CardInstance, ability: TriggeredAbility): boolean {
  if (ability.hiddenReaction) return false;
  if (TRIGGERS_HORS_MASQUAGE.has(ability.trigger)) return false;
  return !isVisibleDuringTide(getCardDefinition(unit.cardId), state.environment.tideState);
}

/**
 * Ordre de résolution des déclenchements automatiques simultanés (cadrage
 * "Mécaniques verrouillées", règle verrouillée) : les effets automatiques
 * du joueur actif se résolvent avant ceux de l'adversaire, puis par ordre
 * d'arrivée sur le plateau au sein d'un même joueur (ordre naturel du
 * tableau `board`, jamais réordonné). Même convention appliquée à l'ordre
 * dans lequel les réactions facultatives sont proposées (fenêtre de
 * réaction, `game/reactions/`).
 */
function playersActiveFirst(state: GameState): PlayerState[] {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const others = state.players.filter((p) => p.id !== state.activePlayerId);
  return active ? [active, ...others] : [...state.players];
}

function work(
  ability: TriggeredAbility,
  abilityIndex: number,
  cardId: string,
  controllerId: PlayerId,
  sourceInstanceId: string,
  turnNumber: number,
  /** Carte à l'origine de l'événement, pour les capacités d'observateur (cible `triggerSource`). */
  triggerSourceInstanceId?: string
): TriggeredWork {
  return {
    effects: ability.effects,
    context: { controllerId, sourceInstanceId, turnNumber, triggerSourceInstanceId },
    cardId,
    abilityIndex,
    ability,
  };
}


/** `condition.tideStateIn` : la Marée est-elle dans l'un des états requis par la capacité ? (Toujours vrai sans condition.) */
function matchesTideCondition(state: GameState, ability: TriggeredAbility): boolean {
  const allowed = ability.condition?.tideStateIn;
  return !allowed || allowed.includes(state.environment.tideState);
}

/**
 * `condition.controlsAnyCardIds` : le contrôleur a-t-il l'une de ces cartes
 * en jeu ? Évalué AVANT la consommation de `oncePerTurnKey`, pour qu'un
 * déclenchement qui ne remplit pas la condition ne brûle pas l'unique usage
 * du tour (ex: La Quête du Grand Nénuphar sans son Destrier).
 */
function matchesControlCondition(
  state: GameState,
  ability: TriggeredAbility,
  controllerId: PlayerId,
  /** Porteuse de la capacité — requise par `condition.selfVisible`. */
  sourceInstanceId?: string,
  /** Carte qui a déclenché la capacité — requise par les conditions qui la regardent (Lot 15). */
  triggerSourceInstanceId?: string
): boolean {
  if (!matchesLot15Condition(state, ability, controllerId, sourceInstanceId, triggerSourceInstanceId)) return false;
  if (ability.condition?.selfVisible) {
    const holder = sourceInstanceId ? findBoardUnit(state, sourceInstanceId) : undefined;
    if (!holder || !isVisibleDuringTide(getCardDefinition(holder.unit.cardId), state.environment.tideState)) return false;
  }
  // « Réaction cachée » : complément exact de `selfVisible`. Sans elle, une
  // carte portant les deux textes proposerait les deux en même temps.
  const seuil = ability.condition?.attackerPowerAtLeast;
  if (seuil !== undefined && (state.pendingAttack?.attackerPower ?? 0) < seuil) return false;
  if (ability.condition?.selfHidden) {
    const holder = sourceInstanceId ? findBoardUnit(state, sourceInstanceId) : undefined;
    if (!holder || isVisibleDuringTide(getCardDefinition(holder.unit.cardId), state.environment.tideState)) return false;
    // RÉVÉLÉE = plus un secret (21/09/2026). Révéler retire la dissimulation,
    // pas le masquage : la carte reste inactive tant que la Marée la cache,
    // mais elle ne peut plus se « révéler » une seconde fois.
    //
    // Sans cette garde, un piège qui RESTE en jeu après s'être révélé — Filet
    // à la Dérive, Le Filet qui Respire — reproposait sa réaction à CHAQUE
    // attaque, indéfiniment : 43 fenêtres de réaction par partie, mesurées.
    // Ceux qui se détruisent ou se Sabordent ne montraient pas le problème.
    if (holder.unit.revealed) return false;
  }
  const handAtLeast = ability.condition?.controllerHandAtLeast;
  if (handAtLeast !== undefined) {
    const holder = state.players.find((p) => p.id === controllerId);
    if (!holder || holder.hand.length < handAtLeast) return false;
  }
  // « si l'adversaire contrôle au moins N unités » : la porte anti-swarm.
  // Posée sur la CAPACITÉ et non sur un effet, elle épargne le
  // `oncePerTurnKey` — une carte qui brûle son unique usage du tour contre
  // un plateau trop étroit pour qu'elle serve ne punit rien.
  const seuilUnites = ability.condition?.opponentUnitsAtLeast;
  if (seuilUnites !== undefined) {
    const adversaire = state.players.find((p) => p.id !== controllerId);
    const unites = (adversaire?.board ?? []).filter((u) => UNIT_CARD_TYPES.includes(getCardDefinition(u.cardId).type));
    if (unites.length < seuilUnites) return false;
  }
  const handAtMost = ability.condition?.controllerHandAtMost;
  if (handAtMost !== undefined) {
    const holder = state.players.find((p) => p.id === controllerId);
    if (!holder || holder.hand.length > handAtMost) return false;
  }
  // « si l'adversaire contrôle plus d'unités que vous » : une comparaison,
  // pas un seuil — la carte ne s'arme que quand on est en retard.
  if (ability.condition?.opponentUnitsMoreThanController) {
    const moi = state.players.find((p) => p.id === controllerId);
    const adversaire = state.players.find((p) => p.id !== controllerId);
    const unites = (board: readonly CardInstance[] | undefined) =>
      (board ?? []).filter((u) => UNIT_CARD_TYPES.includes(getCardDefinition(u.cardId).type)).length;
    if (unites(adversaire?.board) <= unites(moi?.board)) return false;
  }
  const seuilAttaques = ability.condition?.opponentAttacksThisTurnAtLeast;
  if (seuilAttaques !== undefined) {
    const adversaire = state.players.find((p) => p.id !== controllerId);
    if ((adversaire?.attacksDeclaredThisTurn ?? 0) < seuilAttaques) return false;
  }
  const arrival = ability.condition?.graveyardArrival;
  if (arrival && !hasGraveyardArrival(state, controllerId, arrival)) return false;
  const required = ability.condition?.controlsAnyCardIds;
  if (!required) return true;
  const controller = state.players.find((p) => p.id === controllerId);
  return Boolean(controller?.board.some((unit) => required.includes(unit.cardId)));
}

/**
 * Conditions de capacité ouvertes par le Lot 15. Même règle que les autres :
 * évaluées AVANT que `oncePerTurnKey` ne soit consommé.
 */
function matchesLot15Condition(
  state: GameState,
  ability: TriggeredAbility,
  controllerId: PlayerId,
  sourceInstanceId: string | undefined,
  triggerSourceInstanceId: string | undefined
): boolean {
  const condition = ability.condition;
  if (!condition) return true;
  // « pendant votre tour » / « pendant chacun de vos tours ».
  if (condition.duringOwnTurn && state.activePlayerId !== controllerId) return false;
  const moi = state.players.find((p) => p.id === controllerId);
  const adversaire = state.players.find((p) => p.id !== controllerId);
  // « si vous contrôlez au moins N AUTRES unités » (Le Déserteur Gris).
  if (condition.controllerOtherUnitsAtLeast !== undefined) {
    const autres = (moi?.board ?? []).filter(
      (u) => u.instanceId !== sourceInstanceId && UNIT_CARD_TYPES.includes(getCardDefinition(u.cardId).type)
    ).length;
    if (autres < condition.controllerOtherUnitsAtLeast) return false;
  }
  // « si votre Navire a moins d'Ancrage que le Navire adverse ».
  if (condition.controllerAnchorBelowOpponent && !((moi?.anchor ?? 0) < (adversaire?.anchor ?? 0))) return false;
  // « À son arrivée par Assemblage ».
  if (condition.selfArrivedByAssemblage) {
    const porteuse = sourceInstanceId ? findBoardUnit(state, sourceInstanceId) : undefined;
    if (!porteuse?.unit.arrivedByAssemblage) return false;
  }
  // « une Sentinelle d'une couleur que vous ne contrôliez pas encore » : la
  // carte déclencheuse apporte une couleur qu'aucune AUTRE carte ne porte.
  if (condition.triggerSourceBringsNewChromaticColor) {
    const arrivee = triggerSourceInstanceId ? findBoardUnit(state, triggerSourceInstanceId) : undefined;
    if (!arrivee || !moi) return false;
    const siennes = chromaticColorsOf(arrivee.unit, moi.board);
    const dejaLa = new Set(
      moi.board.filter((u) => u.instanceId !== arrivee.unit.instanceId).flatMap((u) => chromaticColorsOf(u, moi.board))
    );
    for (const claim of moi.claimedChromaticColors ?? []) {
      if (state.turnNumber <= claim.expiresAfterTurn) dejaLa.add(claim.color);
    }
    if (!siennes.some((color) => !dejaLa.has(color))) return false;
  }
  // « devrait être détruite PAR DES DÉGÂTS » : ni un effet de destruction,
  // ni un Sabordage, ni la Marée qui l'emporte directement.
  if (condition.triggerSourceDoomedByDamage) {
    const condamnee = triggerSourceInstanceId ? findBoardUnit(state, triggerSourceInstanceId) : undefined;
    if (!condamnee || condamnee.unit.pendingRemoval) return false;
    const proprietaire = state.players.find((p) => p.id === condamnee.playerId)!;
    const stats = computeEffectiveStats(condamnee.unit, state.environment.tideState, {
      controllerBoard: proprietaire.board,
      controllerReason: proprietaire.reason,
      tideOrientation: state.environment.tideOrientation,
      controllerIsActive: state.activePlayerId === proprietaire.id,
    });
    if (stats.destroyedByTide || condamnee.unit.damageMarked < stats.health) return false;
  }
  return true;
}

/**
 * Où se lit — et s'inscrit — le « une fois par tour » d'une capacité : sur
 * sa porteuse, ou sur la carte DÉCLENCHEUSE quand le texte dit « chacune de
 * vos unités » (`oncePerTurnPerTriggerSource`). La clé est alors préfixée
 * par la porteuse, pour que deux porteuses ne se partagent pas la marque.
 */
function oncePerTurnSlot(
  ability: TriggeredAbility,
  holderInstanceId: string | undefined,
  triggerSourceInstanceId: string | undefined
): { instanceId: string; key: string } | undefined {
  const key = ability.oncePerTurnKey;
  if (!key) return undefined;
  if (ability.oncePerTurnPerTriggerSource) {
    if (!triggerSourceInstanceId || !holderInstanceId) return undefined;
    return { instanceId: triggerSourceInstanceId, key: `${holderInstanceId}:${key}` };
  }
  return holderInstanceId ? { instanceId: holderInstanceId, key } : undefined;
}

/** La capacité est-elle encore disponible ce tour-ci, là où son « une fois par tour » se lit ? */
function oncePerTurnSlotAvailable(
  state: GameState,
  ability: TriggeredAbility,
  holderInstanceId: string | undefined,
  triggerSourceInstanceId: string | undefined,
  turnNumber: number
): boolean {
  const slot = oncePerTurnSlot(ability, holderInstanceId, triggerSourceInstanceId);
  if (!slot) return !ability.oncePerTurnKey || !ability.oncePerTurnPerTriggerSource;
  const found = findBoardUnit(state, slot.instanceId);
  return found ? oncePerTurnAvailable(found.unit, slot.key, turnNumber) : false;
}

/** Inscrit le « une fois par tour » là où il se lit. Sans objet si la carte a quitté le plateau. */
function markOncePerTurnSlot(
  state: GameState,
  ability: TriggeredAbility,
  holderInstanceId: string | undefined,
  triggerSourceInstanceId: string | undefined,
  turnNumber: number
): GameState {
  const slot = oncePerTurnSlot(ability, holderInstanceId, triggerSourceInstanceId);
  if (!slot) return state;
  const found = findBoardUnit(state, slot.instanceId);
  if (!found) return state;
  return markUnitOncePerTurn(state, found.playerId, found.unit.instanceId, slot.key, turnNumber, ability.onceEver);
}

/**
 * La carte qui vient d'arriver/de mourir (portée par `event`) correspond-
 * elle au filtre d'une capacité d'OBSERVATEUR, vue depuis `holder` ?
 */
function matchesTriggerSource(
  filter: TriggerSourceFilter,
  event: TriggerEvent,
  holder: CardInstance,
  holderControllerId: PlayerId
): boolean {
  if ((filter.excludeSelf ?? true) && event.sourceInstanceId === holder.instanceId) return false;
  if (filter.opponentOnly) {
    if (event.playerId === holderControllerId) return false;
  } else if ((filter.sameController ?? true) && event.playerId !== holderControllerId) {
    return false;
  }
  if (filter.onlySummoned && !event.fromSummon) return false;
  // « depuis votre main » : la provenance du Bris écarte la capacité avant
  // tout marquage « une fois par tour » (cf. `TriggerSourceFilter.fromHand`).
  if (filter.fromHand !== undefined && filter.fromHand !== Boolean(event.fromHand)) return false;
  // « détruite au combat » : sans cause portée par l'événement, le filtre ne
  // matche pas — mieux vaut ne pas se déclencher que se déclencher à tort.
  if (filter.destroyedBy && !(event.destructionCause && filter.destroyedBy.includes(event.destructionCause))) return false;
  // "Quand IL attaque" sur un Équipement : l'événement vise le permanent
  // équipé, pas l'Équipement lui-même (qui, lui, n'attaque jamais).
  if (filter.equippedUnit && event.sourceInstanceId !== holder.attachedToInstanceId) return false;
  // Les filtres par identité de carte n'ont de sens que si l'événement la
  // porte (`onAttack` ne la porte pas) : sans elle, ils ne matchent pas.
  if (filter.cardIds && !(event.cardId && filter.cardIds.includes(event.cardId))) return false;
  if (filter.archetype && !(event.cardId && getCardDefinition(event.cardId).archetype === filter.archetype)) return false;
  // Même logique pour le sous-type (Lot 11, « une autre Marionnette alliée »).
  if (filter.subtype && !(event.cardId && getCardDefinition(event.cardId).subtype === filter.subtype)) return false;
  // « quand une Structure... » : type de la carte déclencheuse.
  if (filter.cardTypes && !(event.cardId && filter.cardTypes.includes(getCardDefinition(event.cardId).type))) return false;
  // « des dégâts infligés par l'un de VOS effets » (Maître Verrier, Pont de
  // Verre) : au moins un des coups encaissés doit remplir les deux filtres.
  if (filter.damageCauses || filter.damageByController) {
    const coups = event.damage ?? [];
    const retenu = coups.some(
      (coup) =>
        (!filter.damageCauses || (coup.cause !== undefined && filter.damageCauses.includes(coup.cause))) &&
        (!filter.damageByController || coup.byPlayerId === holderControllerId)
    );
    if (!retenu) return false;
  }
  // « par un effet de carte » : la limite de main en fin de tour n'en est pas un.
  if (filter.discardByEffect && !event.discardByEffect) return false;
  return true;
}

/**
 * Capacités d'OBSERVATEUR concernées par cet événement : celles qui, sur
 * un permanent DÉJÀ en jeu, réagissent à ce qui arrive à une autre carte
 * ("un autre Cra-Poiscail arrive en jeu", "un Cra-Poiscail que vous
 * contrôlez est détruit"). Complète le déclenchement "personnel"
 * historique, qui ne concerne que la carte visée par l'événement.
 */
function collectObserverWork(
  state: GameState,
  event: TriggerEvent,
  turnNumber: number,
  mode: "auto" | "optional"
): TriggeredWork[] {
  const result: TriggeredWork[] = [];
  for (const player of playersActiveFirst(state)) {
    for (const holder of player.board) {
      if (isInactive(state, holder)) continue;
      const def = getCardDefinition(holder.cardId);
      (def.abilities ?? []).forEach((ability, abilityIndex) => {
        if (ability.trigger !== event.trigger || (ability.mode ?? "auto") !== mode) return;
        if (blocqueParMasquage(state, holder, ability)) return;
        if (!ability.triggeredBy || !matchesTideCondition(state, ability)) return;
        if (!matchesTriggerSource(ability.triggeredBy, event, holder, player.id)) return;
        // "La première fois à chaque tour" : la capacité disparaît des
        // candidats une fois consommée ce tour-ci (le marquage, lui, se
        // fait à la résolution — cf. `processTrigger`). Lue sur la porteuse,
        // ou sur la déclencheuse pour « chacune de vos unités ».
        if (!oncePerTurnSlotAvailable(state, ability, holder.instanceId, event.sourceInstanceId, turnNumber)) return;
        result.push(work(ability, abilityIndex, def.id, player.id, holder.instanceId, turnNumber, event.sourceInstanceId));
      });
    }
  }
  return result;
}

/**
 * Rassemble les capacités concernées par un `TriggerEvent` donné, pour le
 * `mode` demandé — "auto" (comportement historique, résolution
 * automatique) ou "optional" (réactions facultatives, jamais résolues
 * ici : seulement recensées, voir `collectReactionCandidates`).
 */
function collectTriggeredWork(
  state: GameState,
  event: TriggerEvent,
  turnNumber: number,
  mode: "auto" | "optional"
): TriggeredWork[] {
  const result: TriggeredWork[] = [];
  const matchesMode = (ability: TriggeredAbility) => (ability.mode ?? "auto") === mode && matchesTideCondition(state, ability);

  if (event.trigger === "onDeath" || event.trigger === "onSaborde" || event.trigger === "onExpire") {
    // L'unité est déjà retirée du plateau au moment où cet événement est
    // émis : on résout ses capacités à partir des infos portées par
    // l'événement lui-même — y compris les FACULTATIVES (décision du
    // 17/09/2026 : « jamais automatique, le joueur choisit, et il peut
    // choisir de ne pas appliquer un effet »). Une carte morte peut donc
    // proposer sa réaction depuis le cimetière, et son observateur encore
    // en jeu la proposer aussi.
    if (!event.cardId || !event.playerId || !event.sourceInstanceId) return result;
    const def = getCardDefinition(event.cardId);
    (def.abilities ?? []).forEach((ability, abilityIndex) => {
      // Capacité personnelle uniquement : `triggeredBy` désigne une AUTRE
      // carte, elle est traitée par `collectObserverWork` juste après.
      if (ability.trigger !== event.trigger || !matchesMode(ability) || ability.triggeredBy) return;
      result.push(work(ability, abilityIndex, def.id, event.playerId!, event.sourceInstanceId!, turnNumber));
    });
    result.push(...collectObserverWork(state, event, turnNumber, mode));
    return result;
  }

  if (event.trigger === "onDiscarded") {
    // Même cas de figure que `onDeath` : la carte n'est plus là où on
    // pourrait la lire. Elle n'a même JAMAIS été sur le plateau — elle est
    // passée de la main au Cimetière — donc sa capacité se lit sur sa
    // définition, à partir de ce que l'événement porte.
    if (!event.cardId || !event.playerId || !event.sourceInstanceId) return result;
    const def = getCardDefinition(event.cardId);
    (def.abilities ?? []).forEach((ability, abilityIndex) => {
      if (ability.trigger !== "onDiscarded" || !matchesMode(ability) || ability.triggeredBy) return;
      result.push(work(ability, abilityIndex, def.id, event.playerId!, event.sourceInstanceId!, turnNumber));
    });
    result.push(...collectObserverWork(state, event, turnNumber, mode));
    return result;
  }

  // `onCombatVsGarde` suit la même lecture : ses capacités vivent sur le
  // plateau du joueur NOMMÉ par l'événement (celui dont l'unité fait face à
  // la Garde), et `sourceInstanceId` — son unité au combat — devient la
  // carte déclencheuse (`triggerSource`).
  if (
    event.trigger === "onIncomingDirectAttack" ||
    event.trigger === "onUnitAttackDeclared" ||
    event.trigger === "onCombatVsGarde"
  ) {
    // Fenêtre d'INTERCEPTION : la capacité se lit sur le plateau du
    // DÉFENSEUR (`event.playerId`), jamais sur l'attaquant — alors que
    // `event.sourceInstanceId` désigne justement l'attaquant, pour que le
    // piège puisse le viser. Sans cette branche dédiée, l'événement tombait
    // dans le déclenchement « personnel » plus bas et cherchait le piège sur
    // la carte qui frappe.
    if (!event.playerId) return result;
    const defenseur = state.players.find((p) => p.id === event.playerId);
    if (!defenseur) return result;

    for (const unit of defenseur.board) {
      if (isInactive(state, unit)) continue;
      const def = getCardDefinition(unit.cardId);
      (def.abilities ?? []).forEach((ability, abilityIndex) => {
        if (ability.trigger !== event.trigger || !matchesMode(ability)) return;
        if (blocqueParMasquage(state, unit, ability)) return;
        if (ability.oncePerTurnKey && !oncePerTurnAvailable(unit, ability.oncePerTurnKey, turnNumber)) return;
        result.push(work(ability, abilityIndex, def.id, defenseur.id, unit.instanceId, turnNumber, event.sourceInstanceId));
      });
    }
    return result;
  }

  // `onReasonGained` : un fait du JOUEUR, pas d'une carte — ses capacités se
  // lisent sur tout son plateau, comme un début ou une fin de tour.
  if (event.trigger === "startOfTurn" || event.trigger === "endOfTurn" || event.trigger === "onReasonGained") {
    if (!event.playerId) return result;
    const player = state.players.find((p) => p.id === event.playerId);
    if (!player) return result;

    for (const unit of player.board) {
      if (isInactive(state, unit)) continue;
      const def = getCardDefinition(unit.cardId);
      (def.abilities ?? []).forEach((ability, abilityIndex) => {
        if (ability.trigger !== event.trigger || !matchesMode(ability)) return;
        if (blocqueParMasquage(state, unit, ability)) return;
        // « La première fois à chaque tour » : indispensable en mode
        // `optional`, où le marquage n'a lieu qu'à l'ACTIVATION
        // (`resolveReaction`) et non au recensement — sans elle, la
        // capacité est reproposée à chaque fenêtre du tour.
        if (ability.oncePerTurnKey && !oncePerTurnAvailable(unit, ability.oncePerTurnKey, turnNumber)) return;
        result.push(work(ability, abilityIndex, def.id, player.id, unit.instanceId, turnNumber));
      });
    }
    return result;
  }

  if (event.trigger === "onCardPlayed") {
    for (const player of playersActiveFirst(state)) {
      for (const unit of player.board) {
        if (isInactive(state, unit)) continue;
        const def = getCardDefinition(unit.cardId);
        (def.abilities ?? []).forEach((ability, abilityIndex) => {
          if (ability.trigger !== "onCardPlayed" || !matchesMode(ability)) return;
          if (blocqueParMasquage(state, unit, ability)) return;
          // « La première fois à chaque tour » : indispensable en mode
        // `optional`, où le marquage n'a lieu qu'à l'ACTIVATION
        // (`resolveReaction`) et non au recensement — sans elle, la
        // capacité est reproposée à chaque fenêtre du tour.
        if (ability.oncePerTurnKey && !oncePerTurnAvailable(unit, ability.oncePerTurnKey, turnNumber)) return;
          result.push(work(ability, abilityIndex, def.id, player.id, unit.instanceId, turnNumber));
        });
      }
    }
    return result;
  }

  if (event.trigger === "onTideStateEntered" || event.trigger === "onTideStateExited" || event.trigger === "onTideAnnounced") {
    for (const player of playersActiveFirst(state)) {
      for (const unit of player.board) {
        const def = getCardDefinition(unit.cardId);
        (def.abilities ?? []).forEach((ability, abilityIndex) => {
          if (ability.trigger !== event.trigger || !matchesMode(ability)) return;
          if (blocqueParMasquage(state, unit, ability)) return;
          if (ability.condition?.tideState && ability.condition.tideState !== event.tideState) return;
          // « La première fois à chaque tour » : indispensable en mode
        // `optional`, où le marquage n'a lieu qu'à l'ACTIVATION
        // (`resolveReaction`) et non au recensement — sans elle, la
        // capacité est reproposée à chaque fenêtre du tour.
        if (ability.oncePerTurnKey && !oncePerTurnAvailable(unit, ability.oncePerTurnKey, turnNumber)) return;
          result.push(work(ability, abilityIndex, def.id, player.id, unit.instanceId, turnNumber));
        });
      }
    }
    return result;
  }

  // onAttack / onDamaged / onEnterPlay : déclenchement "personnel", limité
  // à l'unité concernée par l'événement...
  if (event.sourceInstanceId) {
    for (const player of state.players) {
      const unit = player.board.find((u) => u.instanceId === event.sourceInstanceId);
      if (!unit || isInactive(state, unit)) continue;
      const def = getCardDefinition(unit.cardId);
      (def.abilities ?? []).forEach((ability, abilityIndex) => {
        if (ability.trigger !== event.trigger || !matchesMode(ability) || ability.triggeredBy) return;
        if (blocqueParMasquage(state, unit, ability)) return;
        // "La première fois à chaque tour" : même garde que pour les
        // observateurs. Indispensable en mode "optional", où le marquage
        // n'a lieu qu'à l'activation (`resolveReaction`) et non au
        // recensement — sans elle, la capacité serait reproposée à chaque
        // fenêtre du tour.
        if (ability.oncePerTurnKey && !oncePerTurnAvailable(unit, ability.oncePerTurnKey, turnNumber)) return;
        result.push(work(ability, abilityIndex, def.id, player.id, unit.instanceId, turnNumber));
      });
    }
  }

  // ...plus les OBSERVATEURS déjà en jeu qui réagissent à ce qui vient
  // d'arriver à cette carte-là.
  result.push(...collectObserverWork(state, event, turnNumber, mode));

  return result;
}


/** Localise un permanent sur le plateau de son contrôleur — `undefined` s'il l'a déjà quitté. */
function findBoardUnit(state: GameState, instanceId: string): { unit: CardInstance; playerId: PlayerId } | undefined {
  for (const player of state.players) {
    const unit = player.board.find((u) => u.instanceId === instanceId);
    if (unit) return { unit, playerId: player.id };
  }
  return undefined;
}

function markUnitOncePerTurn(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  key: string,
  turnNumber: number,
  onceEver = false
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? { ...p, board: p.board.map((u) => (u.instanceId === instanceId ? markOncePerTurnUsed(u, key, turnNumber, onceEver) : u)) }
        : p
    ) as [PlayerState, PlayerState],
  };
}

/**
 * Puissance effective de chaque unité en jeu, par `instanceId`.
 *
 * Sert de photo avant/après pour détecter les gains de Puissance
 * (`onPowerGained`). On passe par les stats EFFECTIVES — et non par les
 * seuls buffs posés — parce que le design veut le déclencheur large
 * (décision du 2026-09-14) : un Porte-Étendard qui arrive, un banc qui
 * atteint son seuil ou une Marée qui change de sens font "gagner de la
 * Puissance" tout autant qu'un buff explicite, et rien de tout cela
 * n'émet d'événement.
 */
export function snapshotEffectivePower(state: GameState): Map<string, number> {
  const snapshot = new Map<string, number>();
  for (const player of state.players) {
    for (const unit of player.board) {
      snapshot.set(
        unit.instanceId,
        computeEffectiveStats(unit, state.environment.tideState, {
          controllerBoard: player.board,
          controllerReason: player.reason,
          tideOrientation: state.environment.tideOrientation,
          controllerIsActive: state.activePlayerId === player.id,
        }).attack
      );
    }
  }
  return snapshot;
}

/**
 * Compare une photo de Puissance à l'état courant et déclenche
 * `onPowerGained` pour chaque carte qui a gagné du terrain. Appelée une
 * seule fois par action (`game/engine.ts`) : les bonus que ces capacités
 * posent à leur tour ne relancent pas de comparaison, ce qui borne
 * naturellement la chaîne.
 */
export function processPowerGains(
  state: GameState,
  before: Map<string, number>,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const after = snapshotEffectivePower(state);
  let nextState = state;
  const events: GameEvent[] = [];

  for (const [instanceId, power] of after) {
    const owner = nextState.players.find((p) => p.board.some((u) => u.instanceId === instanceId));
    const unit = owner?.board.find((u) => u.instanceId === instanceId);
    if (!owner || !unit) continue;

    // Référence : sa Puissance au tour précédent si elle était déjà là,
    // sinon sa Puissance IMPRIMÉE. Une carte qui arrive déjà renforcée —
    // un Péon que la Bannière accueille, une créature qui atterrit sous un
    // Porte-Étendard — a bien gagné de la Puissance, elle aussi.
    const printed = computeEffectiveStats({ ...unit, modifiers: [] }, nextState.environment.tideState).attack;
    const previous = before.get(instanceId) ?? printed;
    if (power <= previous) continue;

    const result = processTrigger(
      nextState,
      { trigger: "onPowerGained", playerId: owner.id, cardId: unit.cardId, sourceInstanceId: instanceId },
      turnNumber,
      1
    );
    nextState = result.state;
    events.push(...result.events);
  }

  return { state: nextState, events };
}

/**
 * Réveille les capacités d'arrivée pour chaque carte INVOQUÉE par les
 * événements donnés (`SUMMON`). Les invocations ne passent pas par
 * `playCard` : sans ce relais, un Péon apparaîtrait sans que personne ne
 * le "voie" arriver. Appelée par les actions qui résolvent des effets
 * (pose, Bris) et par `processTrigger` lui-même.
 */
export function processSummonEnterTriggers(
  state: GameState,
  events: readonly GameEvent[],
  turnNumber: number,
  depth = 1
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const produced: GameEvent[] = [];

  for (const event of events) {
    // Une arrivée REJOUÉE (`ENTER_EFFECTS_REPEATED`, Colombina) rallume les
    // mêmes capacités qu'une invocation — sans être une invocation : les
    // filtres « seulement invoqué » ne la voient pas.
    if (event.type !== "SUMMON" && event.type !== "ENTER_EFFECTS_REPEATED") continue;
    const result = processTrigger(
      nextState,
      {
        trigger: "onEnterPlay",
        playerId: event.playerId,
        cardId: event.cardId,
        sourceInstanceId: event.instanceId,
        fromSummon: event.type === "SUMMON",
      },
      turnNumber,
      depth
    );
    nextState = result.state;
    produced.push(...result.events);
  }

  return { state: nextState, events: produced };
}

/**
 * Déclenchements « une Marionnette revient dans votre main » (Lot 11).
 *
 * Même forme que `processSummonEnterTriggers`, et pour la même raison : le
 * retour en main est décidé dans `resolveEffect`, qui ne peut pas appeler
 * `processTrigger` (ce module importe déjà la résolution d'effets, la
 * dépendance inverse serait circulaire). L'appelant qui vient de résoudre
 * des effets passe donc les événements produits ici, et ce balayage réveille
 * les capacités qui guettent un retour.
 *
 * Un `CARD_MOVED` board → hand est le seul signal : il est émis une fois par
 * carte renvoyée, quelle que soit la carte qui l'a provoqué.
 */
export function processReturnedToHandTriggers(
  state: GameState,
  events: readonly GameEvent[],
  turnNumber: number,
  depth = 1
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const produced: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== "CARD_MOVED" || event.fromZone !== "board" || event.toZone !== "hand") continue;

    // La carte n'est plus sur le board : c'est l'événement qui porte son
    // identité et son propriétaire, précisément pour ce cas.
    if (!event.cardId || !event.ownerId) continue;

    const result = processTrigger(
      nextState,
      { trigger: "onReturnedToHand", playerId: event.ownerId, cardId: event.cardId, sourceInstanceId: event.instanceId },
      turnNumber,
      depth
    );
    nextState = result.state;
    produced.push(...result.events);
  }

  return { state: nextState, events: produced };
}

/**
 * Déclenchements de DÉFAUSSE (Lot 13), à partir des `CARD_MOVED`
 * main → Cimetière produits par `game/state/discard.ts`.
 *
 * Deux déclencheurs pour un même geste, et ils ne se recouvrent pas :
 *
 *   - `onDiscarded` est PERSONNEL — « quand cette carte est défaussée »,
 *     lu sur la définition de la carte partie (P'tit Bout) ;
 *   - `onCardDiscardedFromHand` est un déclencheur d'OBSERVATEUR — « une
 *     carte rejoint votre Cimetière depuis votre main », pour ce qui est
 *     en jeu et regarde (Cache-Cache, La Marelle). Il se filtre avec
 *     `triggeredBy` comme n'importe quel observateur.
 *
 * Même forme et même raison que `processReturnedToHandTriggers` : la
 * défausse est décidée ailleurs, l'appelant repasse ici les événements.
 */
export function processDiscardedFromHandTriggers(
  state: GameState,
  events: readonly GameEvent[],
  turnNumber: number,
  depth = 1
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const produced: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== "CARD_MOVED" || event.fromZone !== "hand" || event.toZone !== "graveyard") continue;
    if (!event.cardId || !event.ownerId) continue;

    for (const trigger of ["onDiscarded", "onCardDiscardedFromHand"] as const) {
      const result = processTrigger(
        nextState,
        {
          trigger,
          playerId: event.ownerId,
          cardId: event.cardId,
          sourceInstanceId: event.instanceId,
          discardedOwnerId: event.ownerId,
          ...(event.discardByEffect ? { discardByEffect: true } : {}),
        },
        turnNumber,
        depth
      );
      nextState = result.state;
      produced.push(...result.events);
    }
  }

  return { state: nextState, events: produced };
}

/**
 * Déclenchements de RÉCUPÉRATION (Lot 13) : « la première fois à chaque
 * tour que vous récupérez une carte depuis votre Cimetière… » (Maman
 * revient). Un `CARD_MOVED` Cimetière → main est le seul signal, quelle que
 * soit la carte qui l'a provoqué.
 *
 * Purement observateur : la carte récupérée est en main, pas en jeu — il
 * n'y a personne à réveiller de son côté, seulement ceux qui regardent.
 */
export function processGraveyardRecoveryTriggers(
  state: GameState,
  events: readonly GameEvent[],
  turnNumber: number,
  depth = 1
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const produced: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== "CARD_MOVED" || event.fromZone !== "graveyard" || event.toZone !== "hand") continue;
    if (!event.cardId || !event.ownerId) continue;

    const result = processTrigger(
      nextState,
      {
        trigger: "onCardRecoveredFromGraveyard",
        playerId: event.ownerId,
        cardId: event.cardId,
        sourceInstanceId: event.instanceId,
      },
      turnNumber,
      depth
    );
    nextState = result.state;
    produced.push(...result.events);
  }

  return { state: nextState, events: produced };
}

/**
 * Traite un `TriggerEvent` : résout dans l'ordre toutes les capacités
 * AUTOMATIQUES concernées et retourne le nouvel état + les événements
 * produits (à ajouter au journal par l'appelant). Les capacités
 * `mode: "optional"` ne sont jamais résolues ici — voir
 * `collectReactionCandidates`.
 */
export function processTrigger(
  state: GameState,
  event: TriggerEvent,
  turnNumber: number,
  /** Profondeur de chaînage — une invocation produite PAR un déclenchement réveille les capacités d'arrivée, mais on s'arrête là. */
  depth = 0
): { state: GameState; events: GameEvent[] } {
  const items = collectTriggeredWork(state, event, turnNumber, "auto");
  let nextState = state;
  const events: GameEvent[] = [];
  const openedChoiceGroups = new Set<string>();

  for (const item of items) {
    // Condition de capacité non remplie : ni résolution, ni consommation du
    // « une fois par tour » (cf. `matchesControlCondition`).
    if (
      !matchesControlCondition(
        nextState,
        item.ability,
        item.context.controllerId,
        item.context.sourceInstanceId,
        item.context.triggerSourceInstanceId
      )
    ) {
      continue;
    }

    // « Choisissez : A ou B » en résolution AUTOMATIQUE (ex: Horloge de
    // Marée au Sabordage) : rien ne se résout ici, un choix est ouvert pour
    // le contrôleur (`GameState.pendingChoice`, résolu par `resolveChoice`).
    // Si un choix est déjà en attente, la première option du groupe se
    // résout d'office.
    if (item.ability.choiceGroup && item.context.sourceInstanceId) {
      const groupKey = `${item.context.sourceInstanceId}:${item.ability.choiceGroup}`;
      if (openedChoiceGroups.has(groupKey)) continue;
      openedChoiceGroups.add(groupKey);
      const abilityIndexes = (getCardDefinition(item.cardId).abilities ?? []).flatMap((ability, index) =>
        ability.choiceGroup === item.ability.choiceGroup && (ability.mode ?? "auto") === "auto" ? [index] : []
      );
      if (!nextState.pendingChoice) {
        nextState = {
          ...nextState,
          pendingChoice: {
            kind: "abilityOption",
            playerId: item.context.controllerId,
            sourceInstanceId: item.context.sourceInstanceId,
            cardId: item.cardId,
            abilityIndexes,
            turnNumber,
          },
        };
        continue;
      }
      if (abilityIndexes[0] !== item.abilityIndex) continue;
    }

    // "La première fois à chaque tour" : marquée AVANT résolution, pour
    // qu'une capacité qui provoque elle-même l'événement auquel elle
    // réagit ne se rappelle pas en boucle.
    const key = item.ability.oncePerTurnKey;
    if (key && item.ability.oncePerTurnPerTriggerSource) {
      // « la première fois que CHACUNE de vos unités… » : la marque vit sur
      // la déclencheuse.
      if (!oncePerTurnSlotAvailable(nextState, item.ability, item.context.sourceInstanceId, item.context.triggerSourceInstanceId, turnNumber)) continue;
      nextState = markOncePerTurnSlot(nextState, item.ability, item.context.sourceInstanceId, item.context.triggerSourceInstanceId, turnNumber);
    } else if (key && item.context.sourceInstanceId) {
      const holder = findBoardUnit(nextState, item.context.sourceInstanceId);
      if (!holder || !oncePerTurnAvailable(holder.unit, key, turnNumber)) continue;
      nextState = markUnitOncePerTurn(nextState, holder.playerId, holder.unit.instanceId, key, turnNumber, item.ability.onceEver);
    }

    // Le Bris depuis la main est une propriété de l'ÉVÉNEMENT : sans ce
    // report, `conditionBrokenFromHand` serait toujours faux pour une
    // capacité déclenchée (Pantalone Sans-Sou).
    const context = event.fromHand === undefined ? item.context : { ...item.context, brokenFromHand: event.fromHand };
    // Aucune désignation d'office : une capacité automatique ne vise jamais
    // une unité CHOISIE (« jamais automatique, le joueur choisit » —
    // décision du 17/09/2026). L'invariant est tenu par
    // `tests/game/cardConformity.test.ts`, règle "designation" : un effet
    // `chosenUnit` impose `mode: "optional"`, donc une fenêtre de réaction
    // où le joueur pointe sa cible.
    const resolved = resolveEffectSequence(nextState, item.effects, context);
    nextState = resolved.state;
    events.push(...resolved.events);
  }

  // Une invocation produite par ces capacités (ex: La Grande Migration)
  // fait bien "arriver en jeu" un Cra-Poiscail : les observateurs doivent
  // le voir, comme pour une carte posée à la main.
  if (depth === 0) {
    const summoned = processSummonEnterTriggers(nextState, events, turnNumber, depth + 1);
    nextState = summoned.state;
    events.push(...summoned.events);

    // Idem pour un retour en main provoqué par une capacité (ex: Le
    // Régisseur Sans Visage) : Le Théâtre Englouti doit le voir.
    const recalled = processReturnedToHandTriggers(nextState, events, turnNumber, depth + 1);
    nextState = recalled.state;
    events.push(...recalled.events);

    // Et pour une défausse provoquée par une capacité (Lot 13) : une carte
    // envoyée au Cimetière par un déclenchement est défaussée tout autant
    // qu'une carte envoyée par une pose.
    const discarded = processDiscardedFromHandTriggers(nextState, events, turnNumber, depth + 1);
    nextState = discarded.state;
    events.push(...discarded.events);

    // Et pour une carte repêchée au Cimetière par une capacité.
    const recovered = processGraveyardRecoveryTriggers(nextState, events, turnNumber, depth + 1);
    nextState = recovered.state;
    events.push(...recovered.events);
  }

  // Anomalies globales temporaires (`game/state/anomalies.ts`) : centralisées
  // ICI plutôt que sur chaque site d'appel (playCard.ts / processDeaths.ts /
  // saborder.ts / resolveEnvironment.ts) puisque `processTrigger` est déjà
  // le point de passage unique pour ces trois `TriggerType`. Le Sabordage
  // déclenche toujours `onDeath` EN PLUS de `onSaborde` (cf. `TriggerType`),
  // donc ne réagir qu'à `onDeath`/`onExpire` ici évite de compter deux fois
  // le départ d'un même permanent sabordé.
  if (event.trigger === "onCardPlayed" && event.playerId && event.cardId) {
    const anomaly = applyCardPlayedAnomalies(nextState, event.playerId, getCardDefinition(event.cardId).type, turnNumber);
    nextState = anomaly.state;
    events.push(...anomaly.events);
  } else if ((event.trigger === "onDeath" || event.trigger === "onExpire") && event.playerId) {
    const anomaly = applyPermanentLeftAnomalies(nextState, event.playerId, turnNumber);
    nextState = anomaly.state;
    events.push(...anomaly.events);
  }

  return { state: nextState, events };
}

/**
 * Recense les capacités `mode: "optional"` actuellement éligibles pour
 * `forPlayerId`, en réponse à l'un des `triggerEvents` donnés — avec, si
 * besoin, au moins une cible potentielle disponible. Le coût n'écarte
 * jamais une réaction : il n'y a pas de plancher de Déraison.
 * Utilisé pour ouvrir/faire vivre une fenêtre de réaction
 * (`game/reactions/`) ; jamais pour résoudre quoi que ce soit lui-même.
 */
export function collectReactionCandidates(
  state: GameState,
  triggerEvents: TriggerEvent[],
  forPlayerId: PlayerId,
  turnNumber: number
): PendingReactionCandidate[] {
  if (!state.players.some((p) => p.id === forPlayerId)) return [];

  const candidates: PendingReactionCandidate[] = [];
  const seen = new Set<string>();

  for (const event of triggerEvents) {
    for (const item of collectTriggeredWork(state, event, turnNumber, "optional")) {
      if (item.context.controllerId !== forPlayerId) continue;
      if (
        !matchesControlCondition(
          state,
          item.ability,
          item.context.controllerId,
          item.context.sourceInstanceId,
          item.context.triggerSourceInstanceId
        )
      ) {
        continue;
      }
      const key = `${item.context.sourceInstanceId}:${item.abilityIndex}`;
      if (seen.has(key)) continue;

      // Le coût en Raison d'une réaction ne l'écarte jamais : sans plancher
      // de Déraison, la réaction se propose et se paie en creusant la dette.
      const reasonCost = item.ability.cost?.reason ?? 0;

      // Le coût en ANCRAGE, lui, écarte : la coque n'a pas de découvert,
      // et proposer « payez 3 Ancrage » à un joueur qui en a 2 reviendrait
      // à lui proposer de perdre la partie (cf. `TriggeredAbility.cost`).
      const anchorCost = item.ability.cost?.anchor ?? 0;
      if (anchorCost > 0) {
        const payeur = state.players.find((p) => p.id === forPlayerId);
        if (!payeur || payeur.anchor <= anchorCost) continue;
      }

      // "choisissez un Cra-Poiscail" : la capacité ne se propose que s'il
      // existe au moins une cible LÉGALE — pas seulement une carte
      // quelconque sur un plateau.
      const { needsTarget, hasEligibleTarget } = chosenTargetRequirement(
        state,
        item.effects,
        forPlayerId,
        item.context.sourceInstanceId,
        item.context.triggerSourceInstanceId
      );
      if (needsTarget && !hasEligibleTarget) continue;

      // « choisissez une unité Un Dead dans votre Cimetière » : si rien n'y
      // est éligible, la capacité se propose quand même — l'effet se résout
      // alors sans rien récupérer (convention « si possible »), il n'y a
      // simplement pas de question à poser.
      const needsGraveyardTarget = graveyardChoicesFor(state, forPlayerId, item.effects).length > 0;

      seen.add(key);
      candidates.push({
        controllerId: forPlayerId,
        sourceInstanceId: item.context.sourceInstanceId!,
        triggerSourceInstanceId: item.context.triggerSourceInstanceId,
        cardId: item.cardId,
        abilityIndex: item.abilityIndex,
        reasonCost,
        anchorCost,
        needsTarget,
        needsGraveyardTarget,
      });
    }
  }

  return candidates;
}

/**
 * Résout UNE capacité `optional` précise (identifiée par
 * `sourceInstanceId` + `abilityIndex`), en payant son coût d'abord. Ne
 * vérifie PAS l'éligibilité (déjà fait par l'appelant via
 * `collectReactionCandidates`/`game/actions/activateReaction.ts`) —
 * seulement la résolution effective.
 */
export function resolveReaction(
  state: GameState,
  candidate: PendingReactionCandidate,
  targetInstanceId: string | undefined,
  turnNumber: number,
  /** Carte du Cimetière désignée par le joueur, quand la capacité en repêche une. */
  chosenGraveyardInstanceId?: string
): { state: GameState; events: GameEvent[] } {
  const def = getCardDefinition(candidate.cardId);
  const ability = def.abilities?.[candidate.abilityIndex];
  if (!ability) return { state, events: [] };

  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
  let nextState = state;

  if (candidate.reasonCost > 0) {
    const payment = payReasonCost(nextState, candidate.controllerId, candidate.reasonCost, turnNumber);
    nextState = payment.state;
    events.push({ ...base, type: "REASON_CHANGED", playerId: candidate.controllerId, delta: -payment.paid });
  }

  // Coût en ANCRAGE : payé cash, sans bouclier — un bouclier de perte de
  // Raison ne protège pas la coque. L'éligibilité a déjà vérifié qu'il
  // reste de quoi survivre (`collectReactionCandidates`).
  const anchorCost = ability.cost?.anchor ?? 0;
  if (anchorCost > 0) {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === candidate.controllerId ? { ...p, anchor: p.anchor - anchorCost } : p
      ) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "DAMAGE", targetPlayerId: candidate.controllerId, amount: anchorCost });
  }

  // "La première fois à chaque tour" : marquée à l'ACTIVATION (le
  // recensement, lui, ne fait que la lire — cf. `collectTriggeredWork`).
  // Même ordre qu'en résolution automatique : marquer avant de résoudre.
  if (ability.oncePerTurnKey && ability.oncePerTurnPerTriggerSource) {
    nextState = markOncePerTurnSlot(nextState, ability, candidate.sourceInstanceId, candidate.triggerSourceInstanceId, turnNumber);
  } else if (ability.oncePerTurnKey) {
    const holder = findBoardUnit(nextState, candidate.sourceInstanceId);
    if (holder) {
      nextState = markUnitOncePerTurn(nextState, holder.playerId, holder.unit.instanceId, ability.oncePerTurnKey, turnNumber, ability.onceEver);
    }
  }

  const context: EffectContext = {
    controllerId: candidate.controllerId,
    sourceInstanceId: candidate.sourceInstanceId,
    chosenTargetInstanceId: targetInstanceId,
    chosenGraveyardInstanceId,
    triggerSourceInstanceId: candidate.triggerSourceInstanceId,
    turnNumber,
  };

  const reacted = resolveEffectSequence(nextState, ability.effects, context);
  nextState = reacted.state;
  events.push(...reacted.events);

  events.push({
    ...base,
    type: "REACTION_ACTIVATED",
    playerId: candidate.controllerId,
    sourceInstanceId: candidate.sourceInstanceId,
  });

  // Guetteur de Brume (et cartes similaires) : "la première fois par tour
  // que l'adversaire déclenche un effet pendant votre tour, regardez une
  // carte de sa main" — activer une réaction est, dans ce moteur, le SEUL
  // moyen pour un joueur non-actif de déclencher un effet pendant le tour
  // de l'autre. Ne concerne que le joueur ACTIF (celui dont c'est le tour) :
  // s'il active lui-même une de ses propres réactions, ce n'est pas
  // "l'adversaire" qui a agi.
  if (candidate.controllerId !== state.activePlayerId) {
    const reveal = consumeOpponentReactionRevealShield(nextState, state.activePlayerId, turnNumber);
    nextState = reveal.state;
    if (reveal.amount > 0) {
      const revealResult = revealRandomHandCards(nextState, candidate.controllerId, reveal.amount, turnNumber);
      nextState = revealResult.state;
      events.push(...revealResult.events);
    }
  }

  return { state: nextState, events };
}

/**
 * SURVIVRE AUX DÉGÂTS (Lot 15 — Équipage de Verre) : pour chaque unité qui a
 * encaissé des dégâts pendant l'action et qui est ENCORE EN JEU une fois les
 * morts réglées, déclenche `onSurvivedDamage`.
 *
 * Appelée par `dispatch` après `processDeaths`, et pas plus tôt : « survivre »
 * ne se sait qu'une fois la passe de morts faite — une unité à 0 Résistance
 * sauvée par un Porte-Éclats survit, une autre au même compte ne survit pas.
 *
 * Un seul déclenchement par unité et par action, quel que soit le nombre de
 * coups : le texte dit « la première fois à chaque tour qu'il survit à des
 * dégâts », pas « à chaque coup ». Les coups sont portés par l'événement,
 * avec leur cause et le joueur qui les a infligés, pour les capacités qui
 * ne regardent que « des dégâts infligés par l'un de vos effets ».
 */
export function processSurvivedDamage(
  state: GameState,
  events: readonly GameEvent[],
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const coups = new Map<string, Array<{ cause?: "combat" | "effect" | "tide"; byPlayerId?: string }>>();
  for (const event of events) {
    if (event.type !== "DAMAGE" || !event.targetInstanceId || event.amount <= 0) continue;
    const liste = coups.get(event.targetInstanceId) ?? [];
    liste.push({ cause: event.cause, byPlayerId: event.sourcePlayerId });
    coups.set(event.targetInstanceId, liste);
  }

  let nextState = state;
  const produced: GameEvent[] = [];
  for (const [instanceId, damage] of coups) {
    const found = findBoardUnit(nextState, instanceId);
    if (!found) continue;
    const owner = nextState.players.find((p) => p.id === found.playerId)!;
    const stats = computeEffectiveStats(found.unit, nextState.environment.tideState, {
      controllerBoard: owner.board,
      controllerReason: owner.reason,
      tideOrientation: nextState.environment.tideOrientation,
      controllerIsActive: nextState.activePlayerId === owner.id,
    });
    // Toujours condamnée (une fenêtre de sauvetage est peut-être en cours) :
    // elle n'a pas encore survécu.
    if (found.unit.pendingRemoval || stats.destroyedByTide || found.unit.damageMarked >= stats.health) continue;
    const result = processTrigger(
      nextState,
      { trigger: "onSurvivedDamage", playerId: owner.id, cardId: found.unit.cardId, sourceInstanceId: instanceId, damage },
      turnNumber,
      1
    );
    nextState = result.state;
    produced.push(...result.events);
  }
  return { state: nextState, events: produced };
}

/**
 * « la première fois … que vous récupérez de la Raison GRÂCE À UNE CARTE »
 * (Survivant de la Mousse) : un déclenchement par joueur qui a récupéré de la
 * Raison par un effet pendant l'action. La régénération de début de tour ne
 * porte pas `source: "card"`, elle ne compte donc pas.
 */
export function processReasonGained(
  state: GameState,
  events: readonly GameEvent[],
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const joueurs = new Set<string>();
  for (const event of events) {
    if (event.type === "REASON_CHANGED" && event.delta > 0 && event.source === "card") joueurs.add(event.playerId);
  }
  let nextState = state;
  const produced: GameEvent[] = [];
  for (const playerId of joueurs) {
    const result = processTrigger(nextState, { trigger: "onReasonGained", playerId }, turnNumber, 1);
    nextState = result.state;
    produced.push(...result.events);
  }
  return { state: nextState, events: produced };
}

/**
 * Photo des Créatures qui sont, à cet instant, la SEULE Créature du plateau
 * de leur contrôleur — par `instanceId`. Sert de référence avant/après
 * chaque action pour `onBecomeOnlyCreature` (ex: Méduse des Lanternes,
 * "quand elle devient votre seule Créature en jeu").
 */
export function snapshotLoneCreatures(state: GameState): Set<string> {
  const lone = new Set<string>();
  for (const player of state.players) {
    const creatures = player.board.filter((u) => getCardDefinition(u.cardId).type === "creature");
    if (creatures.length === 1) lone.add(creatures[0]!.instanceId);
  }
  return lone;
}

/**
 * Déclenche `onBecomeOnlyCreature` pour chaque Créature qui vient de DEVENIR
 * la seule de son plateau (absente de la photo `before`, présente
 * maintenant) — qu'une autre soit morte, ait été renvoyée en main, ou
 * qu'elle arrive seule sur un plateau vide.
 */
export function processLoneCreatureChanges(
  state: GameState,
  before: Set<string>,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const events: GameEvent[] = [];
  for (const instanceId of snapshotLoneCreatures(state)) {
    if (before.has(instanceId)) continue;
    const owner = nextState.players.find((p) => p.board.some((u) => u.instanceId === instanceId));
    const unit = owner?.board.find((u) => u.instanceId === instanceId);
    if (!owner || !unit) continue;
    const result = processTrigger(
      nextState,
      { trigger: "onBecomeOnlyCreature", playerId: owner.id, cardId: unit.cardId, sourceInstanceId: instanceId },
      turnNumber,
      1
    );
    nextState = result.state;
    events.push(...result.events);
  }
  return { state: nextState, events };
}
