import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  advanceLoginStep,
  canClaimLoginReward,
  loginRewardForStep,
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
 * joueur exactement là où il s'était arrêté.
 */

export interface LoginRewardView {
  /** Étape à réclamer (1 à 7). */
  step: number;
  items: readonly LoginRewardItem[];
  /** `true` si la réclamation du jour est encore disponible. */
  claimable: boolean;
  totalClaims: number;
}

export async function readLoginRewards(userId: string, now: Date = new Date()): Promise<LoginRewardView> {
  const today = utcDayKey(now);
  try {
    const service = createSupabaseServiceRoleClient();
    const { data } = await service
      .from("player_login_rewards")
      .select("step, last_claimed_day, total_claims")
      .eq("user_id", userId)
      .maybeSingle();

    const state: LoginRewardState = {
      step: normalizeStep(data?.step ?? 1),
      lastClaimedDay: data?.last_claimed_day ?? null,
    };
    return {
      step: state.step,
      items: loginRewardForStep(state.step),
      claimable: canClaimLoginReward(state, today),
      totalClaims: data?.total_claims ?? 0,
    };
  } catch (error) {
    console.error("[readLoginRewards] Lecture impossible :", error);
    return { step: 1, items: loginRewardForStep(1), claimable: false, totalClaims: 0 };
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
}

/**
 * Réclame la récompense du jour. Le montant est dérivé de l'ÉTAPE LUE EN
 * BASE, jamais d'un paramètre client — et la fonction Postgres revérifie
 * cette étape avant d'écrire, pour qu'un onglet resté ouvert ne puisse pas
 * rejouer une étape plus généreuse.
 */
export async function claimLoginReward(userId: string, now: Date = new Date()): Promise<ClaimLoginRewardResult> {
  try {
    const today = utcDayKey(now);
    const service = createSupabaseServiceRoleClient();

    const { data: current } = await service
      .from("player_login_rewards")
      .select("step, last_claimed_day")
      .eq("user_id", userId)
      .maybeSingle();

    const state: LoginRewardState = {
      step: normalizeStep(current?.step ?? 1),
      lastClaimedDay: current?.last_claimed_day ?? null,
    };
    if (!canClaimLoginReward(state, today)) {
      return { ok: false, error: "Récompense de connexion déjà réclamée aujourd'hui." };
    }

    const items = loginRewardForStep(state.step);
    const tides = items.reduce((sum, item) => sum + (item.kind === "tides" ? item.amount : 0), 0);
    const xp = items.reduce((sum, item) => sum + (item.kind === "xp" ? item.amount : 0), 0);
    const boosterId = items.find((item) => item.kind === "booster")?.kind === "booster"
      ? (items.find((item) => item.kind === "booster") as Extract<LoginRewardItem, { kind: "booster" }>).boosterId
      : null;

    // Une étape « carte aléatoire » tire sa carte côté serveur, dans la
    // rareté demandée : le client ne choisit rien.
    const cardItem = items.find((item) => item.kind === "card") as Extract<LoginRewardItem, { kind: "card" }> | undefined;
    let cardId: string | null = null;
    if (cardItem) {
      const { data: pool } = await service
        .from("cards")
        .select("id")
        .eq("rarity", cardItem.rarity)
        .eq("is_collectible", true)
        .eq("is_enabled", true);
      if (pool && pool.length > 0) cardId = pool[Math.floor(Math.random() * pool.length)]!.id;
    }

    const next = advanceLoginStep(state, today);
    const { data, error } = await service.rpc("claim_login_reward", {
      p_user_id: userId,
      p_step: state.step,
      p_next_step: next.step,
      p_tides: tides,
      p_xp: xp,
      p_booster_id: boosterId,
      p_card_id: cardId,
    });

    if (error) {
      console.error("[claimLoginReward] Refusé :", error.message);
      return { ok: false, error: "Réclamation impossible pour le moment." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };

    return { ok: true, step: next.step, tides, xp, boosterId, cardId };
  } catch (error) {
    console.error("[claimLoginReward] Échec :", error);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
}
