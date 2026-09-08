import { attack } from "@/game/actions/attack";
import { breakObject } from "@/game/actions/breakObject";
import { endTurn } from "@/game/actions/endTurn";
import { playCard } from "@/game/actions/playCard";
import { saborder } from "@/game/actions/saborder";
import type { ActionResult, PlayerAction } from "@/game/actions/types";
import { resolveOceanJudgment } from "@/game/rules/oceanJudgment";
import { processDeaths } from "@/game/state/processDeaths";
import type { GameEvent } from "@/game/events/types";
import type { GameState } from "@/game/state/types";

/**
 * Point d'entrée unique du moteur : reçoit une action de joueur, la valide
 * et l'applique. C'est la SEULE fonction que le code serveur devrait
 * appeler pour faire progresser une partie — jamais les actions
 * individuelles directement, pour garantir que `processDeaths` et la
 * condition de victoire sont toujours vérifiées après chaque action.
 */
export function dispatch(state: GameState, action: PlayerAction): ActionResult {
  const result = applyAction(state, action);
  if (!result.ok) return result;

  const deaths = processDeaths(result.state, state.turnNumber);
  const allEvents: GameEvent[] = [...result.events, ...deaths.events];

  const stateWithEvents: GameState = {
    ...deaths.state,
    eventLog: [...deaths.state.eventLog, ...allEvents],
  };

  let finalState = checkWinCondition(stateWithEvents);
  let finalEvents = allEvents;

  // "Jugement de l'Océan" : une pioche dans un deck vide a posé le drapeau
  // — on résout la comparaison de Résilience maintenant, après les morts
  // et la vérification normale de victoire, avant de rendre la main.
  if (finalState.status === "active" && finalState.pendingOceanJudgment) {
    const judgment = resolveOceanJudgment(finalState, finalState.pendingOceanJudgment.playerId);
    finalState = judgment.state;
    finalEvents = [...finalEvents, ...judgment.events];
  }

  return { ok: true, state: finalState, events: finalEvents };
}

function applyAction(state: GameState, action: PlayerAction): ActionResult {
  switch (action.type) {
    case "playCard":
      return playCard(state, action);
    case "attack":
      return attack(state, action);
    case "endTurn":
      return endTurn(state, action);
    case "saborder":
      return saborder(state, action);
    case "breakObject":
      return breakObject(state, action);
    default: {
      const exhaustiveCheck: never = action;
      return { ok: false, error: `Action inconnue: ${JSON.stringify(exhaustiveCheck)}` };
    }
  }
}

/**
 * Vérifie la condition de victoire du MVP : rupture de l'Ancrage
 * (cadrage section 17). Un joueur à 0 d'Ancrage (ou moins) perd. En cas
 * d'égalité (les deux à 0 la même action), la partie est déclarée
 * nulle — pas de vainqueur.
 */
function checkWinCondition(state: GameState): GameState {
  if (state.status === "finished") return state;

  const dead = state.players.filter((p) => p.anchor <= 0);
  if (dead.length === 0) return state;

  const winner = state.players.find((p) => p.anchor > 0);

  return {
    ...state,
    status: "finished",
    winnerId: winner?.id,
    eventLog: [
      ...state.eventLog,
      {
        type: "GAME_ENDED",
        turnNumber: state.turnNumber,
        timestamp: Date.now(),
        winnerId: winner?.id,
        reason: "anchorZero",
      },
    ],
  };
}
