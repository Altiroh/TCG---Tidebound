import { getCardDefinition } from "@/game/cards/sets/core";
import type { GameEvent } from "@/game/events/types";
import { collectReactionCandidates } from "@/game/triggers/triggerBus";
import type { PendingReactionCandidate, TriggerEvent } from "@/game/triggers/types";
import { isMainPhase, type DeferredArrival, type GameState, type PlayerId } from "@/game/state/types";

/**
 * EFFETS D'ARRIVÉE EN RÉSERVE (règle du 12/10/2026).
 *
 * Poser une carte à effet d'arrivée facultatif ouvrait une fenêtre « Appliquer
 * / Passer » qui bloquait la table. Le joueur ACTIF qui pose en Phase
 * principale n'est plus interrompu : l'effet est mis en réserve
 * (`GameState.deferredArrivals`), la carte luit sur le plateau, et il
 * l'active quand il le veut pendant les Phases principales de ce tour
 * (`activateArrival`). Ne pas l'activer, c'est passer.
 *
 * Restent des fenêtres : une arrivée hors de son propre tour ou hors Phase
 * principale (pendant le combat, au tour adverse), et tout ce qui réagit à
 * l'arrivée DEPUIS UNE AUTRE carte — un observateur, un piège adverse.
 */

/** Le déclencheur d'arrivée que la capacité attend, reconstitué pour la réserve. */
export function arrivalTrigger(entry: Pick<DeferredArrival, "controllerId" | "cardId" | "sourceInstanceId">): TriggerEvent {
  return { trigger: "onEnterPlay", playerId: entry.controllerId, cardId: entry.cardId, sourceInstanceId: entry.sourceInstanceId };
}

function sameEntry(a: DeferredArrival, b: Pick<DeferredArrival, "sourceInstanceId" | "abilityIndex">): boolean {
  return a.sourceInstanceId === b.sourceInstanceId && a.abilityIndex === b.abilityIndex;
}

function onBoardOf(state: GameState, playerId: PlayerId, instanceId: string): boolean {
  return state.players.some((player) => player.id === playerId && player.board.some((unit) => unit.instanceId === instanceId));
}

/**
 * Met en réserve les capacités d'arrivée facultatives des cartes que le
 * joueur actif vient de faire arriver (pose, invocation, arrivée rejouée)
 * en Phase principale. Appelée par `dispatch` AVANT l'ouverture de la
 * fenêtre de réaction, qui les ignore alors (`collectReactionCandidatesOnBoard`).
 */
export function deferArrivals(state: GameState, events: readonly GameEvent[]): GameState {
  if (state.status !== "active" || !isMainPhase(state.phase)) return state;
  const active = state.activePlayerId;
  const kept = (state.deferredArrivals ?? []).filter((entry) => entry.turnNumber === state.turnNumber);
  const fresh: DeferredArrival[] = [];
  for (const event of events) {
    if (event.type !== "SUMMON" && event.type !== "ENTER_EFFECTS_REPEATED") continue;
    if (event.playerId !== active || !onBoardOf(state, active, event.instanceId)) continue;
    const trigger: TriggerEvent = {
      ...arrivalTrigger({ controllerId: active, cardId: event.cardId, sourceInstanceId: event.instanceId }),
      ...(event.type === "SUMMON" && !event.played ? { fromSummon: true } : {}),
      ...(event.type === "ENTER_EFFECTS_REPEATED" ? { repeatedArrival: true } : {}),
    };
    const def = getCardDefinition(event.cardId);
    for (const candidate of collectReactionCandidates(state, [trigger], active, state.turnNumber)) {
      // Seulement les capacités de la carte arrivée, sur SA propre arrivée.
      if (candidate.sourceInstanceId !== event.instanceId || candidate.fromHand) continue;
      if (def.abilities?.[candidate.abilityIndex]?.trigger !== "onEnterPlay") continue;
      const entry: DeferredArrival = { controllerId: active, sourceInstanceId: event.instanceId, cardId: event.cardId, abilityIndex: candidate.abilityIndex, turnNumber: state.turnNumber };
      if ([...kept, ...fresh].some((other) => sameEntry(other, entry))) continue;
      fresh.push(entry);
    }
  }
  if (fresh.length === 0) return kept.length === (state.deferredArrivals ?? []).length ? state : withEntries(state, kept);
  return withEntries(state, [...kept, ...fresh]);
}

