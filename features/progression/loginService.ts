import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  advanceLoginStep,
  canClaimLoginReward,
  currentLoginStreak,
  daysUntilStreakBonus,
  LOGIN_CYCLE_LENGTH,
  loginCardPool,
  loginRewardForStep,
  loginStreakBonus,
  loginWeekIndex,
  loginWeekProgramme,
  normalizeStep,
  utcDayKey,
  type LoginRewardItem,
  type LoginRewardState,
} from "@/game/progression";

/**
 * Récompenses de connexion — opérations SERVEUR (pas de `"use server"`).
 *
 * Le comportement NON PUNITIF (Notion §8) n'est pas une règle appliquée
 * ici : il découle de ce qui est stocké. `player_login_rewards` retient une
 * ÉTAPE et un jour de dernière réclamation, et rien dans ce module ne peut
 * faire reculer l'étape. Une absence de trois semaines laisse donc le
 * joueur exactement là où il s'était arrêté. Seule la SÉRIE (jours
 * consécutifs, colonne `streak`) repart à 1 après une absence.
 *
 * Le contenu du cycle dépend de la SEMAINE UTC du jour (`loginWeekProgramme`),
 * toujours calculée ici, jamais reçue du client.
 */

export interface LoginRewardView {
  /** Étape à réclamer (1 à 7). */
  step: number;
  items: readonly LoginRewardItem[];
  /** Les 7 escales de la semaine en cours, dans l'ordre. */
  cycle: readonly (readonly LoginRewardItem[])[];
  /** Booster mis en avant cette semaine. */
  weekBoosterId: string;
  /** `true` si la réclamation du jour est encore disponible. */
  claimable: boolean;
  totalClaims: number;
  /** Série en cours (0 si elle a été interrompue). */
  streak: number;
  bestStreak: number;
  /** Réclamations consécutives encore nécessaires pour la prochaine carte Abyssale. */
  daysToStreakBonus: number;
}

interface LoginRow {
  step: number;
  last_claimed_day: string | null;
  total_claims: number;
  streak?: number;
  best_streak?: number;
}

/**
 * Lit la ligne du joueur. Tant que la migration de la série
 * (`20261008120000`) n'est pas passée, les colonnes `streak` manquent : on
 * relit sans elles plutôt que de perdre tout le cycle.
 */
async function readLoginRow(service: ReturnType<typeof createSupabaseServiceRoleClient>, userId: string): Promise<LoginRow | null> {
  const full = await service
    .from("player_login_rewards")
    .select("step, last_claimed_day, total_claims, streak, best_streak")
    .eq("user_id", userId)
    .maybeSingle();
  if (!full.error) return (full.data as LoginRow | null) ?? null;
  const legacy = await service.from("player_login_rewards").select("step, last_claimed_day, total_claims").eq("user_id", userId).maybeSingle();
  return (legacy.data as LoginRow | null) ?? null;
}

function cycleOf(weekIndex: number): LoginRewardItem[][] {
  return Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => [...loginRewardForStep(index + 1, weekIndex)]);
}

export async function readLoginRewards(userId: string, now: Date = new Date()): Promise<LoginRewardView> {
  const today = utcDayKey(now);
  const week = loginWeekIndex(today);
  const programme = loginWeekProgramme(week);
  const fallback: LoginRewardView = {
    step: 1,
    items: loginRewardForStep(1, week),
    cycle: cycleOf(week),
    weekBoosterId: programme.boosterId,
    claimable: false,
    totalClaims: 0,
    streak: 0,
    bestStreak: 0,
    daysToStreakBonus: daysUntilStreakBonus(0),
  };
  try {
    const service = createSupabaseServiceRoleClient();
    const data = await readLoginRow(service, userId);

    const state: LoginRewardState = {
      step: normalizeStep(data?.step ?? 1),
      lastClaimedDay: data?.last_claimed_day ?? null,
      streak: data?.streak ?? 0,
    };
    const streak = currentLoginStreak(state, today);
    return {
      ...fallback,
      step: state.step,
      items: loginRewardForStep(state.step, week),
      claimable: canClaimLoginReward(state, today),
      totalClaims: data?.total_claims ?? 0,
      streak,
      bestStreak: data?.best_streak ?? 0,
      daysToStreakBonus: daysUntilStreakBonus(streak),
    };
  } catch (error) {
    console.error("[readLoginRewards] Lecture impossible :", error);
    return fallback;
  }
}

