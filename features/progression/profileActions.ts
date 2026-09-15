"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  MAX_REWARDED_LEVEL,
  levelRewardsLabel,
  nextMilestones,
  progressionView,
  type LoginRewardItem,
  type ProgressionView,
} from "@/game/progression";
import { ACHIEVEMENT_CATALOG } from "@/game/achievements";
import { DEFAULT_CARD_BACK_ID } from "@/game";
import { claimLoginReward, readLoginRewards } from "@/features/progression/loginService";
import { syncAchievements } from "@/features/achievements/achievementService";
import { equipCardBackFor, loadCardBacks, type CardBackCollection } from "@/features/cosmetics/cardBackService";

/**
 * Profil joueur — Server Actions exposées au navigateur.
 *
 * Rassemble ce que la spec demande d'afficher (Notion « Progression
 * joueur » §12) : niveau, jauge, XP restante, récompense du prochain
 * niveau, prochains gros paliers, historique des paliers déjà récupérés,
 * état des connexions, exploits. Une seule lecture serveur pour tout
 * l'écran, plutôt qu'une requête par bloc.
 */

export interface ProfileLevelRow {
  level: number;
  label: string;
  /** `true` si ce palier a déjà été crédité (`player_level_rewards`). */
  claimed: boolean;
}

export interface ProfileAchievement {
  code: string;
  name: string;
  description: string;
  rewardTides: number;
  unlocked: boolean;
}

export interface ProfileSummary {
  isSignedIn: boolean;
  displayName: string | null;
  view: ProgressionView;
  balance: number;
  preconTokens: number;
  matchesPlayed: number;
  wins: number;
  /** Récompense du niveau suivant, en toutes lettres. */
  nextLevelReward: string;
  /** Prochains gros paliers (niveau + libellé). */
  upcomingMilestones: ProfileLevelRow[];
  /** Derniers paliers déjà récupérés, du plus récent au plus ancien. */
  claimedLevels: ProfileLevelRow[];
  /** Cycle de connexion : étape à réclamer et disponibilité du jour. */
  login: { step: number; items: readonly LoginRewardItem[]; claimable: boolean; totalClaims: number };
  achievements: ProfileAchievement[];
  /**
   * Dos de carte débloqués et celui équipé. Seule famille de cosmétiques
   * rendue pour l'instant — les autres sont stockées mais pas encore
   * portées par le jeu.
   */
  cardBacks: CardBackCollection;
  /** `true` si le niveau maximum récompensé de cette version est atteint. */
  maxRewardedLevelReached: boolean;
}

const SIGNED_OUT: ProfileSummary = {
  isSignedIn: false,
  displayName: null,
  view: progressionView(0),
  balance: 0,
  preconTokens: 0,
  matchesPlayed: 0,
  wins: 0,
  nextLevelReward: "—",
  upcomingMilestones: [],
  claimedLevels: [],
  login: { step: 1, items: [], claimable: false, totalClaims: 0 },
  achievements: [],
  cardBacks: { options: [], equipped: DEFAULT_CARD_BACK_ID },
  maxRewardedLevelReached: false,
};

export async function fetchProfile(): Promise<ProfileSummary> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return SIGNED_OUT;

    // Rattrape les exploits dus mais pas encore octroyés : le profil est
    // l'endroit naturel pour ça, et l'opération est idempotente.
    await syncAchievements(user.id);

    const service = createSupabaseServiceRoleClient();
    const [progression, currency, profile, claimed, unlocked, login, cardBacks] = await Promise.all([
      service.from("player_progression").select("xp_total, level, matches_played, pvp_wins, precon_tokens").eq("user_id", user.id).maybeSingle(),
      service.from("player_currency").select("balance").eq("user_id", user.id).maybeSingle(),
      service.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      service.from("player_level_rewards").select("level").eq("user_id", user.id).order("level", { ascending: false }).limit(8),
      service.from("player_achievements").select("code").eq("user_id", user.id),
      readLoginRewards(user.id),
      loadCardBacks(user.id),
    ]);

    const view = progressionView(progression.data?.xp_total ?? 0);
    const unlockedCodes = new Set((unlocked.data ?? []).map((row) => row.code));

    return {
      isSignedIn: true,
      displayName: profile.data?.display_name ?? user.email ?? null,
      view,
      balance: currency.data?.balance ?? 0,
      preconTokens: progression.data?.precon_tokens ?? 0,
      matchesPlayed: progression.data?.matches_played ?? 0,
      wins: progression.data?.pvp_wins ?? 0,
      nextLevelReward: view.level >= MAX_REWARDED_LEVEL ? "—" : levelRewardsLabel(view.level + 1),
      upcomingMilestones: nextMilestones(view.level, 3).map((level) => ({ level, label: levelRewardsLabel(level), claimed: false })),
      claimedLevels: (claimed.data ?? []).map((row) => ({ level: row.level, label: levelRewardsLabel(row.level), claimed: true })),
      login,
      achievements: ACHIEVEMENT_CATALOG.map((achievement) => ({
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        rewardTides: achievement.rewardTides,
        unlocked: unlockedCodes.has(achievement.code),
      })),
      cardBacks,
      maxRewardedLevelReached: view.level >= MAX_REWARDED_LEVEL,
    };
  } catch (error) {
    console.error("[fetchProfile] Lecture impossible :", error);
    return SIGNED_OUT;
  }
}

export interface ClaimLoginActionResult {
  ok: boolean;
  error?: string;
  tides?: number;
  xp?: number;
  boosterId?: string | null;
}

/** Réclame la récompense de connexion du jour (§8). Une par jour UTC, jamais de remise à zéro. */
export async function claimDailyLogin(): Promise<ClaimLoginActionResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer ta récompense." };

  const result = await claimLoginReward(user.id);
  if (result.ok) {
    revalidatePath("/profil");
    revalidatePath("/");
  }
  return { ok: result.ok, error: result.error, tides: result.tides, xp: result.xp, boosterId: result.boosterId ?? null };
}

export interface EquipCardBackActionResult {
  ok: boolean;
  error?: string;
  /** Identifiant réellement équipé — le client aligne son miroir dessus. */
  equipped?: string;
}

/**
 * Équipe un dos de carte. Le joueur vient TOUJOURS de la session : un
 * identifiant de joueur en paramètre ferait de cette action un moyen
 * d'équiper le cosmétique de quelqu'un d'autre.
 */
export async function equipCardBack(cardBackId: string): Promise<EquipCardBackActionResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour changer de dos de carte." };

  const result = await equipCardBackFor(user.id, cardBackId);
  if (result.ok) revalidatePath("/profil");
  return result;
}
