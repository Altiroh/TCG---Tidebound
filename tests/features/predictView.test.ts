import { describe, expect, it } from "vitest";
import { createGameState, dispatch, PLAYABLE_DECKS, toPlayerView, type GameState } from "@/game";
import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { predictView } from "@/features/online/predictView";

/**
 * Ce que le joueur voit de lui-même et du plateau : c'est ce que la prédiction affiche.
 * Les identifiants de modificateur sont écartés : ils dérivent de la graine, absente
 * de la vue, et ne s'affichent nulle part.
 */
function visible(view: GameState, playerId: string) {
  return view.players.map((player) => ({
    id: player.id,
    board: player.board.map((unit) => ({ ...unit, modifiers: unit.modifiers.map(({ id: _id, ...modifier }) => modifier) })),
    graveyard: player.graveyard,
    reason: player.reason,
    anchor: player.anchor,
    hand: player.id === playerId ? player.hand : player.hand.length,
  }));
}

/**
 * Le serveur a ouvert une fenêtre (réaction, choix, sauvetage) que la vue ne
 * pouvait pas voir venir : la carte qui la déclenche est cachée (main
 * adverse). Aucune prédiction honnête ne peut la deviner sans révéler ce
 * que l'adversaire tient ; la vue du serveur remplace alors l'affichage.
 */
function openedHiddenWindow(state: GameState): boolean {
  return Boolean(state.pendingReaction || state.pendingChoice || state.pendingDestruction);
}

const GRAINES = [1, 102_947];

describe("predictView", () => {
  it("affiche, pour chaque coup prédit, exactement ce que le serveur renverra", () => {
    let predictedCount = 0;
    let phaseChangesPredicted = 0;
    let hiddenWindows = 0;
    // Graines FIXES : sans elles, chaque exécution battait d'autres decks et
    // le test passait ou non selon le tirage. La seconde amène « Dernier
    // Jour en Mer » sur un « Pont Miné » encore masqué (Structure cachée
    // détruite : son identité n'est connue que du serveur).
    const parties = GRAINES.flatMap((graine) => PLAYABLE_DECKS.slice(1).map((_, deckIndex) => [graine, deckIndex] as const));
    for (const [graine, deckIndex] of parties) {
      let state = createGameState({
        gameId: `predict-${deckIndex}`,
        seed: graine + deckIndex,
        player1: { id: "p1", deck: PLAYABLE_DECKS[deckIndex]! },
        player2: { id: "p2", deck: PLAYABLE_DECKS[deckIndex + 1]! },
      });
      // Quelques tours, pour avoir de la Raison et des cartes variées en main.
      for (let turn = 0; turn < 12 && state.status === "active"; turn++) {
        const actor = state.activePlayerId;
        for (const action of enumerateCandidateActions(state, actor)) {
          const view = toPlayerView(state, actor);
          const prediction = predictView(view, action);
          if (!prediction) continue;
          const server = dispatch(state, action);
          expect(server.ok).toBe(true);
          if (!server.ok) continue;
          predictedCount++;
          if (openedHiddenWindow(server.state)) {
            hiddenWindows++;
            continue;
          }
          expect(visible(prediction, actor)).toEqual(visible(toPlayerView(server.state, actor), actor));
        }
        // Poser réellement ce qui peut l'être : sans unité sur la table, il n'y aurait rien à attaquer.
        for (let posed = 0; posed < 3; posed++) {
          const play = enumerateCandidateActions(state, actor).find((action) => action.type === "playCard");
          const played = play ? dispatch(state, play) : null;
          if (!played?.ok || played.state.pendingReaction || played.state.pendingChoice) break;
          state = played.state;
        }
        // Puis le combat : les attaques et le passage de phase se prédisent aussi.
        const toCombat = dispatch(state, { type: "advancePhase", playerId: actor });
        if (toCombat.ok && toCombat.state.phase === "combatPhase" && !toCombat.state.pendingReaction && !toCombat.state.pendingChoice) {
          const combat = toCombat.state;
          for (const action of enumerateCandidateActions(combat, actor)) {
            const prediction = predictView(toPlayerView(combat, actor), action);
            if (!prediction) continue;
            const server = dispatch(combat, action);
            expect(server.ok).toBe(true);
            if (!server.ok) continue;
            if (action.type === "advancePhase") phaseChangesPredicted++;
            predictedCount++;
            if (openedHiddenWindow(server.state)) {
              hiddenWindows++;
              continue;
            }
            expect(visible(prediction, actor)).toEqual(visible(toPlayerView(server.state, actor), actor));
          }
        }
        const ended = dispatch(state, { type: "endTurn", playerId: actor });
        if (!ended.ok) break;
        state = ended.state;
      }
    }
    expect(predictedCount).toBeGreaterThan(0);
    expect(phaseChangesPredicted).toBeGreaterThan(0);
    // Tout écart restant est expliqué par une fenêtre que le serveur a
    // ouverte depuis une carte cachée (`openedHiddenWindow`) : la prédiction
    // ne se trompe jamais EN SILENCE. Ces fenêtres-là existent (réactions
    // depuis la main adverse), et c'est la réponse du serveur qui fait foi.
    expect(hiddenWindows).toBeLessThan(predictedCount);
  });

  it("ne prédit jamais un changement de tour", () => {
    const state = createGameState({ gameId: "predict-end", player1: { id: "p1", deck: PLAYABLE_DECKS[0]! }, player2: { id: "p2", deck: PLAYABLE_DECKS[1]! } });
    expect(predictView(toPlayerView(state, state.activePlayerId), { type: "endTurn", playerId: state.activePlayerId })).toBeNull();
  });
});
