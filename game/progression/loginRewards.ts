import { TIDE_REWARD } from "@/game/economy/constants";
import {
  BOOSTER_DEFAUT,
  BOOSTER_ECLATS_EN_SELLE,
  BOOSTER_ETRANGETE_SOUS_MARINE,
  BOOSTER_NECESSAIRE_DU_MARIN,
  BOOSTER_POISSONS_PAS_FRAIS,
  BOOSTER_POOLS,
  BOOSTER_VEILLEE_DES_DISPARUS,
  PURCHASABLE_BOOSTER_IDS,
} from "@/game/boosters/pools";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { getCardDefinition } from "@/game/cards/sets/core";
import { boosterExtension } from "@/game/boosters/extensions";
import type { CardRarity } from "@/game/boosters/types";

/**
 * Récompenses de connexion — cycle de 7, NON PUNITIF.
 *
 * Source de vérité : Notion « Progression joueur », section 8. La règle
 * verrouillée n'est pas le contenu du cycle mais son comportement :
 *
 *   > **Pas de streak remis à zéro.** Si le joueur atteint la connexion 3
 *   > puis revient plusieurs jours plus tard, il reprend à la connexion 4.
 *
 * C'est ce qui distingue ce système d'un streak classique : l'état persisté
 * est un COMPTEUR D'ÉTAPE, pas une date de dernière connexion consécutive.
 * Une absence ne le touche jamais — seule une réclamation le fait avancer.
 *
 * Deux choses s'y ajoutent sans toucher à cette règle :
 *
 *  - le CONTENU du cycle tourne chaque semaine (`LOGIN_WEEKLY_PROGRAMMES`) :
 *    booster offert à l'escale 7, pool dans lequel pioche la carte
 *    aléatoire. L'étape, elle, ne bouge pas au changement de semaine ;
 *  - une SÉRIE de jours consécutifs, comptée à part : chaque tranche de
 *    `LOGIN_STREAK_MILESTONE` jours d'affilée offre une carte Abyssale. Une
 *    absence remet la SÉRIE à zéro — jamais l'étape du cycle.
 */

/** Une récompense élémentaire d'étape de connexion. */
export type LoginRewardItem =
  | { kind: "tides"; amount: number }
  | { kind: "xp"; amount: number }
  | { kind: "booster"; boosterId: string; count: number }
  /**
   * Carte tirée côté serveur dans la rareté demandée. `boosterId` restreint
   * la pioche au pool de ce booster ; absent, elle couvre tous les boosters
   * achetables. `cardId` n'existe qu'APRÈS le tirage, pour nommer la carte
   * reçue (message, révélation) — jamais dans un programme.
   */
  | { kind: "card"; rarity: CardRarity; boosterId?: string; cardId?: string };

/** Longueur du cycle ; passé la dernière étape, on recommence à la première. */
export const LOGIN_CYCLE_LENGTH = 7;

type LoginCycle = readonly (readonly LoginRewardItem[])[];

/** Programme d'une semaine : son thème (le booster mis en avant) et ses 7 escales. */
export interface LoginWeekProgramme {
  /** Booster mis en avant cette semaine : offert à l'escale 7, pool de la carte aléatoire. */
  boosterId: string;
  cycle: LoginCycle;
}

const tides = (amount: number): LoginRewardItem => ({ kind: "tides", amount });
const xp = (amount: number): LoginRewardItem => ({ kind: "xp", amount });
const booster = (boosterId: string): LoginRewardItem => ({ kind: "booster", boosterId, count: 1 });
const card = (boosterId?: string): LoginRewardItem =>
  boosterId ? { kind: "card", rarity: "common", boosterId } : { kind: "card", rarity: "common" };

/**
 * Programmes hebdomadaires, joués en boucle (semaine UTC, du lundi au
 * dimanche). Chaque semaine garde la même enveloppe — 85 Tides, 175 XP, une
 * carte commune, un booster — et ne fait varier que l'ORDRE des escales, le
 * booster offert et le pool de la carte. La semaine 0 est le cycle
 * d'origine (Défaut, carte commune de n'importe quel booster).
 */
