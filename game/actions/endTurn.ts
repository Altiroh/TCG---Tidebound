import { applyTideTurnEffects, resolveTideTurnStep } from "@/game/environment/resolveEnvironment";
import { getShipDefinition } from "@/game/environment/shipData";
import { deraisonAnchorDamage, deraisonDebt, reasonCeiling, startingReasonCap } from "@/game/state/reason";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import { RULES } from "@/game/rules/constants";
import { assertGameActive, assertIsActivePlayer, assertPlayerInGame, combine } from "@/game/rules/validation";
import { findAnomalyForcedChoice } from "@/game/state/anomalies";
import { getOpponent, STATUS_NO_REASON_GAIN, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, EndTurnAction } from "@/game/actions/types";

function validate(state: GameState, action: EndTurnAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId)
  );
}

/**
 * Termine le tour du joueur actif. Deux temps distincts (Notion "Moteur de
 * partie — déroulement, Raison & chaînes d'effets", verrouillage du
 * 2026-09-10) :
 *
 * A. Fin de tour DU JOUEUR QUI TERMINE : effets de fin de tour, défausse
 *    forcée, puis — en tout dernier — règlement de SA Déraison (dette sous
 *    0 → dégâts d'Ancrage, Raison remise à 0). Un joueur qui passe sous 0
 *    en cours de tour n'est donc pas sanctionné immédiatement : il peut
 *    encore récupérer de la Raison avant la fin de son tour pour l'éviter.
 *
 * B. Début de tour DU JOUEUR QUI DEVIENT ACTIF (structure verrouillée,
 *    resynchronisée 2026-09-10 après éviction du sous-système des Eaux) :
 *   1. Vérification de la Marée (décompte + progression + orientation + dégâts du tour)
 *   2. Effets différés — non modélisés pour le MVP, étape ignorée
 *   3. Remise à niveau de la Raison : 25 % / 50 % / 75 % de la Raison max aux 3 premiers tours du joueur, puis 100 %
 *   4. Pioche d'une carte
 *   5. Phase principale : dégel des unités (résiliation des attaques,
 *      nettoyage des modificateurs temporaires) — aucune action à
 *      réinitialiser : jouer une carte/Saborder/Briser ne sont plus
 *      limités à une fois par tour.
 */
