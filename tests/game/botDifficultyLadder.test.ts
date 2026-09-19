import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { dispatch } from "@/game/engine";
import type { BotDifficulty } from "@/game/bot/types";
import type { GameState } from "@/game/state/types";

/**
 * L'ÉCHELLE DE DIFFICULTÉ, vérifiée en jouant.
 *
 * Elle était inversée sans que rien ne le dise : « moyen » perdait 2 parties
 * sur 12 contre « facile », parce que sa marge d'erreur allait piocher dans
 * la moitié la plus faible des coups quand celle de « facile » se contentait
 * d'écarter le pire quart. Aucun test ne pouvait le voir — les difficultés
 * n'étaient comparées à rien.
 *
 * Chaque affrontement se joue dans les DEUX sens, pour que l'avantage du
 * premier joueur ne décide pas du résultat. Les seuils sont volontairement
 * larges : ce test doit signaler une échelle CASSÉE, pas osciller au gré
 * d'un réglage.
 *
 * LE HASARD DES BOTS EST FIXÉ ICI (18/09/2026). « facile » et « moyen »
 * renoncent au meilleur coup 55 % et 25 % du temps via `Math.random()` :
 * sur 20 parties, l'écart mesuré entre « difficile » et « moyen » (≈ 0,63)
 * n'était qu'à une erreur-type du seuil, et le test tombait environ une
 * fois sur six sans que rien n'ait changé. Un test qui échoue au hasard
 * n'apprend rien à personne — et pire, on finit par le relancer au lieu de
 * le lire. La graine rend chaque exécution identique : ce qui bouge alors,
 * c'est le bot, pas le dé.
 */

/**
 * Générateur déterministe substitué à `Math.random()` le temps d'une
 * mesure — même suite de "hésitations" à chaque exécution.
 */
function withSeededRandom<T>(seed: number, run: () => T): T {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    // xorshift32 : court, sans dépendance, et largement assez uniforme pour
    // tirer dans une liste de coups.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function playMatch(a: BotDifficulty, b: BotDifficulty, seed: number): "A" | "B" | null {
  let state: GameState = createGameState({
    gameId: `ladder-${seed}`,
    player1: { id: "A", deck: PLAYABLE_DECKS[seed % PLAYABLE_DECKS.length]! },
    player2: { id: "B", deck: PLAYABLE_DECKS[(seed + 3) % PLAYABLE_DECKS.length]! },
    seed,
  });

  for (let guard = 0; guard < 3000 && state.status === "active"; guard += 1) {
    const actor = botHasSomethingToDo(state, "A") ? "A" : botHasSomethingToDo(state, "B") ? "B" : null;
    if (!actor) break;
    const result = dispatch(state, chooseBotAction(state, actor, actor === "A" ? a : b));
    if (!result.ok || result.state === state) break;
    state = result.state;
  }

  return state.winnerId === "A" ? "A" : state.winnerId === "B" ? "B" : null;
}

/** Parties gagnées par `strong` contre `weak`, les deux couleurs jouées. */
function winsOfStronger(strong: BotDifficulty, weak: BotDifficulty, seeds: number): { wins: number; played: number } {
  let wins = 0;
  let played = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    for (const strongIsA of [true, false]) {
      const winner = playMatch(strongIsA ? strong : weak, strongIsA ? weak : strong, seed);
      if (!winner) continue;
      played += 1;
      if ((winner === "A") === strongIsA) wins += 1;
    }
  }
  return { wins, played };
}

describe("échelle de difficulté du bot", () => {
  it("« moyen » bat « facile » — l'échelle était inversée", () => {
    const { wins, played } = withSeededRandom(20260918, () => winsOfStronger("moyen", "facile", 8));
    expect(played).toBeGreaterThan(10);
    expect(wins / played).toBeGreaterThan(0.6);
  });

  it("« difficile » bat « moyen »", () => {
    // Écart mesuré sur 80 parties (18/09/2026) : ≈ 0,63. Le seuil est placé
    // sous cette valeur, avec assez de marge pour qu'un réglage mineur ne
    // fasse pas tomber le test — mais pas au point d'accepter la parité.
    const { wins, played } = withSeededRandom(20260918, () => winsOfStronger("difficile", "moyen", 10));
    expect(played).toBeGreaterThan(14);
    expect(wins / played).toBeGreaterThan(0.55);
  });

  it("« difficile » écrase « facile »", () => {
    const { wins, played } = withSeededRandom(20260918, () => winsOfStronger("difficile", "facile", 6));
    expect(played).toBeGreaterThan(8);
    expect(wins / played).toBeGreaterThan(0.7);
  });
});
