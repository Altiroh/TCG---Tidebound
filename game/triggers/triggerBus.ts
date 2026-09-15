import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import type { CardInstance, TriggeredAbility, TriggerSourceFilter } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect, revealRandomHandCards } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import { applyCardPlayedAnomalies, applyPermanentLeftAnomalies } from "@/game/state/anomalies";
import { chosenTargetRequirement } from "@/game/effects/chosenTargets";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import { canPayReason } from "@/game/state/reason";
import { consumeOpponentReactionRevealShield, payReasonCost, reasonCostAfterShield } from "@/game/state/shields";
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
  if ((filter.sameController ?? true) && event.playerId !== holderControllerId) return false;
  if (filter.onlySummoned && !event.fromSummon) return false;
  // "Quand IL attaque" sur un Équipement : l'événement vise le permanent
  // équipé, pas l'Équipement lui-même (qui, lui, n'attaque jamais).
  if (filter.equippedUnit && event.sourceInstanceId !== holder.attachedToInstanceId) return false;
  // Les filtres par identité de carte n'ont de sens que si l'événement la
  // porte (`onAttack` ne la porte pas) : sans elle, ils ne matchent pas.
  if (filter.cardIds && !(event.cardId && filter.cardIds.includes(event.cardId))) return false;
  if (filter.archetype && !(event.cardId && getCardDefinition(event.cardId).archetype === filter.archetype)) return false;
  // Même logique pour le sous-type (Lot 11, « une autre Marionnette alliée »).
  if (filter.subtype && !(event.cardId && getCardDefinition(event.cardId).subtype === filter.subtype)) return false;
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
        if (!ability.triggeredBy) return;
        if (!matchesTriggerSource(ability.triggeredBy, event, holder, player.id)) return;
        // "La première fois à chaque tour" : la capacité disparaît des
        // candidats une fois consommée ce tour-ci (le marquage, lui, se
        // fait à la résolution — cf. `processTrigger`).
        if (ability.oncePerTurnKey && !oncePerTurnAvailable(holder, ability.oncePerTurnKey, turnNumber)) return;
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
  const matchesMode = (ability: TriggeredAbility) => (ability.mode ?? "auto") === mode;

  if (event.trigger === "onDeath" || event.trigger === "onSaborde" || event.trigger === "onExpire") {
    // L'unité est déjà retirée du plateau au moment où cet événement est
    // émis : on résout ses capacités à partir des infos portées par
    // l'événement lui-même. Les réactions "optional" à sa propre mort ne
    // sont pas recensées ici (la source a déjà quitté le board — pas
    // nécessaire tant qu'aucune carte ne l'exige).
    if (mode === "optional") return result;
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

  if (event.trigger === "startOfTurn" || event.trigger === "endOfTurn") {
    if (!event.playerId) return result;
    const player = state.players.find((p) => p.id === event.playerId);
    if (!player) return result;

    for (const unit of player.board) {
      if (isInactive(state, unit)) continue;
      const def = getCardDefinition(unit.cardId);
      (def.abilities ?? []).forEach((ability, abilityIndex) => {
        if (ability.trigger !== event.trigger || !matchesMode(ability)) return;
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
          result.push(work(ability, abilityIndex, def.id, player.id, unit.instanceId, turnNumber));
        });
      }
    }
    return result;
  }

  if (event.trigger === "onTideStateEntered" || event.trigger === "onTideStateExited") {
    for (const player of playersActiveFirst(state)) {
      for (const unit of player.board) {
        const def = getCardDefinition(unit.cardId);
        (def.abilities ?? []).forEach((ability, abilityIndex) => {
          if (ability.trigger !== event.trigger || !matchesMode(ability)) return;
          if (ability.condition?.tideState && ability.condition.tideState !== event.tideState) return;
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
  turnNumber: number
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? { ...p, board: p.board.map((u) => (u.instanceId === instanceId ? markOncePerTurnUsed(u, key, turnNumber) : u)) }
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
    if (event.type !== "SUMMON") continue;
    const result = processTrigger(
      nextState,
      { trigger: "onEnterPlay", playerId: event.playerId, cardId: event.cardId, sourceInstanceId: event.instanceId, fromSummon: true },
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

  for (const item of items) {
    // "La première fois à chaque tour" : marquée AVANT résolution, pour
    // qu'une capacité qui provoque elle-même l'événement auquel elle
    // réagit ne se rappelle pas en boucle.
    const key = item.ability.oncePerTurnKey;
    if (key && item.context.sourceInstanceId) {
      const holder = findBoardUnit(nextState, item.context.sourceInstanceId);
      if (!holder || !oncePerTurnAvailable(holder.unit, key, turnNumber)) continue;
      nextState = markUnitOncePerTurn(nextState, holder.playerId, holder.unit.instanceId, key, turnNumber);
    }

    for (const effect of item.effects) {
      const result = resolveEffect(nextState, effect, item.context);
      nextState = result.state;
      events.push(...result.events);
    }
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
 * `forPlayerId`, en réponse à l'un des `triggerEvents` donnés — coût
 * payable et (si besoin) au moins une cible potentielle disponible.
 * Utilisé pour ouvrir/faire vivre une fenêtre de réaction
 * (`game/reactions/`) ; jamais pour résoudre quoi que ce soit lui-même.
 */
export function collectReactionCandidates(
  state: GameState,
  triggerEvents: TriggerEvent[],
  forPlayerId: PlayerId,
  turnNumber: number
): PendingReactionCandidate[] {
  const player = state.players.find((p) => p.id === forPlayerId);
  if (!player) return [];

  const candidates: PendingReactionCandidate[] = [];
  const seen = new Set<string>();

  for (const event of triggerEvents) {
    for (const item of collectTriggeredWork(state, event, turnNumber, "optional")) {
      if (item.context.controllerId !== forPlayerId) continue;
      const key = `${item.context.sourceInstanceId}:${item.abilityIndex}`;
      if (seen.has(key)) continue;

      const reasonCost = item.ability.cost?.reason ?? 0;
      if (!canPayReason(player, reasonCostAfterShield(state, forPlayerId, reasonCost, turnNumber))) continue;

      // "choisissez un Cra-Poiscail" : la capacité ne se propose que s'il
      // existe au moins une cible LÉGALE — pas seulement une carte
      // quelconque sur un plateau.
      const { needsTarget, hasEligibleTarget } = chosenTargetRequirement(
        state,
        item.effects,
        forPlayerId,
        item.context.sourceInstanceId
      );
      if (needsTarget && !hasEligibleTarget) continue;

      seen.add(key);
      candidates.push({
        controllerId: forPlayerId,
        sourceInstanceId: item.context.sourceInstanceId!,
        triggerSourceInstanceId: item.context.triggerSourceInstanceId,
        cardId: item.cardId,
        abilityIndex: item.abilityIndex,
        reasonCost,
        needsTarget,
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
  turnNumber: number
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

  // "La première fois à chaque tour" : marquée à l'ACTIVATION (le
  // recensement, lui, ne fait que la lire — cf. `collectTriggeredWork`).
  // Même ordre qu'en résolution automatique : marquer avant de résoudre.
  if (ability.oncePerTurnKey) {
    const holder = findBoardUnit(nextState, candidate.sourceInstanceId);
    if (holder) {
      nextState = markUnitOncePerTurn(nextState, holder.playerId, holder.unit.instanceId, ability.oncePerTurnKey, turnNumber);
    }
  }

  const context: EffectContext = {
    controllerId: candidate.controllerId,
    sourceInstanceId: candidate.sourceInstanceId,
    chosenTargetInstanceId: targetInstanceId,
    triggerSourceInstanceId: candidate.triggerSourceInstanceId,
    turnNumber,
  };

  for (const effect of ability.effects) {
    const result = resolveEffect(nextState, effect, context);
    nextState = result.state;
    events.push(...result.events);
  }

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