export const LOGIN_WEEKLY_PROGRAMMES: readonly LoginWeekProgramme[] = [
  {
    boosterId: BOOSTER_DEFAUT,
    cycle: [[tides(20)], [xp(75)], [tides(TIDE_REWARD.small)], [card()], [xp(100)], [tides(40)], [booster(BOOSTER_DEFAUT)]],
  },
  {
    boosterId: BOOSTER_POISSONS_PAS_FRAIS,
    cycle: [[xp(75)], [tides(20)], [card(BOOSTER_POISSONS_PAS_FRAIS)], [tides(TIDE_REWARD.small)], [xp(100)], [tides(40)], [booster(BOOSTER_POISSONS_PAS_FRAIS)]],
  },
  {
    boosterId: BOOSTER_NECESSAIRE_DU_MARIN,
    cycle: [[tides(20)], [tides(TIDE_REWARD.small)], [xp(75)], [card(BOOSTER_NECESSAIRE_DU_MARIN)], [tides(40)], [xp(100)], [booster(BOOSTER_NECESSAIRE_DU_MARIN)]],
  },
  {
    boosterId: BOOSTER_ETRANGETE_SOUS_MARINE,
    cycle: [[tides(20)], [xp(75)], [card(BOOSTER_ETRANGETE_SOUS_MARINE)], [tides(TIDE_REWARD.small)], [xp(100)], [tides(40)], [booster(BOOSTER_ETRANGETE_SOUS_MARINE)]],
  },
  {
    boosterId: BOOSTER_DEFAUT,
    cycle: [[xp(75)], [tides(TIDE_REWARD.small)], [tides(20)], [card(BOOSTER_DEFAUT)], [xp(100)], [tides(40)], [booster(BOOSTER_DEFAUT)]],
  },
  {
    boosterId: BOOSTER_VEILLEE_DES_DISPARUS,
    cycle: [[tides(20)], [xp(75)], [tides(TIDE_REWARD.small)], [card(BOOSTER_VEILLEE_DES_DISPARUS)], [xp(100)], [tides(40)], [booster(BOOSTER_VEILLEE_DES_DISPARUS)]],
  },
  {
    boosterId: BOOSTER_NECESSAIRE_DU_MARIN,
    cycle: [[xp(75)], [tides(20)], [card()], [tides(TIDE_REWARD.small)], [tides(40)], [xp(100)], [booster(BOOSTER_NECESSAIRE_DU_MARIN)]],
  },
  {
    boosterId: BOOSTER_ECLATS_EN_SELLE,
    cycle: [[tides(20)], [xp(75)], [tides(TIDE_REWARD.small)], [card(BOOSTER_ECLATS_EN_SELLE)], [xp(100)], [tides(40)], [booster(BOOSTER_ECLATS_EN_SELLE)]],
  },
];

/** Cycle de la semaine 0 — conservé pour les lectures qui ne connaissent pas la semaine. */
export const LOGIN_REWARD_CYCLE: LoginCycle = LOGIN_WEEKLY_PROGRAMMES[0]!.cycle;