export interface ClaimLoginRewardResult {
  ok: boolean;
  error?: string;
  step?: number;
  tides?: number;
  xp?: number;
  boosterId?: string | null;
  cardId?: string | null;
  /** Série après cette réclamation. */
  streak?: number;
  /** Carte Abyssale gagnée au palier de série, s'il est atteint. */
  streakCardId?: string | null;
}

/** Tire une carte au hasard dans le pool d'une récompense « carte » (`null` si le pool est vide). */
function drawLoginCard(item: Extract<LoginRewardItem, { kind: "card" }>): string | null {
  const pool = loginCardPool(item);
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : null;
}

/**
 * Réclame la récompense du jour. Le montant est dérivé de l'ÉTAPE LUE EN
 * BASE et de la semaine du jour, jamais d'un paramètre client — et la
 * fonction Postgres revérifie cette étape avant d'écrire, pour qu'un onglet
 * resté ouvert ne puisse pas rejouer une étape plus généreuse.
 */
export async function claimLoginReward(userId: string, now: Date = new Date()): Promise<ClaimLoginRewardResult> {
  try {
    const today = utcDayKey(now);
    const week = loginWeekIndex(today);
    const service = createSupabaseServiceRoleClient();

    const current = await readLoginRow(service, userId);
    const state: LoginRewardState = {
      step: normalizeStep(current?.step ?? 1),
      lastClaimedDay: current?.last_claimed_day ?? null,
      streak: current?.streak ?? 0,
    };
    if (!canClaimLoginReward(state, today)) {
      return { ok: false, error: "Récompense de connexion déjà réclamée aujourd'hui." };
    }

    const items = loginRewardForStep(state.step, week);
    const tides = items.reduce((sum, item) => sum + (item.kind === "tides" ? item.amount : 0), 0);
    const xp = items.reduce((sum, item) => sum + (item.kind === "xp" ? item.amount : 0), 0);
    const boosterItem = items.find((item): item is Extract<LoginRewardItem, { kind: "booster" }> => item.kind === "booster");
    const boosterId = boosterItem?.boosterId ?? null;

    // Une étape « carte aléatoire » tire sa carte côté serveur, dans la
    // rareté et le pool de la semaine : le client ne choisit rien.
    const cardItem = items.find((item): item is Extract<LoginRewardItem, { kind: "card" }> => item.kind === "card");
    const cardId = cardItem ? drawLoginCard(cardItem) : null;
    if (cardItem && !cardId) console.error("[claimLoginReward] Pool vide pour", cardItem);

    // Palier de série : la carte n'est tirée que si la série PRÉVUE y tombe ;
    // la fonction Postgres recalcule la série et ne l'accorde qu'à ce palier.
    const next = advanceLoginStep(state, today);
    const bonusItem = loginStreakBonus(next.streak ?? 0).find(
      (item): item is Extract<LoginRewardItem, { kind: "card" }> => item.kind === "card"
    );
    const streakCardId = bonusItem ? drawLoginCard(bonusItem) : null;

    const { data, error } = await service.rpc("claim_login_reward", {
      p_user_id: userId,
      p_step: state.step,
      p_next_step: next.step,
      p_tides: tides,
      p_xp: xp,
      p_booster_id: boosterId,
      p_card_id: cardId,
      // Absent hors palier : l'appel reste compatible avec l'ancienne
      // fonction tant que la migration de la série n'est pas passée.
      ...(streakCardId ? { p_streak_card_id: streakCardId } : {}),
    });

    if (error) {
      console.error("[claimLoginReward] Refusé :", error.message);
      return { ok: false, error: "Réclamation impossible pour le moment." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };
    // L'ancienne fonction (avant `20261008120000`) ne renvoie pas de série :
    // l'escale avance, la série reste à 0 sans que personne ne le voie.
    if (data.streak === undefined) console.error("[claimLoginReward] claim_login_reward ne compte pas la série : migration 20261011120000 à appliquer.");

    return {
      ok: true,
      step: next.step,
      tides,
      xp,
      boosterId,
      cardId,
      streak: data.streak ?? next.streak,
      streakCardId: data.streak_card_id ?? null,
    };
  } catch (error) {
    console.error("[claimLoginReward] Échec :", error);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
}
