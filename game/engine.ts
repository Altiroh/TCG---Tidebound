import { activateAbility } from "@/game/actions/activateAbility";
import { activateReaction } from "@/game/actions/activateReaction";
import { activateShipAbility } from "@/game/actions/activateShipAbility";
import { advancePhase } from "@/game/actions/advancePhase";
import { attack } from "@/game/actions/attack";
import { breakObject, resumeObjectBreakEffects } from "@/game/actions/breakObject";
import { concede } from "@/game/actions/concede";
import { endTurn, entameDeTour } from "@/game/actions/endTurn";
import { fireShipAbility } from "@/game/actions/fireShipAbility";
import { passReaction } from "@/game/actions/passReaction";
import { playCard } from "@/game/actions/playCard";
import { resolveChoice } from "@/game/actions/resolveChoice";
import { saborder } from "@/game/actions/saborder";
import { timeout, withDeadlineMet } from "@/game/actions/timeout";
import type { ActionResult, PlayerAction } from "@/game/actions/types";
import { openReactionWindowIfEligible, ouvrirFenetrePour } from "@/game/reactions/reactionWindow";
import { resolveOceanJudgment } from "@/game/rules/oceanJudgment";
import { refreshTurnTimer } from "@/game/rules/turnTimer";
import { assertValidDefender, hasEffectiveKeyword } from "@/game/rules/validation";
import { processDeaths } from "@/game/state/processDeaths";
import { processChromaticSignals } from "@/game/rules/chromaticSignals";
import {
  processLoneCreatureChanges,
  processPowerGains,
  processReasonGained,
  processSurvivedDamage,
  snapshotEffectivePower,
  snapshotLoneCreatures,
} from "@/game/triggers/triggerBus";
import type { GameEvent } from "@/game/events/types";
import { findCardInstance, type GameState } from "@/game/state/types";

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
  // `activateShipAbility` traverse aussi : une capacité de Navire peut
  // déclarer la fenêtre pour terrain d'activation (`activationWindow`,
  // L'Errant — Changer de cap). Elle refuse d'elle-même si ce n'est pas la
  // sienne, donc rien ne se faufile ici qui ne soit pas éligible.
  if (
    state.pendingReaction &&
    !REACTION_ACTION_TYPES.has(action.type) &&
    action.type !== "concede" &&
    action.type !== "timeout" &&
    action.type !== "activateShipAbility"
  ) {
    return { ok: false, error: "Une fenêtre de réaction est ouverte : activez une capacité facultative éligible, ou passez." };
  }

  // Même principe pour un choix forcé en attente (ex: Le Fond Vous
  // Regarde) : seule `resolveChoice` est acceptée tant qu'il reste ouvert.
  if (state.pendingChoice && action.type !== "resolveChoice" && action.type !== "concede" && action.type !== "timeout") {
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
        : {
            type: "attack",
            playerId: suspendue.playerId,
            attackerInstanceId: suspendue.attackerInstanceId,
            // La CIBLE déclarée aussi : sans elle, une attaque contre une
            // unité reprenait en attaque directe contre le Navire (corrigé
            // le 24/09/2026 — Corde de Rappel passée = coque frappée).
            defenderInstanceId: suspendue.defenderInstanceId ?? gardeQuiIntercepte(result.state, suspendue),
          }
    );
    // Une Garde levée pendant la fenêtre (Pas un Pas de Plus) INTERCEPTE
    // l'attaque directe : elle prend le coup à la place du Navire
    // (`gardeQuiIntercepte`). Une attaque devenue illégale entre-temps
    // (l'attaquant a été détruit par le piège lui-même) ne casse rien : on abandonne la reprise et on
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

  // --- REPRISE D'UN BRIS SUSPENDU ---------------------------------------
  //
  // Le Bris s'était arrêté avant ses effets pour laisser un adversaire les
  // annuler (Fausse Cargaison, Lot 14). La fenêtre vient de se refermer :
  // on résout ce qui attendait — ou on le jette si l'annulation a été
  // activée. L'Objet, lui, est brisé dans les deux cas.
  if (result.state.pendingObjectBreak && !result.state.pendingReaction) {
    const suspendu = result.state.pendingObjectBreak;
    const etatSansBris: GameState = { ...result.state, pendingObjectBreak: undefined };
    if (suspendu.cancelled) {
      result = { ok: true, state: etatSansBris, events: result.events };
    } else {
      const reprise = resumeObjectBreakEffects(etatSansBris, suspendu);
      result = { ok: true, state: reprise.state, events: [...result.events, ...reprise.events] };
    }
  }

  // --- REPRISE D'UNE DESTRUCTION SUSPENDUE ------------------------------
  //
  // La passe précédente s'était arrêtée pour laisser quelqu'un empêcher une
  // destruction (`pendingDestruction`, Lot 14). La fenêtre vient de se
  // refermer : on relance la passe, et ce qui n'a pas été sauvé part
  // maintenant. Le drapeau posé sur chaque instance garantit qu'on ne
  // repose pas la même question.
  if (result.state.pendingDestruction && !result.state.pendingReaction) {
    result = { ...result, state: { ...result.state, pendingDestruction: undefined } };
  }

  let deaths = processDeaths(result.state, state.turnNumber);

  // --- CE QUI NE SE SAIT QU'APRÈS LES MORTS (Lot 15) ---------------------
  //
  // « Survivre à des dégâts » n'a de sens qu'une fois la passe de morts
  // faite ; les Signaux Vert et Violet lisent la carte posée ou la cible
  // désignée telles que l'action les a laissées ; « récupérer de la Raison
  // grâce à une carte » se lit sur tout ce qui précède, Signal Vert compris.
  // Une destruction encore en suspens (fenêtre de sauvetage) repousse tout
  // cela à la reprise : on ne sait pas encore qui a survécu.
  if (!deaths.state.pendingDestruction) {
    const tour = deaths.state.turnNumber;
    const signaux = processChromaticSignals(deaths.state, result.events, tour);
    const survies = processSurvivedDamage(signaux.state, [...result.events, ...deaths.events], tour);
    const raison = processReasonGained(survies.state, [...result.events, ...signaux.events, ...survies.events], tour);
    const produits = [...signaux.events, ...survies.events, ...raison.events];
    if (produits.length > 0) {
      const encore = processDeaths(raison.state, state.turnNumber);
      deaths = { state: encore.state, events: [...deaths.events, ...produits, ...encore.events] };
    } else {
      deaths = { ...deaths, state: raison.state };
    }
  }

  // La passe s'arrête d'elle-même quand un sauvetage est possible. On ouvre
  // alors la fenêtre ICI, avec les événements qui la justifient : c'est le
  // seul endroit qui voit à la fois les morts en attente et le recensement
  // des réactions.
  if (deaths.state.pendingDestruction && !deaths.state.pendingReaction) {
    const attente = deaths.state.pendingDestruction;
    const evenements = attente.instanceIds
      .map((instanceId) => {
        const trouve = findCardInstance(deaths.state, instanceId);
        return trouve
          ? {
              trigger: "onPermanentWouldBeDestroyed" as const,
              sourceInstanceId: instanceId,
              cardId: trouve.card.cardId,
              playerId: trouve.owner.id,
            }
          : undefined;
      })
      .filter((e): e is NonNullable<typeof e> => e !== undefined);
    const fenetre = ouvrirFenetrePour(deaths.state, evenements, attente.turnNumber);
    // Personne ne peut finalement répondre (la cible a changé entre-temps) :
    // on ne laisse pas la destruction en suspens, la passe reprend.
    deaths = fenetre
      ? { ...deaths, state: { ...deaths.state, pendingReaction: fenetre } }
      : processDeaths({ ...deaths.state, pendingDestruction: undefined }, state.turnNumber);
  }

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

  // --- DÉLAI DE TOUR ----------------------------------------------------
  //
  // Ici et nulle part ailleurs : `dispatch` est le seul passage obligé de
  // toutes les actions, donc le seul endroit où le chrono ne peut pas être
  // oublié. Deux gestes, dans cet ordre : le joueur qui vient d'agir a
  // prouvé qu'il est là (son compteur d'échéances retombe à zéro), puis le
  // chrono se recale sur la question suivante.
  if (action.type !== "timeout") finalState = withDeadlineMet(finalState, action.playerId);
  finalState = refreshTurnTimer(finalState, Date.now());

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
    case "timeout":
      // Le geste neutre joué à la place du joueur absent repasse par
      // `applyAction`, jamais par `dispatch` : une action ne doit pas en
      // relancer une autre au milieu du pipeline.
      return timeout(state, action, applyAction);
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

