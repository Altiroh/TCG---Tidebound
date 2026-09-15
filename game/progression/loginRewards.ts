import { TIDE_REWARD, STANDARD_BOOSTER_ID } from "@/game/economy/constants";

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
 */

/** Une récompense élémentaire d'étape de connexion. */
export type LoginRewardItem =
  | { kind: "tides"; amount: number }
  | { kind: "xp"; amount: number }
  | { kind: "booster"; boosterId: string; count: number }
  | { kind: "card"; rarity: "common" | "uncommon" | "rare" };

/** Longueur du cycle ; passé la dernière étape, on recommence à la première. */
export const LOGIN_CYCLE_LENGTH = 7;

/**
 * Cycle de 7 escales (§8). L'étape 7 donne le booster : c'est le jalon qui
 * rend le cycle visible, et la direction visuelle suggérée (« carte marine
 * à 7 escales, avec un petit navire qui avance ») s'appuie dessus.
 */
export const LOGIN_REWARD_CYCLE: readonly (readonly LoginRewardItem[])[] = [
  [{ kind: "tides", amount: 20 }],
  [{ kind: "xp", amount: 75 }],
  [{ kind: "tides", amount: TIDE_REWARD.small }],
  [{ kind: "card", rarity: "common" }],
  [{ kind: "xp", amount: 100 }],
  [{ kind: "tides", amount: 40 }],
  [{ kind: "booster", boosterId: STANDARD_BOOSTER_ID, count: 1 }],
];

/**
 * État persisté du cycle pour un joueur (`player_login_rewards`).
 * `step` est l'étape À RÉCLAMER (1 à `LOGIN_CYCLE_LENGTH`).
 */
export interface LoginRewardState {
  step: number;
  /** Jour UTC (`YYYY-MM-DD`) de la dernière réclamation — `null` si jamais réclamée. */
  lastClaimedDay: string | null;
}

/** Ramène une étape quelconque dans `1..LOGIN_CYCLE_LENGTH`. */
export function normalizeStep(step: number): number {
  const zeroBased = (Math.max(1, Math.floor(step)) - 1) % LOGIN_CYCLE_LENGTH;
  return zeroBased + 1;
}

/** Récompenses de l'étape `step` (1-indexée, bouclée sur le cycle). */
export function loginRewardForStep(step: number): readonly LoginRewardItem[] {
  return LOGIN_REWARD_CYCLE[normalizeStep(step) - 1] ?? [];
}

/**
 * Le joueur peut-il réclamer aujourd'hui ? Une seule réclamation par jour
 * UTC — mais JAMAIS de remise à zéro : deux semaines d'absence laissent
 * l'étape exactement là où elle était.
 */
export function canClaimLoginReward(state: LoginRewardState, todayKey: string): boolean {
  return state.lastClaimedDay !== todayKey;
}

/** État après une réclamation réussie — l'étape avance d'un cran, en boucle. */
export function advanceLoginStep(state: LoginRewardState, todayKey: string): LoginRewardState {
  return { step: normalizeStep(state.step + 1), lastClaimedDay: todayKey };
}

/** Libellé joueur d'une récompense de connexion. */
export function loginRewardLabel(item: LoginRewardItem): string {
  switch (item.kind) {
    case "tides":
      return `${item.amount} Tides`;
    case "xp":
      return `${item.amount} XP`;
    case "booster":
      return item.count > 1 ? `${item.count} boosters Standard` : "1 booster Standard";
    case "card":
      return item.rarity === "common" ? "Carte commune aléatoire" : item.rarity === "uncommon" ? "Carte peu commune aléatoire" : "Carte rare aléatoire";
  }
}

/** Libellé condensé d'une étape entière. */
export function loginStepLabel(step: number): string {
  return loginRewardForStep(step).map(loginRewardLabel).join(" · ");
}
