import { resolveTideTurnStep } from "@/game/environment/resolveEnvironment";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import { RULES } from "@/game/rules/constants";
import { assertGameActive, assertIsActivePlayer, assertPlayerInGame, combine } from "@/game/rules/validation";
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
 *    forcée, puis — si SA Raison est à 0 à ce moment précis — perte d'1
 *    Ancrage. Un joueur qui redescend à 0 Raison en cours de tour n'est
 *    donc pas sanctionné immédiatement : il peut encore tenter de
 *    récupérer de la Raison avant la fin de son tour pour l'éviter.
 *
 * B. Début de tour DU JOUEUR QUI DEVIENT ACTIF (structure verrouillée,
 *    resynchronisée 2026-09-10 après éviction du sous-système des Eaux) :
 *   1. Vérification de la Marée (décompte + progression + orientation + dégâts du tour)
 *   2. Effets différés — non modélisés pour le MVP, étape ignorée
 *   3. Régénération de Raison (+1, plafonnée à `reasonMax`)
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

  // --- Fin du tour du joueur qui vient de jouer : Raison = 0 => perte
  // d'1 Ancrage (vérifiée ICI, sur SA Raison — pas sur celle du joueur
  // qui devient actif juste après).
  const playerEndingTurn = nextState.players.find((p) => p.id === action.playerId)!;
  if (playerEndingTurn.reason <= 0) {
    const anchor = playerEndingTurn.anchor - RULES.ANCHOR_LOSS_WHEN_REASON_ZERO;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === playerEndingTurn.id ? { ...p, anchor } : p)) as [
        PlayerState,
        PlayerState
      ],
    };
    events.push({ ...base, type: "DAMAGE", targetPlayerId: playerEndingTurn.id, amount: RULES.ANCHOR_LOSS_WHEN_REASON_ZERO });
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

  // --- 3-4. Régénération de Raison, pioche --------------------------------
  const playerBeforeUpkeep = nextState.players.find((p) => p.id === nextPlayer.id)!;

  // "La Gueule Sous la Mer" : verrou consommé exactement ICI — cette
  // régénération-ci est bloquée, jamais les suivantes ("jusqu'au début de
  // votre prochain tour" = jusqu'à ce moment précis, pas après).
  const reasonGainLocked = playerBeforeUpkeep.statusFlags.includes(STATUS_NO_REASON_GAIN);
  const statusFlagsAfterUpkeep = playerBeforeUpkeep.statusFlags.filter((f) => f !== STATUS_NO_REASON_GAIN);

  const reason = reasonGainLocked
    ? playerBeforeUpkeep.reason
    : Math.min(playerBeforeUpkeep.reasonMax, playerBeforeUpkeep.reason + RULES.REASON_REGEN_PER_TURN);
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
    modifiers: u.modifiers.filter((m) => m.duration === "permanent"),
  }));

  const refreshedPlayer: PlayerState = {
    ...playerBeforeUpkeep,
    reason,
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

  return { ok: true, state: nextState, events };
}
