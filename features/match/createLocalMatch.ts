import { applyTutorialScenario, createGameState, type DeckList, type GameState } from "@/game";

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

/**
 * Partie du TUTORIEL : une partie locale reprise EN COURS DE ROUTE, sur le
 * scénario préparé (`applyTutorialScenario`) — main, plateaux et Marée
 * posés pour que chaque leçon trouve son exemple. Le reste vient des deux
 * préconstruits, et la partie se joue ensuite jusqu'au bout.
 *
 * Fonction distincte plutôt qu'un paramètre de plus sur `createLocalMatch` :
 * aucune autre partie ne doit pouvoir arranger sa table.
 */
export function createTutorialMatch(deck1: DeckList, deck2: DeckList): GameState {
  return applyTutorialScenario(
    createGameState({
      gameId: `tutorial_${Date.now()}`,
      player1: { id: "p1", deck: deck1 },
      player2: { id: "p2", deck: deck2 },
      seed: Date.now(),
    })
  );
}
