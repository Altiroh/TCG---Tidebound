import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, CardInstance } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";

/**
 * Anomalies globales temporaires (`CardDefinition.type === "anomalie"`,
 * permanents à durée limitée via `durationTurns`, comme une Structure) :
 * règles SYMÉTRIQUES qui affectent N'IMPORTE QUEL joueur concerné par la
 * situation décrite, pas seulement le contrôleur de l'Anomalie — à la
 * différence des boucliers "1ère fois par tour" (`game/state/shields.ts`),
 * qui ne bénéficient qu'à leur propre contrôleur. Plusieurs copies de la
 * même Anomalie s'appliquent chacune indépendamment (cumulatif), d'où une
 * boucle sur TOUTES les instances éligibles plutôt qu'un seul "slot"
 * consommé comme dans `findAvailableShield`.
 */
function allAnomalyInstances(state: GameState): Array<{ owner: PlayerState; unit: CardInstance; def: CardDefinition }> {
  const result: Array<{ owner: PlayerState; unit: CardInstance; def: CardDefinition }> = [];
  for (const owner of state.players) {
    for (const unit of owner.board) {
      const def = getCardDefinition(unit.cardId);
      if (def.type === "anomalie") result.push({ owner, unit, def });
    }
  }
  return result;
}

function replaceUnit(state: GameState, ownerId: PlayerId, instanceId: string, updater: (u: CardInstance) => CardInstance): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === ownerId ? { ...p, board: p.board.map((u) => (u.instanceId === instanceId ? updater(u) : u)) } : p
    ) as [PlayerState, PlayerState],
  };
}

function replacePlayer(state: GameState, updated: PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === updated.id ? updated : p)) as [PlayerState, PlayerState] };
}

/**
 * Perte de Raison de "Quelque Chose Sous la Coque" / "Ils Sont Sous Nous" :
 * la 1ère fois PAR TOUR que `affectedPlayerId` joue une carte (dans ce
 * catalogue, toute carte est un permanent — cf. `PERMANENT_CARD_TYPES` —
 * donc "joue un permanent" et "joue une carte" désignent le même
 * événement), pour chaque Anomalie éligible actuellement en jeu, quel que
 * soit son contrôleur.
 */
export function applyCardPlayedAnomalies(
  state: GameState,
  affectedPlayerId: PlayerId,
  cardType: string,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };

  for (const { owner, unit, def } of allAnomalyInstances(state)) {
    const key = `anomalyCardPlayed:${affectedPlayerId}`;
    if (!oncePerTurnAvailable(unit, key, turnNumber)) continue;

    let amount = def.anomalyReasonLossOnFirstCardPlayedPerTurn ?? 0;
    const permanentSpec = def.anomalyReasonLossOnFirstPermanentPlayedPerTurn;
    if (permanentSpec) {
      amount += permanentSpec.amount + (cardType === "creature" ? permanentSpec.bonusIfCreature ?? 0 : 0);
    }
    if (amount <= 0) continue;

    nextState = replaceUnit(nextState, owner.id, unit.instanceId, (u) => markOncePerTurnUsed(u, key, turnNumber));
    const player = getPlayer(nextState, affectedPlayerId);
    events.push({ ...base, type: "REASON_CHANGED", playerId: affectedPlayerId, delta: -amount });
    nextState = replacePlayer(nextState, { ...player, reason: Math.max(0, player.reason - amount) });
  }

  return { state: nextState, events };
}

/**
 * Perte de Raison de "Les Voix dans le Sillage" : la 1ère fois PAR TOUR
 * qu'un permanent de `affectedPlayerId` quitte le plateau (mort, Sabordage
 * — qui déclenche toujours `onDeath` en plus de `onSaborde`, jamais compté
 * deux fois ici puisque seul `onDeath`/`onExpire` appelle cette fonction —
 * ou expiration de durée).
 */
export function applyPermanentLeftAnomalies(
  state: GameState,
  affectedPlayerId: PlayerId,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };

  for (const { owner, unit, def } of allAnomalyInstances(state)) {
    const amount = def.anomalyReasonLossOnFirstPermanentLeavingPerTurn ?? 0;
    if (amount <= 0) continue;
    const key = `anomalyPermanentLeft:${affectedPlayerId}`;
    if (!oncePerTurnAvailable(unit, key, turnNumber)) continue;

    nextState = replaceUnit(nextState, owner.id, unit.instanceId, (u) => markOncePerTurnUsed(u, key, turnNumber));
    const player = getPlayer(nextState, affectedPlayerId);
    events.push({ ...base, type: "REASON_CHANGED", playerId: affectedPlayerId, delta: -amount });
    nextState = replacePlayer(nextState, { ...player, reason: Math.max(0, player.reason - amount) });
  }

  return { state: nextState, events };
}

/**
 * Réduit un gain de Raison brut selon TOUTES les Anomalies "Le Chant Sous
 * la Ligne" actuellement en jeu (cumulatif, PAS de limite par tour — "à
 * chaque fois" dans le texte de la carte, contrairement aux deux fonctions
 * ci-dessus) — jamais sous 0.
 */
export function reduceReasonGain(state: GameState, amount: number): number {
  let total = amount;
  for (const { def } of allAnomalyInstances(state)) {
    if (def.anomalyReduceAllReasonGains) {
      total = Math.max(0, total - def.anomalyReduceAllReasonGains);
    }
  }
  return total;
}

export interface TideChangeAnomalyResult {
  tideRemainingTurns: number;
  anchorDamagePerShip: number;
}

/**
 * "La Mer Réclame Davantage" : à chaque CHANGEMENT d'état de Marée (jamais
 * un simple décompte de durée dans le même état), réduit la durée
 * d'entrée du nouvel état d'autant, et cumule les dégâts d'Ancrage
 * infligés à CHAQUE Navire pour la variante abyssale. Lu AVANT que le
 * changement ne soit committé dans `state` (le nouvel état n'y figure pas
 * encore) — n'importe quelle Anomalie déjà en jeu, contrôleur confondu.
 */
export function applyTideChangeAnomalies(state: GameState, baseTideRemainingTurns: number): TideChangeAnomalyResult {
  let tideRemainingTurns = baseTideRemainingTurns;
  let anchorDamagePerShip = 0;
  for (const { def } of allAnomalyInstances(state)) {
    const spec = def.anomalyReduceTideEntryDuration;
    if (!spec) continue;
    tideRemainingTurns = Math.max(1, tideRemainingTurns - spec.amount);
    anchorDamagePerShip += spec.anchorDamagePerShip ?? 0;
  }
  return { tideRemainingTurns, anchorDamagePerShip };
}
