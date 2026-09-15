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

/**
 * Partie du TUTORIEL : une partie locale ordinaire, à une garantie près —
 * la main d'ouverture du joueur contient au moins un exemplaire de chaque
 * type dont les étapes ont besoin.
 *
 * Fonction distincte plutôt qu'un paramètre de plus sur `createLocalMatch` :
 * aucune autre partie ne doit pouvoir arranger sa main, et le nom dit à
 * quoi sert l'exception.
 */
export function createTutorialMatch(deck1: DeckList, deck2: DeckList, guaranteedOpeningTypes: readonly string[]): GameState {
  return createGameState({
    gameId: `tutorial_${Date.now()}`,
    player1: { id: "p1", deck: deck1 },
    player2: { id: "p2", deck: deck2 },
    seed: Date.now(),
    guaranteedOpeningTypes,
  });
}
