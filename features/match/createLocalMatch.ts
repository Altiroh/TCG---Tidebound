import { createGameState, type DeckList, type GameState } from "@/game";

/**
 * Crée une partie locale "hot-seat" : les deux joueurs jouent sur le même
 * écran, à tour de rôle. Pas encore de réseau/persistance — uniquement le
 * moteur (`createGameState`) appelé côté client.
 */
export function createLocalMatch(deck1: DeckList, deck2: DeckList): GameState {
  return createGameState({
    gameId: `local_${Date.now()}`,
    player1: { id: "p1", deck: deck1 },
    player2: { id: "p2", deck: deck2 },
    seed: Date.now(),
  });
}