/**
 * Une attaque DIRECTE suspendue que la fenêtre a rendue illégale en levant
 * une Garde (« une unité que vous contrôlez gagne Garde », Pas un Pas de
 * Plus) : c'est cette Garde qui intercepte, le coup se porte sur elle au
 * lieu d'être rendu à l'attaquant. Une seule Garde : rien à décider. Plusieurs
 * Gardes : le choix revient à l'attaquant, qui redéclare — `undefined`, la
 * reprise échoue et l'attaque est rendue comme avant.
 */
function gardeQuiIntercepte(state: GameState, attaque: NonNullable<GameState["pendingAttack"]>): string | undefined {
  if (attaque.kind === "tirDeNavire" || !attaque.attackerInstanceId) return undefined;
  if (assertValidDefender(state, attaque.playerId, attaque.attackerInstanceId).ok) return undefined;
  const defenseur = state.players.find((p) => p.id !== attaque.playerId);
  if (!defenseur) return undefined;
  const gardes = defenseur.board.filter((u) => hasEffectiveKeyword(state, defenseur, u, "garde"));
  if (gardes.length !== 1) return undefined;
  return assertValidDefender(state, attaque.playerId, attaque.attackerInstanceId, gardes[0]!.instanceId).ok
    ? gardes[0]!.instanceId
    : undefined;
}
