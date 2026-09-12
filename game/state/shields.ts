import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, CardInstance } from "@/game/cards/types";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";

/**
 * Boucliers "la première fois PAR TOUR que..." (cf. `CardInstance.oncePerTurnFlags`).
 * Centralise la recherche/consommation d'un bouclier disponible sur le
 * plateau d'un joueur, réutilisée par chaque mécanisme concret ci-dessous
 * (perte de Raison, dégâts au Navire, dégâts à une unité...) plutôt que de
 * dupliquer la même boucle "trouve la première carte éligible, marque-la
 * utilisée" à chaque nouvel effet de ce type.
 */
function findAvailableShield<T>(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number,
  key: string,
  getSpec: (def: CardDefinition) => T | undefined
): { unit: CardInstance; spec: T } | undefined {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return undefined;
  for (const unit of player.board) {
    const spec = getSpec(getCardDefinition(unit.cardId));
    if (spec === undefined) continue;
    if (!oncePerTurnAvailable(unit, key, turnNumber)) continue;
    return { unit, spec };
  }
  return undefined;
}

function consumeShield(state: GameState, playerId: PlayerId, unit: CardInstance, key: string, turnNumber: number): GameState {
  const player = getPlayer(state, playerId);
  const board = player.board.map((u) => (u.instanceId === unit.instanceId ? markOncePerTurnUsed(u, key, turnNumber) : u));
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...player, board } : p)) as [PlayerState, PlayerState],
  };
}

/** Réduction de perte de Raison disponible (Vieux Loup de Mer, Second au Visage Pâle) — 0 si aucun bouclier éligible. */
export function consumeReasonLossShield(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number
): { state: GameState; reduction: number } {
  const match = findAvailableShield(state, playerId, turnNumber, "reasonLossShield", (def) => {
    const shield = def.reduceOwnReasonLossOncePerTurn;
    if (!shield) return undefined;
    if (shield.tideStateIn && !shield.tideStateIn.includes(state.environment.tideState)) return undefined;
    return shield;
  });
  if (!match) return { state, reduction: 0 };
  return { state: consumeShield(state, playerId, match.unit, "reasonLossShield", turnNumber), reduction: match.spec.amount };
}

/** Réduction de dégâts de Marée au Navire disponible (Brise-Vague de Fortune, Tempête uniquement) — 0 si aucun bouclier éligible. */
export function consumeTideShipDamageShield(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number
): { state: GameState; reduction: number } {
  const match = findAvailableShield(state, playerId, turnNumber, "tideShipDamageShield", (def) => {
    const shield = def.reduceTideShipDamageOncePerTurn;
    if (!shield) return undefined;
    if (!shield.tideStateIn.includes(state.environment.tideState)) return undefined;
    return shield;
  });
  if (!match) return { state, reduction: 0 };
  return { state: consumeShield(state, playerId, match.unit, "tideShipDamageShield", turnNumber), reduction: match.spec.amount };
}

/** Réduction de dégâts DIRECTS (attaque d'unité contre le Navire) disponible (Cage de Flottaison) — 0 si aucun bouclier éligible. */
export function consumeDirectShipDamageShield(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number
): { state: GameState; reduction: number } {
  const match = findAvailableShield(state, playerId, turnNumber, "directShipDamageShield", (def) => def.reduceDirectShipDamageOncePerTurn);
  if (!match) return { state, reduction: 0 };
  return {
    state: consumeShield(state, playerId, match.unit, "directShipDamageShield", turnNumber),
    reduction: match.spec,
  };
}

/** Réduction de Puissance de l'ATTAQUANT disponible sur le plateau du DÉFENSEUR (Le Filet qui Respire, attaque directe adverse) — 0 si aucun bouclier éligible. */
export function consumeAttackerPowerShield(
  state: GameState,
  defenderPlayerId: PlayerId,
  turnNumber: number
): { state: GameState; reduction: number } {
  const match = findAvailableShield(state, defenderPlayerId, turnNumber, "attackerPowerShield", (def) => def.reduceAttackerPowerOnDirectAttackOncePerTurn);
  if (!match) return { state, reduction: 0 };
  return {
    state: consumeShield(state, defenderPlayerId, match.unit, "attackerPowerShield", turnNumber),
    reduction: match.spec,
  };
}

/** Réduction de dégâts subis par UNE UNITÉ disponible sur son propre plateau (Baleine aux Cicatrices Blanches, "elle subit des dégâts") — 0 si aucun bouclier éligible sur CETTE instance précisément. */
export function consumeOwnDamageTakenShield(
  state: GameState,
  ownerId: PlayerId,
  unitInstanceId: string,
  turnNumber: number
): { state: GameState; reduction: number } {
  const player = state.players.find((p) => p.id === ownerId);
  const unit = player?.board.find((u) => u.instanceId === unitInstanceId);
  if (!unit) return { state, reduction: 0 };
  const shield = getCardDefinition(unit.cardId).reduceOwnDamageTakenOncePerTurn;
  if (!shield || !oncePerTurnAvailable(unit, "ownDamageTakenShield", turnNumber)) return { state, reduction: 0 };
  return { state: consumeShield(state, ownerId, unit, "ownDamageTakenShield", turnNumber), reduction: shield };
}

/** Restauration "1ère fois par tour" de Résistance perdue par une Structure alliée (Wood Vy) — 0 si aucune carte éligible sur le plateau de `ownerId`. */
export function consumeStructureResistanceRestoreShield(
  state: GameState,
  ownerId: PlayerId,
  turnNumber: number
): { state: GameState; restore: number } {
  const match = findAvailableShield(state, ownerId, turnNumber, "structureResistanceRestoreShield", (def) => def.restoreResistanceOnAllyStructureLossOncePerTurn);
  if (!match) return { state, restore: 0 };
  return {
    state: consumeShield(state, ownerId, match.unit, "structureResistanceRestoreShield", turnNumber),
    restore: match.spec!,
  };
}

/** Nombre de cartes à révéler de la main d'un adversaire ayant activé une réaction pendant le tour de `observerId`, "1ère fois par tour" (Guetteur de Brume) — 0 si aucune carte éligible sur le plateau de `observerId`. */
export function consumeOpponentReactionRevealShield(
  state: GameState,
  observerId: PlayerId,
  turnNumber: number
): { state: GameState; amount: number } {
  const match = findAvailableShield(state, observerId, turnNumber, "opponentReactionRevealShield", (def) => def.revealOpponentHandOnReactionOncePerTurn?.amount);
  if (!match) return { state, amount: 0 };
  return {
    state: consumeShield(state, observerId, match.unit, "opponentReactionRevealShield", turnNumber),
    amount: match.spec,
  };
}
