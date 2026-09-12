import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import type { CardInstance, TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
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
  turnNumber: number
): TriggeredWork {
  return {
    effects: ability.effects,
    context: { controllerId, sourceInstanceId, turnNumber },
    cardId,
    abilityIndex,
    ability,
  };
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
      if (ability.trigger !== event.trigger || !matchesMode(ability)) return;
      result.push(work(ability, abilityIndex, def.id, event.playerId!, event.sourceInstanceId!, turnNumber));
    });
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
  // à l'unité concernée par l'événement.
  if (event.sourceInstanceId) {
    for (const player of state.players) {
      const unit = player.board.find((u) => u.instanceId === event.sourceInstanceId);
      if (!unit || isInactive(state, unit)) continue;
      const def = getCardDefinition(unit.cardId);
      (def.abilities ?? []).forEach((ability, abilityIndex) => {
        if (ability.trigger !== event.trigger || !matchesMode(ability)) return;
        result.push(work(ability, abilityIndex, def.id, player.id, unit.instanceId, turnNumber));
      });
    }
  }

  return result;
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
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const items = collectTriggeredWork(state, event, turnNumber, "auto");
  let nextState = state;
  const events: GameEvent[] = [];

  for (const item of items) {
    for (const effect of item.effects) {
      const result = resolveEffect(nextState, effect, item.context);
      nextState = result.state;
      events.push(...result.events);
    }
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

  const hasAnyBoardUnit = state.players.some((p) => p.board.length > 0);
  const candidates: PendingReactionCandidate[] = [];
  const seen = new Set<string>();

  for (const event of triggerEvents) {
    for (const item of collectTriggeredWork(state, event, turnNumber, "optional")) {
      if (item.context.controllerId !== forPlayerId) continue;
      const key = `${item.context.sourceInstanceId}:${item.abilityIndex}`;
      if (seen.has(key)) continue;

      const reasonCost = item.ability.cost?.reason ?? 0;
      if (player.reason < reasonCost) continue;

      const needsTarget = item.effects.some((e) => e.target.kind === "chosenUnit");
      if (needsTarget && !hasAnyBoardUnit) continue;

      seen.add(key);
      candidates.push({
        controllerId: forPlayerId,
        sourceInstanceId: item.context.sourceInstanceId!,
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
    const player = nextState.players.find((p) => p.id === candidate.controllerId)!;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === player.id ? { ...p, reason: Math.max(0, p.reason - candidate.reasonCost) } : p
      ) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -candidate.reasonCost });
  }

  const context: EffectContext = {
    controllerId: candidate.controllerId,
    sourceInstanceId: candidate.sourceInstanceId,
    chosenTargetInstanceId: targetInstanceId,
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

  return { state: nextState, events };
}
