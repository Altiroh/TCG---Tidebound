import { chooseBotAction } from "@/game/bot/chooseAction";
import type { BotDifficulty } from "@/game/bot/types";
import { dispatch } from "@/game/engine";
import type { GameState, PlayerId } from "@/game/state/types";

/** Garde-fou défensif : en pratique inatteignable (une action principale au
 * plus, plus au plus une attaque par unité déjà présente sur le plateau). */
const MAX_ACTIONS_PER_TURN = 40;

/**
 * Joue un tour ENTIER pour le bot : choisit et applique des actions en
 * boucle jusqu'à ce qu'il passe (`endTurn`) ou que le tour ne lui
 * appartienne plus (fin de partie en cours de tour). Ne fait jamais
 * planter la partie : si une action censée être déjà valide (simulée via
 * `dispatch` dans `chooseBotAction`) est malgré tout refusée — ce qui ne
 * devrait jamais arriver — on force `endTurn` en filet de sécurité.
 */
export function runBotTurn(initialState: GameState, playerId: PlayerId, difficulty: BotDifficulty): GameState {
  let state = initialState;

  for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
    if (state.status !== "active" || state.activePlayerId !== playerId) return state;

    const action = chooseBotAction(state, playerId, difficulty);
    const result = dispatch(state, action);
    if (!result.ok) {
      const fallback = dispatch(state, { type: "endTurn", playerId });
      return fallback.ok ? fallback.state : state;
    }

    state = result.state;
    if (action.type === "endTurn") return state;
  }

  return state;
}
