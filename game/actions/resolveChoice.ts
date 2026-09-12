import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import { consumeReasonLossShield } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, ResolveChoiceAction } from "@/game/actions/types";

function validate(state: GameState, action: ResolveChoiceAction) {
  const generalChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!generalChecks.ok) return generalChecks;

  if (!state.pendingChoice) {
    return { ok: false as const, error: "Aucun choix n'est en attente." };
  }
  if (state.pendingChoice.playerId !== action.playerId) {
    return { ok: false as const, error: "Ce choix n'attend pas ce joueur." };
  }

  return { ok: true as const };
}

/**
 * Résout un choix binaire forcé (ex: Le Fond Vous Regarde) : perdre de la
 * Raison (soumise aux boucliers "1ère fois par tour" comme toute autre
 * perte de Raison, `consumeReasonLossShield`), ou infliger des dégâts
 * d'Ancrage à son PROPRE Navire (jamais intercepté par un bouclier —
 * l'auto-infliction n'est ni une attaque ni un dégât de Marée).
 */
export function resolveChoice(state: GameState, action: ResolveChoiceAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const choice = state.pendingChoice!;
  const events: GameEvent[] = [];
  const base = { turnNumber: choice.turnNumber, timestamp: Date.now() };
  let nextState: GameState = { ...state, pendingChoice: undefined };

  if (action.choice === "reasonLoss") {
    const shield = consumeReasonLossShield(nextState, action.playerId, choice.turnNumber);
    nextState = shield.state;
    const finalAmount = Math.max(0, choice.reasonLossAmount - shield.reduction);
    if (finalAmount > 0) {
      const player = getPlayer(nextState, action.playerId);
      events.push({ ...base, type: "REASON_CHANGED", playerId: action.playerId, delta: -finalAmount });
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === action.playerId ? { ...player, reason: Math.max(0, player.reason - finalAmount) } : p
        ) as [PlayerState, PlayerState],
      };
    }
  } else {
    const player = getPlayer(nextState, action.playerId);
    events.push({ ...base, type: "DAMAGE", targetPlayerId: action.playerId, amount: choice.anchorDamageAmount });
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === action.playerId ? { ...player, anchor: player.anchor - choice.anchorDamageAmount } : p
      ) as [PlayerState, PlayerState],
    };
  }

  return { ok: true, state: nextState, events };
}
