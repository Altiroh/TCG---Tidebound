"use server";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { readVoyageProgress } from "@/features/quests/voyageService";
import { syncAchievements } from "@/features/achievements/achievementService";
import {
  VOYAGE_CATALOG,
  currentVoyage,
  freshVoyageProgress,
  isVoyageComplete,
  nextClaimableTier,
  voyageById,
  voyageStepLabel,
  type VoyageReward,
} from "@/game/quests";

/**
 * Traversées — Server Actions exposées au navigateur. Le joueur est
 * TOUJOURS déduit de la session ; les montants viennent du catalogue
 * TypeScript, jamais du client, et la base vérifie qu'un palier réclamé est
 * bien atteint et bien le suivant (`claim_voyage_tier`).
 */

export type VoyageStatus = "done" | "current" | "locked";

export interface VoyageStepView {
  code: string;
  name: string;
  label: string;
  /** Progression affichée : pleine pour une escale faite, vide pour une escale à venir. */
  progress: number;
  target: number;
  state: "done" | "current" | "upcoming";
  reward: VoyageReward;
  /** Palier de cette escale (1 à 5) déjà réclamé. */
  claimed: boolean;
}

export interface VoyageView {
  id: string;
  numeral: string;
  name: string;
  tagline: string;
  status: VoyageStatus;
  /** Palier atteint, 0 à 5. */
  tier: number;
  /** Prochain palier à réclamer, ou `null`. */
  claimableTier: number | null;
  steps: VoyageStepView[];
}

export interface VoyageBoard {
  /** `false` : non connecté, ou migration des Traversées pas encore appliquée. */
  available: boolean;
  voyages: VoyageView[];
}

export async function fetchVoyageBoard(): Promise<VoyageBoard> {
  const empty: VoyageBoard = { available: false, voyages: [] };
  try {
    const user = await getSessionUser();
    if (!user) return empty;
    const progressById = await readVoyageProgress(createSupabaseServiceRoleClient(), user.id);
    if (!progressById) return empty;

    const current = currentVoyage(progressById);
    return {
      available: true,
      voyages: VOYAGE_CATALOG.map((voyage) => {
        const progress = progressById.get(voyage.id) ?? freshVoyageProgress(voyage.id);
        const status: VoyageStatus = isVoyageComplete(progress) ? "done" : voyage.id === current?.id ? "current" : "locked";
        return {
          id: voyage.id,
          numeral: voyage.numeral,
          name: voyage.name,
          tagline: voyage.tagline,
          status,
          tier: progress.stepIndex,
          claimableTier: nextClaimableTier(progress),
          steps: voyage.steps.map((step, index) => ({
            code: step.code,
            name: step.name,
            label: voyageStepLabel(step),
            target: step.targetValue,
            progress: index < progress.stepIndex ? step.targetValue : index === progress.stepIndex ? Math.min(progress.stepProgress, step.targetValue) : 0,
            state: index < progress.stepIndex ? "done" : index === progress.stepIndex && status === "current" ? "current" : "upcoming",
            reward: step.reward,
            claimed: index < progress.claimedTiers,
          })),
        };
      }),
    };
  } catch (error) {
    console.error("[fetchVoyageBoard] Lecture impossible :", error);
    return empty;
  }
}

export interface ClaimVoyageTierResult {
  ok: boolean;
  error?: string;
  tier?: number;
  tidesGained?: number;
  xpGained?: number;
  boosterId?: string | null;
  balance?: number;
}

/** Réclame le PROCHAIN palier atteint d'une Traversée. */
export async function claimVoyageTier(voyageId: string): Promise<ClaimVoyageTierResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer une récompense." };
  const voyage = voyageById(voyageId);
  if (!voyage) return { ok: false, error: "Traversée inconnue." };

  try {
    const service = createSupabaseServiceRoleClient();
    const progressById = await readVoyageProgress(service, user.id);
    const progress = progressById?.get(voyage.id);
    const tier = progress ? nextClaimableTier(progress) : null;
    if (!tier) return { ok: false, error: "Aucun palier à réclamer." };
    const reward = voyage.steps[tier - 1]!.reward;

    const { data, error } = await service.rpc("claim_voyage_tier", {
      p_user_id: user.id,
      p_voyage_id: voyage.id,
      p_tier: tier,
      p_xp: reward.xp,
      p_tides: reward.tides,
      p_booster_id: reward.boosterId ?? null,
    });
    if (error) {
      console.error("[claimVoyageTier] Réclamation refusée :", error.message);
      return { ok: false, error: "Réclamation impossible pour le moment." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };

    // Filet : si l'exploit de fin de Traversée a été manqué à l'arbitrage,
    // réclamer le dernier palier le rattrape.
    if (tier === voyage.steps.length) await syncAchievements(user.id);

    return {
      ok: true,
      tier: data.tier,
      tidesGained: data.tides_gained,
      xpGained: data.xp_gained,
      boosterId: data.booster_id ?? null,
      balance: data.balance,
    };
  } catch (error) {
    console.error("[claimVoyageTier] Échec :", error);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
}

/** Ce qu'une partie a fait à l'escale en cours — pour l'écran de fin. */
export interface VoyageRecap {
  voyageId: string;
  voyageName: string;
  numeral: string;
  stepName: string;
  stepLabel: string;
  /** Palier que l'escale fait atteindre, 1 à 5. */
  tier: number;
  before: number;
  after: number;
  target: number;
  completedStep: boolean;
}

/**
 * Relevé figé à l'arbitrage (`match_voyage_progress`), relu tel quel :
 * rafraîchir l'écran de fin montre la même chose. `null` quand la partie
 * n'a pas touché l'escale — ou quand la migration manque.
 */
export async function fetchMatchVoyageRecap(matchId: string): Promise<VoyageRecap | null> {
  try {
    const user = await getSessionUser();
    if (!user) return null;
    const { data, error } = await createSupabaseServerClient()
      .from("match_voyage_progress")
      .select("voyage_recap")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) return null;
    const recap = data.voyage_recap;
    if (!("voyage_id" in recap)) return null;
    const voyage = voyageById(recap.voyage_id);
    const step = voyage?.steps[recap.step_index];
    if (!voyage || !step) return null;
    return {
      voyageId: voyage.id,
      voyageName: voyage.name,
      numeral: voyage.numeral,
      stepName: step.name,
      stepLabel: voyageStepLabel(step),
      tier: recap.step_index + 1,
      before: recap.before,
      after: recap.after,
      target: recap.target,
      completedStep: recap.completed_step,
    };
  } catch (error) {
    console.error("[fetchMatchVoyageRecap] Lecture impossible :", error);
    return null;
  }
}
