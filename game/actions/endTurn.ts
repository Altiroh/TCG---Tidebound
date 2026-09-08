import { resolveTideTurnStep } from "@/game/environment/resolveEnvironment";
import { WATER_POOL } from "@/game/environment/waterData";
import { nextInt } from "@/game/rng";
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
 * Tire de nouvelles Eaux au hasard dans `WATER_POOL`, en excluant si
 * possible les Eaux actuelles (évite de retomber immédiatement sur les
 * mêmes). Algorithme de tirage volontairement simple — la pondération
 * exacte reste "à préciser" par le cadrage.
 */
function drawNextWater(state: GameState) {
  const candidates = WATER_POOL.filter((w) => w.id !== state.environment.currentWaterId);
  const pool = candidates.length > 0 ? candidates : WATER_POOL;
  const draw = nextInt(state.rngState, pool.length);
  return { water: pool[draw.value]!, nextRngState: draw.nextState };
}

/**
 * Termine le tour du joueur actif et applique la structure de tour
 * verrouillée (cadrage "Mécaniques verrouillées" section 28) pour le
 * joueur qui devient actif :
 *
 *   1. Vérification des Eaux (et tirage de nouvelles Eaux si épuisées)
 *   2. Vérification de la Marée (décompte + progression + dégâts du tour)
 *   3. Effets différés — non modélisés pour le MVP, étape ignorée
 *   4. Si Raison = 0 : perte d'Ancrage
 *   5. Régénération de Raison (+1, plafonnée à `reasonMax`)
 *   6. Pioche d'une carte
 *   7. Phase principale : réinitialise l'action principale du tour et l'état
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

  const nextPlayer = getOpponent(nextState, action.playerId);
  const newTurnNumber = state.turnNumber + 1;
  const newBase = { turnNumber: newTurnNumber, timestamp: Date.now() };

  nextState = {
    ...nextState,
    turnNumber: newTurnNumber,
    activePlayerId: nextPlayer.id,
    priorityPlayerId: nextPlayer.id,
  };

  // --- 1. Vérification des Eaux ------------------------------------------
  const waterRemainingTurns = nextState.environment.waterRemainingTurns - 1;
  if (waterRemainingTurns > 0) {
    nextState = {
      ...nextState,
      environment: { ...nextState.environment, waterRemainingTurns },
    };
  } else {
    const { water, nextRngState } = drawNextWater(nextState);
    nextState = {
      ...nextState,
      rngState: nextRngState,
      environment: {
        ...nextState.environment,
        currentWaterId: water.id,
        waterRemainingTurns: water.duration,
      },
    };
    events.push({ ...newBase, type: "WATER_CHANGED", waterId: water.id });
  }

  // --- 2. Vérification de la Marée (décompte, progression, dégâts) -------
  const tideStep = resolveTideTurnStep(nextState, newTurnNumber);
  nextState = tideStep.state;
  events.push(...tideStep.events);

  // --- 3. Effets différés : non modélisés pour le MVP, étape ignorée -----

  // --- 4-6. Raison à 0 => perte d'Ancrage, régénération, pioche ----------
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

  // --- 7. Phase principale : dégel et réinitialisation ---------------------
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