/** Jour UTC décalé de `delta` jours (`YYYY-MM-DD`). */
export function shiftDayKey(dayKey: string, delta: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Numéro de la semaine UTC (du lundi au dimanche) qui contient ce jour,
 * compté depuis la semaine du 1er janvier 1970 — un jeudi, d'où le `+ 3`
 * qui ramène le début de semaine au lundi.
 */
export function loginWeekIndex(dayKey: string): number {
  const days = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
  return Math.floor((days + 3) / 7);
}

/** Programme de la semaine `weekIndex` (bouclé sur la liste). */
export function loginWeekProgramme(weekIndex: number): LoginWeekProgramme {
  const count = LOGIN_WEEKLY_PROGRAMMES.length;
  return LOGIN_WEEKLY_PROGRAMMES[((Math.floor(weekIndex) % count) + count) % count]!;
}

/**
 * État persisté du cycle pour un joueur (`player_login_rewards`).
 * `step` est l'étape À RÉCLAMER (1 à `LOGIN_CYCLE_LENGTH`).
 */
export interface LoginRewardState {
  step: number;
  /** Jour UTC (`YYYY-MM-DD`) de la dernière réclamation — `null` si jamais réclamée. */
  lastClaimedDay: string | null;
  /** Jours consécutifs réclamés, jusqu'à `lastClaimedDay` compris. Absent : 0. */
  streak?: number;
}

/** Ramène une étape quelconque dans `1..LOGIN_CYCLE_LENGTH`. */
export function normalizeStep(step: number): number {
  const zeroBased = (Math.max(1, Math.floor(step)) - 1) % LOGIN_CYCLE_LENGTH;
  return zeroBased + 1;
}

/** Récompenses de l'étape `step` (1-indexée, bouclée sur le cycle) pour la semaine `weekIndex`. */
export function loginRewardForStep(step: number, weekIndex = 0): readonly LoginRewardItem[] {
  return loginWeekProgramme(weekIndex).cycle[normalizeStep(step) - 1] ?? [];
}

/**
 * Le joueur peut-il réclamer aujourd'hui ? Une seule réclamation par jour
 * UTC — mais JAMAIS de remise à zéro : deux semaines d'absence laissent
 * l'étape exactement là où elle était.
 */
export function canClaimLoginReward(state: LoginRewardState, todayKey: string): boolean {
  return state.lastClaimedDay !== todayKey;
}

/** Série après une réclamation aujourd'hui : +1 si la veille a été réclamée, sinon on repart à 1. */
export function nextLoginStreak(state: LoginRewardState, todayKey: string): number {
  return state.lastClaimedDay === shiftDayKey(todayKey, -1) ? (state.streak ?? 0) + 1 : 1;
}

/**
 * Série EN COURS vue aujourd'hui : celle en base si la dernière réclamation
 * date d'aujourd'hui ou d'hier (elle peut encore continuer), 0 sinon.
 */
export function currentLoginStreak(state: LoginRewardState, todayKey: string): number {
  const alive = state.lastClaimedDay === todayKey || state.lastClaimedDay === shiftDayKey(todayKey, -1);
  return alive ? (state.streak ?? 0) : 0;
}

/** État après une réclamation réussie — l'étape avance d'un cran, en boucle ; la série se prolonge ou repart. */
export function advanceLoginStep(state: LoginRewardState, todayKey: string): LoginRewardState {
  return { step: normalizeStep(state.step + 1), lastClaimedDay: todayKey, streak: nextLoginStreak(state, todayKey) };
}

/**
 * Jours consécutifs pour la récompense de série — « un mois ». Répété : 60,
 * 90… jours d'affilée en redonnent une. La fonction Postgres
 * `claim_login_reward` porte la même valeur.
 */
export const LOGIN_STREAK_MILESTONE = 30;

/** Récompense de série débloquée en atteignant `streak` jours consécutifs (vide hors palier). */
export function loginStreakBonus(streak: number): readonly LoginRewardItem[] {
  return streak > 0 && streak % LOGIN_STREAK_MILESTONE === 0 ? [{ kind: "card", rarity: "abyssal" }] : [];
}

/** Réclamations encore nécessaires, à partir de la série `streak`, pour atteindre le prochain palier. */
export function daysUntilStreakBonus(streak: number): number {
  return LOGIN_STREAK_MILESTONE - (Math.max(0, streak) % LOGIN_STREAK_MILESTONE);
}

/**
 * Cartes dans lesquelles pioche une récompense « carte » : le pool du
 * booster désigné, sinon celui de tous les boosters achetables, filtré sur
 * la rareté. Tiré du catalogue du moteur (miroir de `booster_pool_cards`) :
 * la pioche ne dépend plus d'une requête qui pouvait revenir vide sans bruit.
 */
export function loginCardPool(item: Extract<LoginRewardItem, { kind: "card" }>): string[] {
  const boosters = item.boosterId ? [item.boosterId] : PURCHASABLE_BOOSTER_IDS;
  const ids = new Set(boosters.flatMap((id) => BOOSTER_POOLS[id] ?? []));
  return [...ids].filter((cardId) => rarityForCardId(cardId) === item.rarity);
}

const RARITY_LABELS: Record<CardRarity, string> = {
  common: "commune",
  uncommon: "peu commune",
  rare: "rare",
  epic: "épique",
  legendary: "légendaire",
  abyssal: "Abyssale",
};

/** Nom affiché d'un booster (repli : son identifiant). */
export function loginBoosterName(boosterId: string): string {
  // « Booster Défaut » : le mot est déjà dans chaque libellé (« 1 booster … »).
  return (boosterExtension(boosterId)?.name ?? boosterId).replace(/^Booster\s+/i, "");
}

/** Libellé joueur d'une récompense de connexion. */
export function loginRewardLabel(item: LoginRewardItem): string {
  switch (item.kind) {
    case "tides":
      return `${item.amount} Tides`;
    case "xp":
      return `${item.amount} XP`;
    case "booster": {
      const name = loginBoosterName(item.boosterId);
      return item.count > 1 ? `${item.count} boosters ${name}` : `1 booster ${name}`;
    }
    case "card": {
      if (item.cardId) return `${item.rarity === "abyssal" ? "Carte Abyssale" : "Carte"} : ${getCardDefinition(item.cardId).name}`;
      const base = `Carte ${RARITY_LABELS[item.rarity]} aléatoire`;
      return item.boosterId ? `${base} (${loginBoosterName(item.boosterId)})` : base;
    }
  }
}

/** Libellé condensé d'une étape entière. */
export function loginStepLabel(step: number, weekIndex = 0): string {
  return loginRewardForStep(step, weekIndex).map(loginRewardLabel).join(" · ");
}
