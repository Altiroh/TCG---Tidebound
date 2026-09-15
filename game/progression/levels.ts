import {
  STARTING_LEVEL,
  XP_FIRST_LEVEL,
  XP_LEVEL_STEP,
  XP_STEP_PLATEAU_LEVEL,
} from "@/game/progression/constants";
import { levelRewardItems, levelRewardsBetween } from "@/game/progression/levelRewards";
import type { LevelReward, ProgressionView } from "@/game/progression/types";

/**
 * Courbe de niveaux — fonctions PURES, seule source de vérité de la
 * progression. Volontairement pas de table en dur ni de duplication en
 * SQL : la base ne stocke que `xp_total` et `level`, et c'est ce module qui
 * fait foi pour les dériver (cf. `game/progression/constants.ts` pour le
 * calibrage et son statut).
 */

/** XP nécessaire pour passer de `level` à `level + 1`. */
export function xpForLevel(level: number): number {
  const effective = Math.max(STARTING_LEVEL, Math.min(level, XP_STEP_PLATEAU_LEVEL));
  return XP_FIRST_LEVEL + XP_LEVEL_STEP * (effective - STARTING_LEVEL);
}

/** XP cumulée nécessaire pour ATTEINDRE `level` depuis un compte neuf. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = STARTING_LEVEL; l < level; l++) total += xpForLevel(l);
  return total;
}

/**
 * Niveau correspondant à une XP cumulée. Boucle plutôt que formule fermée :
 * la courbe a un plateau (`XP_STEP_PLATEAU_LEVEL`), une inversion analytique
 * serait à deux branches et beaucoup plus facile à casser en changeant le
 * calibrage.
 */
export function levelForTotalXp(xpTotal: number): number {
  let level = STARTING_LEVEL;
  let remaining = Math.max(0, xpTotal);

  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }

  return level;
}

/** Décompose une XP cumulée pour l'affichage (niveau + avancement). */
export function progressionView(xpTotal: number): ProgressionView {
  const safeXp = Math.max(0, Math.floor(xpTotal));
  const level = levelForTotalXp(safeXp);
  const xpIntoLevel = safeXp - totalXpForLevel(level);
  const xpForNextLevel = xpForLevel(level);

  return {
    level,
    xpTotal: safeXp,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel: Math.max(0, xpForNextLevel - xpIntoLevel),
    ratio: xpForNextLevel === 0 ? 0 : Math.min(1, xpIntoLevel / xpForNextLevel),
  };
}

/** Récompense d'un palier de niveau donné (le niveau ATTEINT). */
export function rewardForLevel(level: number): LevelReward {
  return { level, items: levelRewardItems(level) };
}

/**
 * Tous les paliers franchis en passant de `levelBefore` à `levelAfter`.
 * Retourne un tableau vide si aucun niveau n'a été gagné — et ne renvoie
 * jamais rien pour un niveau déjà atteint, ce qui rend l'octroi idempotent
 * dès lors que `levelBefore` vient de la base.
 */
export function rewardsForLevelsGained(levelBefore: number, levelAfter: number): LevelReward[] {
  return levelRewardsBetween(levelBefore, levelAfter).map((entry) => ({ level: entry.level, items: entry.items }));
}
