import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { evaluateState } from "@/game/bot/evaluateState";
import type { BotDifficulty } from "@/game/bot/types";
import { dispatch } from "@/game/engine";
import type { PlayerAction } from "@/game/actions/types";
import type { GameState, PlayerId } from "@/game/state/types";

interface ScoredAction {
  action: PlayerAction;
  score: number;
}

/**
 * Simule chaque action candidate via `dispatch` (jamais mutée, l'état
 * courant `state` reste intact) et note le résultat du point de vue de
 * `playerId`. Les candidats refusés par le moteur (cible invalide, coût
 * impayable, etc.) sont simplement écartés — aucune règle n'est dupliquée
 * ici.
 */
function scoreCandidates(state: GameState, playerId: PlayerId): ScoredAction[] {
  const scored: ScoredAction[] = [];
  for (const action of enumerateCandidateActions(state, playerId)) {
    const result = dispatch(state, action);
    if (!result.ok) continue;
    scored.push({ action, score: evaluateState(result.state, playerId) });
  }
  return scored;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Choisit l'action du bot pour ce coup, selon la difficulté. N'exécute
 * rien — `runBotTurn.ts` se charge d'appeler `dispatch` avec le résultat.
 *
 * Le hasard utilisé ici (`Math.random()`) n'a pas besoin de passer par le
 * RNG déterministe du moteur (`game/rng.ts`) : seule l'action finalement
 * soumise à `dispatch` est journalisée/rejouable, pas la façon dont le bot
 * l'a choisie — un peu comme l'hésitation de souris d'un joueur humain
 * n'est jamais consignée.
 */
export function chooseBotAction(state: GameState, playerId: PlayerId, difficulty: BotDifficulty): PlayerAction {
  const scored = scoreCandidates(state, playerId);
  if (scored.length === 0) return { type: "endTurn", playerId };

  scored.sort((a, b) => b.score - a.score);

  if (difficulty === "difficile") {
    const best = scored[0]!.score;
    const topTier = scored.filter((s) => s.score >= best - 0.01);
    return pickRandom(topTier).action;
  }

  if (difficulty === "moyen") {
    // Globalement solide, avec une marge d'erreur : 30% du temps, choisit
    // dans la moitié la plus faible des candidats plutôt que le meilleur.
    if (scored.length > 2 && Math.random() < 0.3) {
      const lowerHalf = scored.slice(Math.ceil(scored.length / 2));
      return pickRandom(lowerHalf.length > 0 ? lowerHalf : scored).action;
    }
    const topThird = scored.slice(0, Math.max(1, Math.ceil(scored.length / 3)));
    return pickRandom(topThird).action;
  }

  // facile : quasi aléatoire — exclut seulement le quart le plus mauvais
  // (évite les coups absurdement suicidaires, sans vraie stratégie).
  const cutoff = Math.max(1, Math.floor(scored.length * 0.75));
  return pickRandom(scored.slice(0, cutoff)).action;
}
