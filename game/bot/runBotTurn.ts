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

export interface BotTurnStep {
  state: GameState;
  /** `true` si le bot n'a plus rien à faire (tour terminé, ou fin de partie en cours de tour) — plus la peine d'appeler `stepBotTurn` à nouveau. */
  done: boolean;
}

/**
 * Exécute UNE SEULE action du bot, plutôt que tout son tour d'un coup —
 * pensé pour être rappelé par l'UI avec un délai entre chaque appel
 * (`MatchBoard`), pour que le tour du bot se joue visiblement carte par
 * carte plutôt que de "téléporter" instantanément vers son état final.
 * Même logique de secours que l'ancien `runBotTurn` (une action censée
 * être valide mais refusée force `endTurn`/`passReaction`).
 */
export function stepBotTurn(state: GameState, playerId: PlayerId, difficulty: BotDifficulty): BotTurnStep {
  if (state.status !== "active" || !hasSomethingToDo(state, playerId)) return { state, done: true };

  const action = chooseBotAction(state, playerId, difficulty);
  const result = dispatch(state, action);
  if (!result.ok) {
    const fallbackAction = state.pendingReaction ? { type: "passReaction" as const, playerId } : { type: "endTurn" as const, playerId };
    const fallback = dispatch(state, fallbackAction);
    return { state: fallback.ok ? fallback.state : state, done: true };
  }

  const nextState = result.state;
  const done = action.type === "endTurn" || nextState.status !== "active" || !hasSomethingToDo(nextState, playerId);
  return { state: nextState, done };
}

/**
 * Joue un tour ENTIER pour le bot EN UNE FOIS (boucle synchrone complète,
 * sans rythme visuel) — utilisé par les tests et tout appelant qui n'a pas
 * besoin d'animer le tour action par action. L'UI de jeu (`MatchBoard`)
 * utilise `stepBotTurn` à la place, pour espacer les actions dans le
 * temps.
 */
export function runBotTurn(initialState: GameState, playerId: PlayerId, difficulty: BotDifficulty): GameState {
  let state = initialState;

  for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
    const step = stepBotTurn(state, playerId, difficulty);
    state = step.state;
    if (step.done) return state;
  }

  return state;
}
