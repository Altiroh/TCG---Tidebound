import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { GameState, PlayerId } from "@/game";
import {
  computeMatchReward,
  matchActivity,
  utcDayKey,
  type MatchMode,
  type MatchOutcome,
  type MatchReward,
} from "@/game/progression";
import { syncAchievements } from "@/features/achievements/achievementService";
import { openLevelCardChoices } from "@/features/progression/cardChoices";

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
  /**
   * État FINAL de la partie et identité du joueur dans le moteur — servent
   * à mesurer son ACTIVITÉ RÉELLE (anti-AFK, Notion « Progression joueur »
   * §7). Absents, la partie est considérée comme jouée normalement.
   */
  finalState?: GameState;
  enginePlayerId?: PlayerId;
  /**
   * Dérogation de développement : la partie contre bot compte comme une
   * partie PvP. Cf. `features/progression/botRewardPolicy.ts` — décidée
   * là-bas, jamais ici.
   */
  botCountsAsPvp?: boolean;
}

/**
 * Octroie les récompenses d'une partie TERMINÉE à un joueur.
 *
 * Ne vérifie pas que la partie est finie : l'appelant l'a constaté dans
 * l'état autoritaire. Vérifie en revanche qu'elle n'a pas déjà payé ce
 * joueur (idempotence par clé primaire sur `match_rewards`), et chaque
 * palier de niveau est protégé séparément par `player_level_rewards` : même
 * un `level_before` périmé ne peut pas recréditer un palier.
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
  finalState,
  enginePlayerId,
  botCountsAsPvp = false,
}: AwardMatchRewardInput): Promise<MatchReward | null> {
  try {
    const service = createSupabaseServiceRoleClient();
    const today = utcDayKey();

    const { data: current } = await service
      .from("player_progression")
      .select("xp_total, level, last_win_day, daily_matches_day, daily_matches_count")
      .eq("user_id", userId)
      .maybeSingle();

    const isWin = outcome === "win";
    // Sous la dérogation, une victoire contre bot alimente aussi les
    // compteurs PvP : les exploits et les quêtes PvP deviennent testables en
    // solo, ce qui est tout l'intérêt.
    const isPvpWin = (mode !== "bot" || botCountsAsPvp) && isWin;
    const isFirstWinOfDay = isWin && current?.last_win_day !== today;
    // Le compteur du jour ne vaut que pour AUJOURD'HUI : une journée UTC qui
    // change repart de zéro, sans tâche de maintenance.
    const matchesFinishedToday = current?.daily_matches_day === today ? (current?.daily_matches_count ?? 0) : 0;

    const activity = finalState && enginePlayerId ? matchActivity(finalState, enginePlayerId) : undefined;

    const reward = computeMatchReward({
      mode,
      outcome,
      progression: { xpTotal: current?.xp_total ?? 0, level: current?.level ?? 1 },
      isFirstWinOfDay,
      matchesFinishedToday,
      activity,
      botCountsAsPvp,
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
      p_is_win: isWin,
      // Une partie abandonnée ne compte pas dans les 3 parties du jour :
      // sinon l'abandon en boucle débloquerait le bonus quotidien.
      p_counts_for_daily: !reward.abandoned,
      p_level_rewards: reward.levelRewards.map((entry) => ({ level: entry.level, items: entry.items })),
    });

    if (error) {
      console.error("[awardMatchReward] Octroi refusé :", error.message);
      return null;
    }
    if (!data?.granted) return null;

    // Paliers « carte au choix » : le tirage des propositions se fait après
    // l'octroi, et n'a pas le droit de le faire échouer.
    if (reward.cardChoices.length > 0) await openLevelCardChoices(userId, reward.cardChoices);
    // Exploits : recalculés depuis les compteurs à jour, jamais depuis
    // l'événement — un exploit manqué se rattrape à la partie suivante.
    await syncAchievements(userId);

    return reward;
  } catch (error) {
    console.error("[awardMatchReward] Échec :", error);
    return null;
  }
}
