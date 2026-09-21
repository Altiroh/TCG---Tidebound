import { activateAbility } from "@/game/actions/activateAbility";
import { activateReaction } from "@/game/actions/activateReaction";
import { activateShipAbility } from "@/game/actions/activateShipAbility";
import { advancePhase } from "@/game/actions/advancePhase";
import { attack } from "@/game/actions/attack";
import { breakObject } from "@/game/actions/breakObject";
import { concede } from "@/game/actions/concede";
import { endTurn, entameDeTour } from "@/game/actions/endTurn";
import { fireShipAbility } from "@/game/actions/fireShipAbility";
import { passReaction } from "@/game/actions/passReaction";
import { playCard } from "@/game/actions/playCard";
import { resolveChoice } from "@/game/actions/resolveChoice";
import { saborder } from "@/game/actions/saborder";
import type { ActionResult, PlayerAction } from "@/game/actions/types";
import { openReactionWindowIfEligible } from "@/game/reactions/reactionWindow";
import { resolveOceanJudgment } from "@/game/rules/oceanJudgment";
import { processDeaths } from "@/game/state/processDeaths";
import { processLoneCreatureChanges, processPowerGains, snapshotEffectivePower, snapshotLoneCreatures } from "@/game/triggers/triggerBus";
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
  // Exception : l'abandon, qui doit rester possible à tout instant — sinon
  // un joueur parti sans répondre laisserait l'autre coincé sur une fenêtre
  // que plus personne ne fermera.
  if (state.pendingReaction && !REACTION_ACTION_TYPES.has(action.type) && action.type !== "concede") {
    return { ok: false, error: "Une fenêtre de réaction est ouverte : activez une capacité facultative éligible, ou passez." };
  }

  // Même principe pour un choix forcé en attente (ex: Le Fond Vous
  // Regarde) : seule `resolveChoice` est acceptée tant qu'il reste ouvert.
  if (state.pendingChoice && action.type !== "resolveChoice" && action.type !== "concede") {
    return { ok: false, error: "Un choix est en attente : résolvez-le avant toute autre action." };
  }

  // Photo des Puissances AVANT l'action : ce qui a augmenté après coup
  // déclenchera `onPowerGained` (cf. `processPowerGains`).
  const powerBefore = snapshotEffectivePower(state);
  // Même principe pour "devient votre seule Créature" (`onBecomeOnlyCreature`).
  const loneBefore = snapshotLoneCreatures(state);

  let result = applyAction(state, action);
  if (!result.ok) return result;

  // --- REPRISE D'UNE ATTAQUE SUSPENDUE ---------------------------------
  //
  // Une attaque directe s'arrête à sa déclaration quand le défenseur a un
  // piège à proposer (`attack.ts`). Dès que cette fenêtre se referme — le
  // défenseur a activé ou passé —, l'attaque se résout pour de bon, ici et
  // pas ailleurs : `dispatch` est le seul endroit que TOUTES les actions
  // traversent, donc le seul où la reprise ne peut pas être oubliée.
  //
  // `pendingAttack` reste posé PENDANT la reprise : c'est lui qui porte le
  // drapeau `intercepted` qu'un piège vient éventuellement de lever, et sa
  // présence empêche `attack()` de rouvrir la même fenêtre à l'infini. Il
  // n'est retiré qu'une fois l'attaque résolue.
  if (result.state.status === "active" && !result.state.pendingReaction && result.state.pendingAttack) {
    const suspendue = result.state.pendingAttack;
    const repris = applyAction(
      result.state,
      suspendue.kind === "tirDeNavire"
        ? { type: "fireShipAbility", playerId: suspendue.playerId }
        : { type: "attack", playerId: suspendue.playerId, attackerInstanceId: suspendue.attackerInstanceId }
    );
    // Une attaque devenue illégale entre-temps (l'attaquant a été détruit
    // par le piège lui-même) ne casse rien : on abandonne la reprise et on
    // garde l'état tel que la fenêtre l'a laissé.
    result = repris.ok
      ? { ok: true, state: { ...repris.state, pendingAttack: undefined }, events: [...result.events, ...repris.events] }
      : { ok: true, state: { ...result.state, pendingAttack: undefined }, events: result.events };
  }

  // --- REPRISE D'UNE ENTAME DE TOUR SUSPENDUE ---------------------------
  //
  // Même geste, à l'autre bout du tour : `endTurn` s'arrête à l'ANNONCE de
  // la Marée quand une Ancre de Dérive a quelque chose à proposer. Dès que
  // la fenêtre se referme, l'entame reprend là où elle s'était arrêtée —
  // effets de la Marée (reportés ou non), expirations, Raison, pioche.
  //
  // Contrairement à une attaque, rien n'est rejoué : `entameDeTour` est la
  // SUITE, pas une répétition, et `pendingTideStep` porte tout ce qu'il lui
  // faut pour la reprendre à l'identique.
  if (result.state.status === "active" && !result.state.pendingReaction && result.state.pendingTideStep) {
    const repris = entameDeTour(result.state);
    if (repris.ok) result = { ok: true, state: repris.state, events: [...result.events, ...repris.events] };
  }

  const deaths = processDeaths(result.state, state.turnNumber);
  const powerGains = processPowerGains(deaths.state, powerBefore, state.turnNumber);
  const loneCreatures = processLoneCreatureChanges(powerGains.state, loneBefore, state.turnNumber);
  const allEvents: GameEvent[] = [...result.events, ...deaths.events, ...powerGains.events, ...loneCreatures.events];

  const stateWithEvents: GameState = {
    ...loneCreatures.state,
    eventLog: [...loneCreatures.state.eventLog, ...allEvents],
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
  //
  // `!finalState.pendingReaction` : une action qui a ouvert sa PROPRE
  // fenêtre en cours de route — l'interception d'une attaque, l'annonce
  // d'une Marée — a déjà dit qui doit répondre et à quoi. En ouvrir une
  // seconde par-dessus écraserait la première et perdrait la suspension.
  if (
    finalState.status === "active" &&
    !finalState.pendingOceanJudgment &&
    !finalState.pendingChoice &&
    !finalState.pendingReaction &&
    !REACTION_ACTION_TYPES.has(action.type)
  ) {
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
  if (finalState.status !== "active" && finalState.pendingChoice) {
    finalState = { ...finalState, pendingChoice: undefined };
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
    case "activateShipAbility":
      return activateShipAbility(state, action);
    case "fireShipAbility":
      return fireShipAbility(state, action);
    case "resolveChoice":
      return resolveChoice(state, action);
    case "concede":
      return concede(state, action);
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
