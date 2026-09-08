import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * "Jugement de l'Océan" : quand un joueur tente de piocher dans un deck
 * vide, la partie ne se termine pas instantanément — on compare la
 * Résilience (Ancrage + Raison) des deux joueurs. Départage documenté
 * (cadrage "Mécaniques verrouillées") : le plus d'Ancrage gagne, puis à
 * égalité le plus de permanents en jeu, puis à égalité totale la carte
 * est déclarée nulle (aucun vainqueur).
 */
function resilience(player: PlayerState): number {
  return player.anchor + player.reason;
}

export function resolveOceanJudgment(
  state: GameState,
  triggeredByPlayerId: PlayerId
): { state: GameState; events: GameEvent[] } {
  const [p1, p2] = state.players;
  const resilienceByPlayer: Record<PlayerId, number> = {
    [p1.id]: resilience(p1),
    [p2.id]: resilience(p2),
  };

  let winner: PlayerState | undefined;
  if (resilienceByPlayer[p1.id]! > resilienceByPlayer[p2.id]!) winner = p1;
  else if (resilienceByPlayer[p2.id]! > resilienceByPlayer[p1.id]!) winner = p2;
  else if (p1.anchor > p2.anchor) winner = p1;
  else if (p2.anchor > p1.anchor) winner = p2;
  else if (p1.board.length > p2.board.length) winner = p1;
  else if (p2.board.length > p1.board.length) winner = p2;
  // Égalité totale (y compris pioche) : match nul, pas de vainqueur.

  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };
  const events: GameEvent[] = [
    {
      ...base,
      type: "OCEAN_JUDGMENT",
      triggeredByPlayerId,
      resilienceByPlayer,
      winnerId: winner?.id,
    },
    {
      ...base,
      type: "GAME_ENDED",
      winnerId: winner?.id,
      reason: "oceanJudgment",
    },
  ];

  return {
    state: {
      ...state,
      status: "finished",
      winnerId: winner?.id,
      pendingOceanJudgment: undefined,
      eventLog: [...state.eventLog, ...events],
    },
    events,
  };
}
