import { resolveTideTurnStep } from "@/game/environment/resolveEnvironment";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import { RULES } from "@/game/rules/constants";
import { assertGameActive, assertIsActivePlayer, assertPlayerInGame, combine } from "@/game/rules/validation";
import { getOpponent, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, EndTurnAction } from "@/game/actions/types";

function validate(state: GameState, action: EndTurnAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId)
  );
}

/**
 * Termine le tour du joueur actif et applique la structure de tour
 * verrouillée (cadrage "Mécaniques verrouillées" section 28, resynchronisé
 * 2026-09-10 après éviction du sous-système des Eaux) pour le joueur qui
 * devient actif :
 *
 *   1. Vérification de la Marée (décompte + progression + orientation + dégâts du tour)
 *   2. Effets différés — non modélisés pour le MVP, étape ignorée
 *   3. Si Raison = 0 : perte d'Ancrage
 *   4. Régénération de Raison (+1, plafonnée à `reasonMax`)
 *   5. Pioche d'une carte
 *   6. Phase principale : réinitialise l'action principale du tour et l'état
 *      des unités (dégel, réinitialisation des attaques, nettoyage des
 *      modificateurs temporaires)
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
      discardGraveyard = [...discardGraveyard, discarded!];
      events.push({ ...base, type: "CARD_MOVED", instanceId: discarded!.instanceId, fromZone: "hand", toZone: "graveyard" });
    }
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === endingPlayer.id ? { ...p, hand: discardHand, graveyard: discardGraveyard } : p
      ) as [PlayerState, PlayerState],
    };
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

  // --- 3-5. Raison à 0 => perte d'Ancrage, régénération, pioche ----------
  const playerBeforeUpkeep = nextState.players.find((p) => p.id === nextPlayer.id)!;

  let anchor = playerBeforeUpkeep.anchor;
  if (playerBeforeUpkeep.reason <= 0) {
    anchor -= RULES.ANCHOR_LOSS_WHEN_REASON_ZERO;
    events.push({ ...newBase, type: "DAMAGE", targetPlayerId: nextPlayer.id, amount: RULES.ANCHOR_LOSS_WHEN_REASON_ZERO });
  }

  const reason = Math.min(
    playerBeforeUpkeep.reasonMax,
    playerBeforeUpkeep.reason + RULES.REASON_REGEN_PER_TURN
  );
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

  // --- 6. Phase principale : dégel et réinitialisation ---------------------
  const refreshedBoard = playerBeforeUpkeep.board.map((u) => ({
    ...u,
    summoningSick: false,
    hasAttackedThisTurn: false,
    modifiers: u.modifiers.filter((m) => m.duration === "permanent"),
  }));

  const refreshedPlayer: PlayerState = {
    ...playerBeforeUpkeep,
    anchor,
    reason,
    deck,
    hand,
    board: refreshedBoard,
    hasUsedMainActionThisTurn: false,
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
