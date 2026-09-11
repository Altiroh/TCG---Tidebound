import { getCardDefinition } from "@/game/cards/sets/core";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import {
  assertCardOnOwnBoard,
  assertGameActive,
  assertInPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, SaborderAction } from "@/game/actions/types";

function validate(state: GameState, action: SaborderAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "mainPhase"),
    assertCardOnOwnBoard(state, action.playerId, action.instanceId)
  );
}

/**
 * Sabordage : destruction volontaire d'un de ses propres permanents.
 * Action de jeu comme une autre (Notion "Moteur de partie", section
 * "Saborder — action de jeu, pas fin de tour") : ne termine jamais le
 * tour ni ne ferme la Phase principale, et n'est pas limité en nombre —
 * un joueur peut saborder puis continuer à jouer dans le même tour.
 * Reste une mort au sens du jeu : déclenche `onDeath` en plus de
 * `onSaborde`, comme une destruction normale — seule la cause diffère.
 */
export function saborder(state: GameState, action: SaborderAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const unit = player.board.find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const board = player.board.filter((u) => u.instanceId !== unit.instanceId);
  const graveyard = [
    ...player.graveyard,
    { ...unit, damageMarked: 0, modifiers: [], graveyardCause: "scuttled" as const },
  ];

  const playerAfter: PlayerState = {
    ...player,
    board,
    graveyard,
  };

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfter : p)) as [
      PlayerState,
      PlayerState
    ],
  };

  events.push({ ...base, type: "SABORDED", playerId: player.id, instanceId: unit.instanceId });
  events.push({ ...base, type: "DESTROY", instanceId: unit.instanceId, reason: "effect" });

  const sabordeTrigger = processTrigger(
    nextState,
    { trigger: "onSaborde", playerId: player.id, cardId: def.id, sourceInstanceId: unit.instanceId },
    state.turnNumber
  );
  nextState = sabordeTrigger.state;
  events.push(...sabordeTrigger.events);

  const deathTrigger = processTrigger(
    nextState,
    { trigger: "onDeath", playerId: player.id, cardId: def.id, sourceInstanceId: unit.instanceId },
    state.turnNumber
  );
  nextState = deathTrigger.state;
  events.push(...deathTrigger.events);

  return { ok: true, state: nextState, events };
}