export function endTurn(state: GameState, action: EndTurnAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const endOfTurnTrigger = processTrigger(
    state,
    { trigger: "endOfTurn", playerId: action.playerId },
    state.turnNumber
  );
  let nextState = endOfTurnTrigger.state;
  events.push({ ...base, type: "END_TURN", playerId: action.playerId });
  events.push(...endOfTurnTrigger.events);

  // --- Effets de Marée reportés (Ancre de Dérive) : "ne s'appliquent qu'à
  // la fin du tour en cours" — c'est maintenant.
  const deferred = nextState.environment.deferredTideEffects;
  if (deferred) {
    nextState = { ...nextState, environment: { ...nextState.environment, deferredTideEffects: undefined } };
    const applied = applyTideTurnEffects(nextState, deferred.previousTideState, deferred.tideState, deferred.intensity, state.turnNumber);
    nextState = applied.state;
    events.push(...applied.events);
  }

  // Le tour se termine : les bonus "jusqu'à la fin du tour" tombent, sur
  // les DEUX plateaux (une carte peut en donner à l'adversaire) et avant
  // que le joueur suivant ne commence — un +1 Puissance donné pour une
  // attaque ne doit pas servir à défendre au tour d'après. Les bonus
  // "jusqu'à votre prochain tour", eux, sont retirés plus bas, au début du
  // tour de leur contrôleur.
  nextState = {
    ...nextState,
    players: nextState.players.map((player) => ({
      ...player,
      board: player.board.map((unit) => ({
        ...unit,
        modifiers: unit.modifiers.filter((modifier) => modifier.duration !== "endOfTurn"),
      })),
    })) as [PlayerState, PlayerState],
  };

  // --- Défausse forcée (cadrage "Règles & mécaniques verrouillées" : main
  // maximale 7) : appliquée en fin de tour, pour le joueur qui vient de
  // jouer, avant de passer la main. Aucun choix de joueur n'existe encore
  // pour sélectionner les cartes défaussées ("Choix de joueur en cours de
  // résolution" non modélisé) : on défausse déterministiquement depuis le
  // début de la main, comme pour la défausse liée aux dégâts de Marée
  // (`game/environment/resolveEnvironment.ts`).
  const endingPlayer = nextState.players.find((p) => p.id === action.playerId)!;
  if (endingPlayer.hand.length > RULES.MAX_HAND_SIZE) {
    let discardHand = endingPlayer.hand;
    let discardGraveyard = endingPlayer.graveyard;
    while (discardHand.length > RULES.MAX_HAND_SIZE) {
      const [discarded, ...rest] = discardHand;
      discardHand = rest;
      discardGraveyard = [...discardGraveyard, { ...discarded!, graveyardCause: "discarded" as const }];
      events.push({ ...base, type: "CARD_MOVED", instanceId: discarded!.instanceId, fromZone: "hand", toZone: "graveyard" });
    }
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === endingPlayer.id ? { ...p, hand: discardHand, graveyard: discardGraveyard } : p
      ) as [PlayerState, PlayerState],
    };
  }

  // --- Règlement de la Déraison du joueur qui TERMINE, en tout dernier
  // (plus aucun effet de fin de tour ne peut encore lui rendre de Raison) :
  // chaque point sous 0 coûte `DERAISON_ANCHOR_DAMAGE_PER_POINT` Ancrage
  // (moins la réduction éventuelle du Navire, ex: Pénitence), puis la dette
  // est effacée. Remplace l'ancienne règle "Raison à 0 en fin de tour =
  // -1 Ancrage" : terminer exactement à 0 ne coûte plus rien.
  const playerEndingTurn = nextState.players.find((p) => p.id === action.playerId)!;
  const debt = deraisonDebt(playerEndingTurn.reason);
  if (debt > 0) {
    const anchorDamage = deraisonAnchorDamage(playerEndingTurn, playerEndingTurn.reason);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerEndingTurn.id ? { ...p, anchor: p.anchor - anchorDamage, reason: 0 } : p
      ) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "DERAISON_SETTLED", playerId: playerEndingTurn.id, debt, anchorDamage });
    // Pas de REASON_CHANGED pour la remise à 0 : DERAISON_SETTLED la porte déjà (évite un "+N Raison" trompeur dans le journal).
    if (anchorDamage > 0) {
      events.push({
        ...base,
        type: "DAMAGE",
        targetPlayerId: playerEndingTurn.id,
        amount: anchorDamage,
        targetAnchorAfter: playerEndingTurn.anchor - anchorDamage,
      });
    }
  }

  const nextPlayer = getOpponent(nextState, action.playerId);
  const newTurnNumber = state.turnNumber + 1;
  const newBase = { turnNumber: newTurnNumber, timestamp: Date.now() };

  nextState = {
    ...nextState,
    turnNumber: newTurnNumber,
    activePlayerId: nextPlayer.id,
    priorityPlayerId: nextPlayer.id,
    // Chaque tour recommence en Phase principale, quelle que soit la phase
    // où le joueur précédent a terminé le sien (il peut passer directement
    // en Fin de tour depuis la Phase principale s'il n'a rien à attaquer).
    phase: "mainPhase",
  };

  // --- 1. Vérification de la Marée (décompte, progression, orientation, dégâts) ---
  const tideStep = resolveTideTurnStep(nextState, newTurnNumber);
  nextState = tideStep.state;
  events.push(...tideStep.events);

  // --- 2. Effets différés : non modélisés pour le MVP, étape ignorée -----

  // --- 3-4. Remise à niveau de la Raison (courbe de début de partie), pioche
  const playerBeforeUpkeep = nextState.players.find((p) => p.id === nextPlayer.id)!;

  // "La Gueule Sous la Mer" : verrou consommé exactement ICI — cette remise
  // à niveau-ci est bloquée, jamais les suivantes ("jusqu'au début de
  // votre prochain tour" = jusqu'à ce moment précis, pas après).
  const reasonGainLocked = playerBeforeUpkeep.statusFlags.includes(STATUS_NO_REASON_GAIN);
  const statusFlagsAfterUpkeep = playerBeforeUpkeep.statusFlags.filter((f) => f !== STATUS_NO_REASON_GAIN);

  // Au début de chacun de ses tours, la Raison du joueur REMONTE à son
  // plafond : 25 % / 50 % / 75 % de sa Raison max à ses 1er/2e/3e tours
  // (`RULES.STARTING_REASON_CURVE`), puis 100 % à chaque tour ensuite
  // (`reasonMax` courant, donc réduit pendant les Abysses). Remplace l'ancien
  // +1 par tour. p1 joue les tours impairs, p2 les pairs : ceil(n / 2) =
  // numéro de CE tour pour lui. Une dette de Déraison encore présente (subie
  // pendant le tour adverse — la sienne propre est déjà réglée en fin de
  // tour) n'est pas effacée : elle est déduite de la remise à niveau.
  let reasonCap = playerBeforeUpkeep.reasonCap;
  if (reasonCap !== undefined) {
    reasonCap = startingReasonCap(getShipDefinition(playerBeforeUpkeep.shipId).reasonMax, Math.ceil(newTurnNumber / 2));
  }
  const refillTarget = reasonCeiling({ reasonMax: playerBeforeUpkeep.reasonMax, reasonCap });
  const reason = reasonGainLocked
    ? playerBeforeUpkeep.reason
    : Math.max(playerBeforeUpkeep.reason, refillTarget + Math.min(0, playerBeforeUpkeep.reason));
  if (reason !== playerBeforeUpkeep.reason) {
    events.push({ ...newBase, type: "REASON_CHANGED", playerId: nextPlayer.id, delta: reason - playerBeforeUpkeep.reason });
  }

  let deck = playerBeforeUpkeep.deck;
  let hand = playerBeforeUpkeep.hand;
  let pendingOceanJudgment = nextState.pendingOceanJudgment;
  const drawnCard = deck[0];
  if (drawnCard) {
    deck = deck.slice(1);
    hand = [...hand, drawnCard];
    events.push({ ...newBase, type: "DRAW_CARD", playerId: nextPlayer.id, instanceId: drawnCard.instanceId });
  } else {
    // Deck vide : "Jugement de l'Océan" plutôt qu'une défaite instantanée
    // (résolu en fin d'action par `game/engine.ts`).
    pendingOceanJudgment = pendingOceanJudgment ?? { playerId: nextPlayer.id };
  }

  // --- 5. Phase principale : dégel et nettoyage -----------------------------
  const refreshedBoard = playerBeforeUpkeep.board.map((u) => ({
    ...u,
    summoningSick: false,
    hasAttackedThisTurn: false,
    // Début du tour de ce joueur : ses bonus "jusqu'à votre prochain tour"
    // ont fait leur office (ils l'ont couvert pendant le tour adverse).
    modifiers: u.modifiers.filter((m) => m.duration === "permanent"),
  }));

  const refreshedPlayer: PlayerState = {
    ...playerBeforeUpkeep,
    reason,
    reasonCap,
    deck,
    hand,
    board: refreshedBoard,
    statusFlags: statusFlagsAfterUpkeep,
  };

  nextState = {
    ...nextState,
    players: nextState.players.map((p) => (p.id === refreshedPlayer.id ? refreshedPlayer : p)) as [
      PlayerState,
      PlayerState
    ],
    pendingOceanJudgment,
  };

  events.push({ ...newBase, type: "TURN_STARTED", playerId: refreshedPlayer.id });

  const startOfTurnTrigger = processTrigger(
    nextState,
    { trigger: "startOfTurn", playerId: refreshedPlayer.id },
    newTurnNumber
  );
  nextState = startOfTurnTrigger.state;
  events.push(...startOfTurnTrigger.events);

  // "Le Fond Vous Regarde" : choix forcé pour le joueur qui DEVIENT actif,
  // au début de CHAQUE tour tant que l'Anomalie reste en jeu (n'importe
  // quel contrôleur — cf. `game/state/anomalies.ts`). Bloque toute autre
  // action jusqu'à sa résolution (`resolveChoice`, vérifié dans `dispatch`).
  const forcedChoice = findAnomalyForcedChoice(nextState, refreshedPlayer.id, newTurnNumber);
  if (forcedChoice) {
    nextState = { ...nextState, pendingChoice: forcedChoice };
  }

  return { ok: true, state: nextState, events };
}
