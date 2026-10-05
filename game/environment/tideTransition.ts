import { damageShip } from "@/game/state/armor";
import { getShipDefinition } from "@/game/environment/shipData";
import type { TideStateName } from "@/game/environment/types";
import { STATUS_MALADE } from "@/game/cards/types";
import type { CardInstance } from "@/game/cards/types";
import { RULES } from "@/game/rules/constants";
import type { GameEvent } from "@/game/events/types";
import { loseReason } from "@/game/state/shields";
import type { GameState, PlayerState } from "@/game/state/types";

/**
 * EFFETS DE TRANSITION d'un état de Marée à un autre : ce qui se produit
 * une fois, au passage, et pas à chaque tour de l'état.
 *
 *   - entrer dans les Abysses : choc d'Ancrage, Raison max −2 ;
 *   - en sortir : Raison max rendue ;
 *   - quitter la Houle : le statut MALADE tombe.
 *
 * Isolé de `resolveEnvironment.ts` le 29/09/2026 pour que les transitions
 * FORCÉES par une carte (`tideForceAdvance`, `tideForceRetreat`,
 * `tideForceJumpToAbysses`, Régulateur de Courant) passent par le même
 * code que le tick de début de tour. Elles l'ignoraient : une descente
 * forcée n'ôtait pas la Raison max, la sortie naturelle qui suivait la
 * rendait quand même — +2 de Raison max pour les deux joueurs, jusqu'à la
 * fin de la partie, à chaque descente fabriquée par Descente aux Abysses.
 * Ce module n'importe aucun déclencheur : `resolveEffect.ts` peut s'en
 * servir sans cycle.
 */

interface AbyssesEntryLoss {
  anchor: number;
  extraReason: number;
}

/**
 * Choc d'entrée dans les Abysses (une seule fois, pas par tour) : Ancrage
 * fixe modulé par le Navire, plus une éventuelle perte de Raison
 * supplémentaire propre au Navire (ex: "Équipage à bout" du Brise-Lames,
 * `reasonWeaknessByState.abysses`). La réduction de Raison maximale
 * elle-même est appliquée séparément (`applyAbyssesEntryOrExit`).
 */
function computeAbyssesEntryLoss(player: PlayerState): AbyssesEntryLoss {
  const ship = getShipDefinition(player.shipId);
  const resistance = ship.resistanceByState?.abysses ?? 0;
  const weakness = ship.weaknessByState?.abysses ?? 0;
  const anchor = Math.max(0, RULES.ABYSSES_ENTRY_ANCHOR_LOSS + weakness - resistance);
  const extraReason = ship.reasonWeaknessByState?.abysses ?? 0;
  return { anchor, extraReason };
}

/**
 * Applique le choc d'entrée dans les Abysses (-Ancrage one-shot, -Raison
 * max continue avec clampage immédiat de la Raison courante) ou restaure
 * la Raison max à la sortie. Ne fait rien en dehors d'une transition
 * entrante/sortante des Abysses.
 */
export function applyAbyssesEntryOrExit(
  state: GameState,
  previousTideState: TideStateName,
  newTideState: TideStateName,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };

  if (newTideState === "abysses" && previousTideState !== "abysses") {
    // Perte de Raison propre au Navire (`extraReason`) : une perte comme une
    // autre, qui passe par le bouclier de perte de Raison du joueur (Vieux
    // Loup de Mer, Seconde au Visage Pâle). La Raison max réduite, elle,
    // n'est pas une perte : c'est un plafond, appliqué ensuite.
    let shielded = state;
    for (const player of state.players) {
      shielded = loseReason(shielded, player.id, computeAbyssesEntryLoss(player).extraReason, turnNumber).state;
    }
    const players = shielded.players.map((player) => {
      const loss = computeAbyssesEntryLoss(player);
      const reasonMax = Math.max(0, player.reasonMax - RULES.ABYSSES_REASON_MAX_PENALTY);
      const reason = Math.min(player.reason, reasonMax);
      // L'Armure du Navire (Lot 17) encaisse le choc des Abysses avant l'Ancrage.
      const coup = damageShip(player, loss.anchor, turnNumber);
      events.push(...coup.events);
      return { ...coup.player, reasonMax, reason };
    }) as [PlayerState, PlayerState];

    for (let i = 0; i < state.players.length; i++) {
      const before = state.players[i]!;
      const after = players[i]!;
      const loss = computeAbyssesEntryLoss(before);
      if (before.anchor - after.anchor > 0) {
        events.push({ ...base, type: "DAMAGE", targetPlayerId: before.id, amount: before.anchor - after.anchor, targetAnchorAfter: after.anchor });
      }
      if (after.reason !== before.reason) {
        events.push({ ...base, type: "REASON_CHANGED", playerId: before.id, delta: after.reason - before.reason });
      }
    }

    return { state: { ...shielded, players }, events };
  }

  if (previousTideState === "abysses" && newTideState !== "abysses") {
    const players = state.players.map((player) => ({
      ...player,
      reasonMax: player.reasonMax + RULES.ABYSSES_REASON_MAX_PENALTY,
    })) as [PlayerState, PlayerState];
    return { state: { ...state, players }, events };
  }

  return { state, events };
}

export function isSick(unit: CardInstance): boolean {
  return (unit.statuses ?? []).includes(STATUS_MALADE);
}

/** Retire automatiquement le statut MALADE de tout le board dès que la Marée quitte la Houle. */
export function clearHouleSickness(state: GameState, turnNumber: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };

  for (const player of state.players) {
    for (const unit of player.board) {
      if (isSick(unit)) events.push({ ...base, type: "STATUS_CHANGED", targetInstanceId: unit.instanceId, status: STATUS_MALADE, applied: false });
    }
  }

  const players = state.players.map((player) => ({
    ...player,
    board: player.board.map((unit) =>
      isSick(unit) ? { ...unit, statuses: unit.statuses!.filter((s) => s !== STATUS_MALADE) } : unit
    ),
  })) as [PlayerState, PlayerState];

  return { state: { ...state, players }, events };
}

/**
 * Transition FORCÉE par un effet de carte : le choc d'entrée ou de sortie
 * s'applique au moment même où l'état change — le tick suivant, lui, ne
 * verra plus de transition (son « état précédent » est déjà le nouveau).
 * Les effets DE TOUR du nouvel état, eux, attendent ce tick, comme avant.
 */
export function applyForcedTideTransition(
  state: GameState,
  previousTideState: TideStateName,
  newTideState: TideStateName,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  if (previousTideState === newTideState) return { state, events: [] };
  const abysses = applyAbyssesEntryOrExit(state, previousTideState, newTideState, turnNumber);
  if (previousTideState !== "houle") return abysses;
  const cleared = clearHouleSickness(abysses.state, turnNumber);
  return { state: cleared.state, events: [...abysses.events, ...cleared.events] };
}
