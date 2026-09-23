import { concede } from "@/game/actions/concede";
import type { ActionResult, PlayerAction, TimeoutAction } from "@/game/actions/types";
import type { GameEvent } from "@/game/events/types";
import { RULES } from "@/game/rules/constants";
import { nextTimeoutEndsGame, turnTimerExpired } from "@/game/rules/turnTimer";
import type { GameState, PlayerState } from "@/game/state/types";

/**
 * ÉCHÉANCE MANQUÉE. Le joueur attendu n'a pas répondu à temps
 * (`game/rules/turnTimer.ts`).
 *
 * Action du moteur comme les autres, et c'est voulu : le SERVEUR décide
 * QUAND elle est légale (il a l'heure), le MOTEUR décide ce qu'elle fait.
 * Rien de ce qui arrive à expiration n'est écrit dans une couche de
 * transport.
 *
 * Ce qu'elle fait, précisément :
 *   - elle joue le geste le plus NEUTRE possible à la place du joueur —
 *     passer la fenêtre, refuser le choix quand c'est permis, sinon rendre
 *     la main. Jamais un coup qu'il n'a pas voulu ;
 *   - elle compte un point contre lui ;
 *   - au `MAX_MISSED_DEADLINES`-ième point CONSÉCUTIF, elle vaut abandon.
 *
 * Un joueur qui rejoue remet son compteur à zéro (`withDeadlineMet`) : un
 * rafraîchissement de page coûte un tour, pas la partie.
 */

/** Efface les échéances manquées de ce joueur : il vient de répondre, il est donc là. */
export function withDeadlineMet(state: GameState, playerId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.missedDeadlines) return state;
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, missedDeadlines: 0 } : p)) as [
      PlayerState,
      PlayerState,
    ],
  };
}

/**
 * Le geste neutre à jouer à la place du joueur absent, selon ce qu'on
 * attendait de lui. Toujours une action EXISTANTE du moteur : une échéance
 * manquée n'ouvre aucun chemin que le joueur n'aurait pas pu prendre.
 */
function defaultActionFor(state: GameState, playerId: string): PlayerAction {
  if (state.pendingReaction) return { type: "passReaction", playerId };
  if (state.pendingChoice) {
    const choice = state.pendingChoice;
    // Un regard de pioche se referme sans rien prendre : les cartes
    // repassent sous la pioche, et le joueur n'a rien perdu d'autre que
    // l'occasion.
    if (choice.kind === "deckLook") return { type: "resolveChoice", playerId, choice: { takeInstanceIds: [] } };
    // « JUSQU'À N » : ne rien répartir est une réponse légale.
    if (choice.kind === "healAllocation") return { type: "resolveChoice", playerId, choice: { healAllocation: [] } };
    if (choice.kind === "keepUnits") return { type: "resolveChoice", playerId, choice: { keepInstanceIds: [] } };
    if (choice.kind === "pickUnits") return { type: "resolveChoice", playerId, choice: { pickInstanceIds: [] } };
    if (choice.kind === "handDiscard") {
      // Une défausse attend son compte exact de cartes ; « ne rien
      // défausser » n'est permis que si le texte le permet.
      if (choice.refusable) return { type: "resolveChoice", playerId, choice: "pass" };
      if (choice.atMost) return { type: "resolveChoice", playerId, choice: { discardInstanceIds: [] } };
      const hand = state.players.find((p) => p.id === playerId)?.hand ?? [];
      return {
        type: "resolveChoice",
        playerId,
        choice: { discardInstanceIds: hand.slice(0, choice.count).map((card) => card.instanceId) },
      };
    }
    if (choice.kind === "abilityOption") {
      return { type: "resolveChoice", playerId, choice: "pass" };
    }
    // « Choisissez une couleur » : refuser si le texte le permet, sinon la
    // première proposée — un choix imposé ne reste pas sans réponse.
    if (choice.kind === "chromaticColor") {
      return choice.refusable
        ? { type: "resolveChoice", playerId, choice: "pass" }
        : { type: "resolveChoice", playerId, choice: { color: choice.options[0]! } };
    }
    // « Vous pouvez la placer sous sa pioche » : ne rien faire la laisse dessus.
    if (choice.kind === "deckTopDecision") return { type: "resolveChoice", playerId, choice: "pass" };
    // Anomalie qui IMPOSE un choix (Le Fond Vous Regarde) : perdre de la
    // Raison plutôt que de l'Ancrage — le moins irréversible des deux.
    return { type: "resolveChoice", playerId, choice: "reasonLoss" };
  }
  return { type: "endTurn", playerId };
}

/**
 * Applique une échéance manquée. `applyAction` lui passe le geste par
 * défaut à rejouer : `timeout` n'appelle pas `dispatch` elle-même, sinon
 * une action en déclencherait une autre au milieu du pipeline.
 */
export function timeout(
  state: GameState,
  action: TimeoutAction,
  applyDefault: (state: GameState, action: PlayerAction) => ActionResult
): ActionResult {
  if (state.status !== "active") return { ok: false, error: "La partie est déjà terminée." };
  if (!state.players.some((p) => p.id === action.playerId)) return { ok: false, error: "Joueur inconnu." };
  if (state.turnTimer?.awaitingPlayerId !== action.playerId) {
    return { ok: false, error: "Ce joueur n'est pas celui dont on attend une action." };
  }
  // `now` vient du serveur, jamais de l'action : une échéance ne s'invoque
  // pas, elle se constate.
  if (!turnTimerExpired(state, action.now ?? Date.now())) {
    return { ok: false, error: "Le délai de ce joueur n'est pas écoulé." };
  }

  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };
  const missed = (state.players.find((p) => p.id === action.playerId)?.missedDeadlines ?? 0) + 1;
  const endsGame = nextTimeoutEndsGame(state, action.playerId);

  const counted: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === action.playerId ? { ...p, missedDeadlines: missed } : p)) as [
      PlayerState,
      PlayerState,
    ],
  };

  const timeoutEvent: GameEvent = {
    ...base,
    type: "TURN_TIMED_OUT",
    playerId: action.playerId,
    missedDeadlines: missed,
    limit: RULES.MAX_MISSED_DEADLINES,
  };

  if (endsGame) {
    const forfeit = concede(counted, { type: "concede", playerId: action.playerId });
    if (!forfeit.ok) return forfeit;
    return {
      ok: true,
      state: forfeit.state,
      // L'événement d'échéance précède la fin : c'est l'ordre dans lequel
      // le joueur d'en face doit pouvoir le lire.
      events: [
        timeoutEvent,
        ...forfeit.events.map((event) => (event.type === "GAME_ENDED" ? { ...event, reason: "timeout" as const } : event)),
      ],
    };
  }

  const fallback = applyDefault(counted, defaultActionFor(counted, action.playerId));
  // Le geste neutre a été refusé (état inattendu) : le point est compté
  // quand même, sinon une partie bloquée le resterait pour toujours.
  if (!fallback.ok) return { ok: true, state: counted, events: [timeoutEvent] };
  return { ok: true, state: fallback.state, events: [timeoutEvent, ...fallback.events] };
}
