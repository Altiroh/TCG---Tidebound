"use server";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  computeMatchReward,
  progressionView,
  utcDayKey,
  type MatchMode,
  type MatchOutcome,
  type MatchReward,
  type ProgressionView,
} from "@/game/progression";

/**
 * Progression joueur — lecture et octroi.
 *
 * L'octroi est AUTORITAIRE côté serveur : le calcul vient de
 * `game/progression/matchRewards.ts` (pur, testé), l'écriture d'une seule
 * fonction Postgres atomique et idempotente (`grant_match_progression`).
 * Aucun chemin ne permet au navigateur de s'attribuer de l'XP ou des Tides.
 */

export interface ProgressionSummary {
  isSignedIn: boolean;
  view: ProgressionView;
  /** Solde de Tides, affiché à côté du niveau. */
  balance: number;
  matchesPlayed: number;
  pvpWins: number;
}

const SIGNED_OUT: ProgressionSummary = {
  isSignedIn: false,
  view: progressionView(0),
  balance: 0,
  matchesPlayed: 0,
  pvpWins: 0,
};

/**
 * Progression du joueur connecté, pour affichage. Ne fait jamais planter la
 * page appelante : une config Supabase absente dégrade vers "non connecté",
 * comme le reste des lectures de l'app.
 */
export async function fetchProgression(): Promise<ProgressionSummary> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return SIGNED_OUT;

    const [progression, currency] = await Promise.all([
      supabase.from("player_progression").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("player_currency").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);

    return {
      isSignedIn: true,
      view: progressionView(progression.data?.xp_total ?? 0),
      balance: currency.data?.balance ?? 0,
      matchesPlayed: progression.data?.matches_played ?? 0,
      pvpWins: progression.data?.pvp_wins ?? 0,
    };
  } catch (error) {
    console.error("[fetchProgression] Lecture impossible :", error);
    return SIGNED_OUT;
  }
}

export interface AwardMatchRewardInput {
  matchId: string;
  userId: string;
  mode: MatchMode;
  outcome: MatchOutcome;
  /** Dérogation de développement, cf. `features/progression/botRewardPolicy.ts`. */
  allowBotTides?: boolean;
}

/**
 * Octroie les récompenses d'une partie TERMINÉE à un joueur.
 *
 * À n'appeler QUE depuis un contexte serveur qui a lui-même constaté la fin
 * de la partie dans `matches` (cf. `features/online/actions.ts`) : la
 * fonction ne vérifie pas que la partie est finie, elle vérifie seulement
 * qu'elle n'a pas déjà payé ce joueur (idempotence par clé primaire sur
 * `match_rewards`). C'est cette contrainte qui rend l'appel sûr même
 * répété — deux soumissions d'action concurrentes ne peuvent pas doubler la
 * récompense.
 *
 * Retourne `null` si la partie avait déjà été récompensée, ou en cas
 * d'échec : une récompense manquée ne doit jamais faire échouer le coup de
 * jeu qui vient d'être joué.
 */
export async function awardMatchReward({
  matchId,
  userId,
  mode,
  outcome,
  allowBotTides = false,
}: AwardMatchRewardInput): Promise<MatchReward | null> {
  try {
    const service = createSupabaseServiceRoleClient();

    const { data: current } = await service
      .from("player_progression")
      .select("xp_total, level, last_pvp_win_day")
      .eq("user_id", userId)
      .maybeSingle();

    const isPvpWin = mode !== "bot" && outcome === "win";
    const isFirstPvpWinOfDay = isPvpWin && current?.last_pvp_win_day !== utcDayKey();

    const reward = computeMatchReward({
      mode,
      outcome,
      progression: { xpTotal: current?.xp_total ?? 0, level: current?.level ?? 1 },
      isFirstPvpWinOfDay,
      allowBotTides,
    });

    const { data, error } = await service.rpc("grant_match_progression", {
      p_match_id: matchId,
      p_user_id: userId,
      p_xp: reward.xp,
      p_tides: reward.totalTides,
      p_target_level: reward.levelAfter,
      p_level_before: reward.levelBefore,
      p_first_win_of_day: reward.firstWinOfDay,
      p_is_pvp_win: isPvpWin,
      p_boosters: reward.boosterIds,
    });

    if (error) {
      console.error("[awardMatchReward] Octroi refusé :", error.message);
      return null;
    }
    if (!data?.granted) return null;

    return reward;
  } catch (error) {
    console.error("[awardMatchReward] Échec :", error);
    return null;
  }
}
