import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { evaluateState } from "@/game/bot/evaluateState";
import { searchBestAction } from "@/game/bot/searchTurn";
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

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

/**
 * Choisit l'action du bot pour ce coup, selon la difficulté. N'exécute
 * rien — `runBotTurn.ts` se charge d'appeler `dispatch` avec le résultat.
 *
 * Deux régimes bien distincts :
 *   - « facile » et « moyen » jugent le coup sur l'état qu'il produit
 *     IMMÉDIATEMENT, avec une marge d'erreur assumée ;
 *   - « difficile » cherche (`searchTurn.ts`) : il déroule son tour entier
 *     et note ce qu'il laisse à l'adversaire.
 *
 * Le hasard utilisé ici ne passe pas par le RNG déterministe du moteur
 * (`game/rng.ts`) : seule l'action finalement soumise à `dispatch` est
 * journalisée/rejouable, pas la façon dont le bot l'a choisie — un peu
 * comme l'hésitation de souris d'un joueur humain n'est jamais consignée.
 *
 * `random` permet néanmoins de le RENDRE reproductible sans toucher au jeu :
 * le banc d'essai lui passe un générateur à graine, faute de quoi rejouer un
 * matchup après un changement ne comparerait rien — l'écart mesuré pourrait
 * venir du changement comme d'un tirage différent. En partie, le défaut
 * reste `Math.random`.
 */
export function chooseBotAction(
  state: GameState,
  playerId: PlayerId,
  difficulty: BotDifficulty,
  random: () => number = Math.random
): PlayerAction {
  let scored = scoreCandidates(state, playerId);
  if (scored.length === 0) return { type: "endTurn", playerId };

  scored.sort((a, b) => b.score - a.score);

  // En Phase de combat, la marge d'erreur ne doit pas faire passer le tour quand une attaque vaut au moins
  // autant : sinon, en "moyen", le bot tirait souvent "Fin de tour" au hasard et n'attaquait presque jamais
  // (retour de test du 13/09 — ~0,4 attaque par tour contre ~0,8 en "facile").
  if (state.phase === "combatPhase") {
    const endTurnScore = scored.find((s) => s.action.type === "endTurn")?.score ?? -Infinity;
    const worthwhileAttacks = scored.filter((s) => s.action.type === "attack" && s.score >= endTurnScore);
    if (worthwhileAttacks.length > 0) scored = worthwhileAttacks;
  }

  if (difficulty === "difficile") {
    // « Difficile » ne se décide PAS coup par coup : il explore son tour
    // jusqu'au bout et note la position après la riposte de l'adversaire
    // (`searchTurn.ts`). C'est ce qui le rend dur — et ce qui fait tomber
    // d'elles-mêmes les bêtises que la note statique laissait passer, à
    // commencer par saborder une Structure pour deux points d'Ancrage dont
    // il n'a pas l'usage.
    //
    // Aucun hasard ici, contrairement aux deux autres difficultés : un
    // adversaire implacable ne se trompe jamais par accident.
    const searched = searchBestAction(state, playerId);
    if (searched) return searched;
    return scored[0]!.action;
  }

  /*
   * L'ÉCHELLE DE DIFFICULTÉ ÉTAIT INVERSÉE.
   *
   * « Moyen » perdait 2 parties sur 12 contre « facile » — mesuré, et
   * antérieur à la recherche. La raison tenait à la forme de leur hasard :
   * « facile » tirait dans les 75 % MEILLEURS coups (donc souvent le bon),
   * tandis que « moyen » allait chercher, trois fois sur dix, dans la
   * moitié la plus FAIBLE — une bourde délibérée bien plus grave que tout
   * ce que « facile » pouvait commettre.
   *
   * Les deux se décrivent maintenant sur le même axe, une seule grandeur :
   * la fréquence à laquelle le bot renonce au meilleur coup, et la
   * profondeur de la fourchette dans laquelle il pioche alors. « Moyen » se
   * trompe deux fois moins souvent que « facile », et moins gravement — la
   * progression facile → moyen → difficile est monotone par construction,
   * plus par accident de réglage.
   */
  const { mistakeChance, mistakeDepth } = difficulty === "moyen" ? MOYEN : FACILE;

  if (scored.length > 1 && random() < mistakeChance) {
    // La bourde reste une bourde PLAUSIBLE : on pioche dans une fourchette
    // partant du meilleur coup, jamais dans le pire coup absolu — un bot
    // qui se saborde sans raison n'est pas « facile », il est cassé.
    const window = Math.max(2, Math.ceil(scored.length * mistakeDepth));
    return pickRandom(scored.slice(0, Math.min(window, scored.length)), random).action;
  }

  return scored[0]!.action;
}

/** Fréquence d'erreur, et largeur de la fourchette où le bot pioche quand il se trompe. */
interface MistakeProfile {
  mistakeChance: number;
  mistakeDepth: number;
}

/** Se trompe souvent, et large : on apprend le jeu contre lui. */
const FACILE: MistakeProfile = { mistakeChance: 0.55, mistakeDepth: 0.8 };
/** Joue le bon coup la plupart du temps, et ses erreurs restent proches du bon. */
const MOYEN: MistakeProfile = { mistakeChance: 0.25, mistakeDepth: 0.4 };
