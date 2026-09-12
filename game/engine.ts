import { activateAbility } from "@/game/actions/activateAbility";
import { activateReaction } from "@/game/actions/activateReaction";
import { advancePhase } from "@/game/actions/advancePhase";
import { attack } from "@/game/actions/attack";
import { breakObject } from "@/game/actions/breakObject";
import { endTurn } from "@/game/actions/endTurn";
import { passReaction } from "@/game/actions/passReaction";
import { playCard } from "@/game/actions/playCard";
import { saborder } from "@/game/actions/saborder";
import type { ActionResult, PlayerAction } from "@/game/actions/types";
import { openReactionWindowIfEligible } from "@/game/reactions/reactionWindow";
import { resolveOceanJudgment } from "@/game/rules/oceanJudgment";
import { processDeaths } from "@/game/state/processDeaths";
import type { GameEvent } from "@/game/events/types";
import type { GameState } from "@/game/state/types";

/** Actions réservées à une fenêtre de réaction ouverte — jamais soumises à `openReactionWindowIfEligible` sur leurs propres résultats, elles déterminent déjà elles-mêmes le prochain état de `pendingReaction`. */
const REACTION_ACTION_TYPES = new Set<PlayerAction["type"]>(["activateReaction", "passReaction"]);

/**
 * Point d'entrée unique du moteur : reçoit une action de joueur, la valide
 * et l'applique. C'est la SEULE fonction que le code serveur devrait
 * appeler pour faire progresser une partie — jamais les actions
 * individuelles directement, pour garantir que `processDeaths` et la
 * condition de victoire sont toujours vérifiées après chaque action.
 */
export function dispatch(state: GameState, action: PlayerAction): ActionResult {
  // Tant qu'une fenêtre de réaction est ouverte (Notion "Moteur de
  // partie" : "tant qu'un effet, une réaction ou une conséquence est en
  // cours de résolution, aucune nouvelle action normale ne peut être
  // commencée"), seules `activateReaction`/`passReaction` sont acceptées.
  if (state.pendingReaction && !REACTION_ACTION_TYPES.has(action.type)) {
    return { ok: false, error: "Une fenêtre de réaction est ouverte : activez une capacité facultative éligible, ou passez." };
  }

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

  // Fenêtre de réaction : `activateReaction`/`passReaction` ont déjà
  // recalculé `pendingReaction` elles-mêmes (chaîne continue, ou se
  // ferme) — ne pas en ouvrir une seconde par-dessus. Pour toute autre
  // action, vérifier si ce qu'elle vient de produire en ouvre une
  // nouvelle (au moins une capacité `optional` devient éligible).
  if (finalState.status === "active" && !finalState.pendingOceanJudgment && !REACTION_ACTION_TYPES.has(action.type)) {
    const opened = openReactionWindowIfEligible(finalState, finalEvents, finalState.turnNumber);
    if (opened) {
      finalState = { ...finalState, pendingReaction: opened };
      finalEvents = [
        ...finalEvents,
        { type: "REACTION_WINDOW_OPENED", turnNumber: opened.turnNumber, timestamp: Date.now(), playerId: opened.awaitingPlayerId },
      ];
    }
  }

  // La partie peut se terminer en cours de chaîne (ex: une réaction
  // porte le coup fatal) : une fenêtre encore ouverte n'a alors plus de
  // sens, personne ne rejouera jamais dessus.
  if (finalState.status !== "active" && finalState.pendingReaction) {
    finalState = { ...finalState, pendingReaction: undefined };
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
    case "advancePhase":
      return advancePhase(state, action);
    case "activateReaction":
      return activateReaction(state, action);
    case "passReaction":
      return passReaction(state, action);
    case "activateAbility":
      return activateAbility(state, action);
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