function withEntries(state: GameState, entries: DeferredArrival[]): GameState {
  if (entries.length === 0) {
    const { deferredArrivals: _vide, ...rest } = state;
    return rest;
  }
  return { ...state, deferredArrivals: entries };
}

/** Écarte la réserve périmée : tour passé, carte partie du plateau. */
export function pruneDeferredArrivals(state: GameState): GameState {
  const entries = state.deferredArrivals;
  if (!entries) return state;
  const kept = entries.filter(
    (entry) => state.status === "active" && entry.turnNumber === state.turnNumber && onBoardOf(state, entry.controllerId, entry.sourceInstanceId)
  );
  return kept.length === entries.length ? state : withEntries(state, kept);
}

export interface ActivatableArrival {
  entry: DeferredArrival;
  candidate: PendingReactionCandidate;
}

/**
 * Effets d'arrivée que `playerId` peut activer MAINTENANT : son tour, une
 * Phase principale, la table libre, et l'effet encore éligible (une cible
 * légale, ses conditions, de quoi payer un coût en Ancrage).
 */
export function activatableArrivals(state: GameState, playerId: PlayerId): ActivatableArrival[] {
  if (state.status !== "active" || state.activePlayerId !== playerId || !isMainPhase(state.phase)) return [];
  if (state.pendingReaction || state.pendingChoice) return [];
  const entries = (state.deferredArrivals ?? []).filter(
    (entry) => entry.controllerId === playerId && entry.turnNumber === state.turnNumber && onBoardOf(state, playerId, entry.sourceInstanceId)
  );
  const result: ActivatableArrival[] = [];
  for (const entry of entries) {
    // Recensée hors réserve (sinon elle s'écarterait elle-même), avec ses conditions de maintenant.
    const others = (state.deferredArrivals ?? []).filter((other) => !sameEntry(other, entry));
    const probe = withEntries(state, others);
    const candidate = collectReactionCandidates(probe, [arrivalTrigger(entry)], playerId, state.turnNumber).find(
      (c) => c.sourceInstanceId === entry.sourceInstanceId && c.abilityIndex === entry.abilityIndex
    );
    if (candidate) result.push({ entry, candidate });
  }
  return result;
}

/** État prêt pour `activateReaction` : la capacité sortie de la réserve, ses sœurs (« A ou B ») écartées, une fenêtre d'une seule capacité. */
export function arrivalActivationState(state: GameState, entry: DeferredArrival): GameState {
  const def = getCardDefinition(entry.cardId);
  const group = def.abilities?.[entry.abilityIndex]?.choiceGroup;
  const rest = (state.deferredArrivals ?? []).filter((other) => {
    if (sameEntry(other, entry)) return false;
    if (!group || other.sourceInstanceId !== entry.sourceInstanceId) return true;
    return def.abilities?.[other.abilityIndex]?.choiceGroup !== group;
  });
  const base = withEntries(state, rest);
  const trigger = arrivalTrigger(entry);
  // Les autres capacités qui répondent à cette même arrivée (observateurs,
  // pièges) ont déjà eu leur fenêtre au moment de la pose : marquées comme
  // utilisées, elles ne reviennent pas à l'activation.
  const used = state.players.flatMap((player) =>
    collectReactionCandidates(base, [trigger], player.id, state.turnNumber)
      .filter((c) => !(c.sourceInstanceId === entry.sourceInstanceId && c.abilityIndex === entry.abilityIndex))
      .map((c) => `${c.sourceInstanceId}:${c.abilityIndex}`)
  );
  return {
    ...base,
    pendingReaction: { events: [trigger], awaitingPlayerId: entry.controllerId, priorityQueue: [], usedCandidateKeys: used, turnNumber: state.turnNumber },
  };
}
