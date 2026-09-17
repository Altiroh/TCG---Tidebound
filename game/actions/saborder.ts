import {
  assertCardOnOwnBoard,
  assertGameActive,
  assertInMainPhase,
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
    assertInMainPhase(state, action.playerId),
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

  // Le départ lui-même est confié à `processDeaths` (`game/state`), voie
  // UNIQUE de sortie du plateau : elle envoie au cimetière comme « sabordé »,
  // émet SABORDED puis DESTROY, et réveille `onSaborde` avant `onDeath`.
  // `dispatch` l'exécute juste après cette action.
  const nextState: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === player.id
        ? {
            ...p,
            board: p.board.map((u) => (u.instanceId === action.instanceId ? { ...u, pendingRemoval: "scuttled" as const } : u)),
          }
        : p
    ) as [PlayerState, PlayerState],
  };

  return { ok: true, state: nextState, events: [] };
}
