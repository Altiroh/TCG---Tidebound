import type { GameState, PlayerId } from "@/game";
import { computeMatchStats } from "@/game/quests";
import { syncAchievements } from "@/features/achievements/achievementService";
import { syncCollectables } from "@/features/cosmetics/collectablesService";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Statistiques à vie — écriture SERVEUR. Pas de `"use server"` : la
 * fonction prend un identifiant de joueur, elle ne doit jamais devenir un
 * point d'entrée joignable depuis le navigateur.
 */

export interface RecordMatchLifetimeStatsInput {
  matchId: string;
  userId: string;
  /** Identifiant du joueur DANS le moteur — l'uuid de profil pour une partie serveur. */
  playerId: PlayerId;
  finalState: GameState;
  /** Même lecture que les quêtes : `false` sous la dérogation de développement. */
  vsBot: boolean;
  won: boolean;
}

/**
 * Verse la contribution d'une partie terminée aux compteurs à vie
 * (`record_match_lifetime_stats`, idempotente par partie), puis rejuge
 * exploits et Collectables si la partie vient VRAIMENT d'être comptée :
 * « Le Puits sans fond » doit tomber à la fin de la partie qui l'a mérité,
 * pas à la suivante.
 *
 * Ne lève jamais. Tant que la migration `20261020120000_statistiques_a_vie`
 * n'est pas appliquée, l'appel échoue, se journalise, et la fin de partie
 * continue comme avant.
 */
export async function recordMatchLifetimeStats(input: RecordMatchLifetimeStatsInput): Promise<void> {
  try {
    const stats = computeMatchStats({
      state: input.finalState,
      playerId: input.playerId,
      vsBot: input.vsBot,
      won: input.won,
    });

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("record_match_lifetime_stats", {
      p_user_id: input.userId,
      p_match_id: input.matchId,
      p_stats: stats as Record<string, number>,
    });
    if (error) {
      console.error("[recordMatchLifetimeStats] Enregistrement refusé :", error.message);
      return;
    }
    if (!data?.recorded) return;

    await syncAchievements(input.userId);
    await syncCollectables(input.userId);
  } catch (error) {
    console.error("[recordMatchLifetimeStats] Échec :", error);
  }
}
