import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { computeMatchReward, utcDayKey, type MatchMode, type MatchOutcome, type MatchReward } from "@/game/progression";

/**
 * Octroi des récompenses de partie — module SERVEUR, volontairement sans
 * directive `"use server"`.
 *
 * Tant qu'`awardMatchReward` était exportée depuis un fichier `"use server"`,
 * Next.js en faisait une Server Action : un point d'entrée HTTP que
 * n'importe quel navigateur connecté pouvait appeler avec l'identifiant de
 * partie, le joueur et l'issue de son choix. Ici, elle n'est joignable que
 * par du code serveur qui l'importe — en pratique `features/matches/matchStore.ts`,
 * après avoir lui-même constaté la fin de la partie.
 */

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
 * Ne vérifie pas que la partie est finie : l'appelant l'a constaté dans
 * l'état autoritaire. Vérifie en revanche qu'elle n'a pas déjà payé ce
 * joueur (idempotence par clé primaire sur `match_rewards`).
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
