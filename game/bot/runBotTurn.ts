import { chooseBotAction } from "@/game/bot/chooseAction";
import type { BotDifficulty } from "@/game/bot/types";
import { dispatch } from "@/game/engine";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * Garde-fou défensif contre une boucle infinie — en pratique largement
 * suffisant pour un tour complet (cartes jouées + permanents
 * sabordés/brisés + attaques + éventuelles réactions), jamais atteint en
 * jeu normal.
 */
const MAX_ACTIONS_PER_TURN = 40;

/** `true` si CE joueur a quelque chose à décider maintenant : soit c'est son tour, soit une fenêtre de réaction l'attend (peut survenir hors de son tour — ex: l'adversaire vient de jouer une carte). */
function hasSomethingToDo(state: GameState, playerId: PlayerId): boolean {
  return state.activePlayerId === playerId || state.pendingReaction?.awaitingPlayerId === playerId;
}

/**
 * Joue un tour ENTIER pour le bot : choisit et applique des actions en
 * boucle jusqu'à ce qu'il passe (`endTurn`) ou qu'il n'ait plus rien à
 * décider (tour terminé, fin de partie en cours de tour). Gère aussi les
 * fenêtres de réaction qui l'attendent, même hors de son propre tour
 * (l'adversaire vient de jouer une carte à laquelle le bot peut
 * réagir) — la boucle continue tant qu'il a quelque chose à faire, sans
 * jamais rendre la main "dans le vide". Ne fait jamais planter la
 * partie : si une action censée être déjà valide (simulée via `dispatch`
 * dans `chooseBotAction`) est malgré tout refusée — ce qui ne devrait
 * jamais arriver — on force `endTurn`/`passReaction` en filet de
 * sécurité.
 */
export function runBotTurn(initialState: GameState, playerId: PlayerId, difficulty: BotDifficulty): GameState {
  let state = initialState;

  for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
    if (state.status !== "active" || !hasSomethingToDo(state, playerId)) return state;

    const action = chooseBotAction(state, playerId, difficulty);
    const result = dispatch(state, action);
    if (!result.ok) {
      const fallbackAction = state.pendingReaction ? { type: "passReaction" as const, playerId } : { type: "endTurn" as const, playerId };
      const fallback = dispatch(state, fallbackAction);
      return fallback.ok ? fallback.state : state;
    }

    state = result.state;
    if (action.type === "endTurn") return state;
  }

  return state;
}
