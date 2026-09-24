import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { syncAchievements } from "@/features/achievements/achievementService";
import {
  VOYAGE_CATALOG,
  advanceVoyage,
  currentVoyage,
  freshVoyageProgress,
  isVoyageComplete,
  type MatchQuestContribution,
  type VoyageProgress,
} from "@/game/quests";
import type { VoyageRecapRow } from "@/lib/supabase/types";

/**
 * Traversées — opérations SERVEUR. Pas de directive `"use server"` : ces
 * fonctions prennent un identifiant de joueur en paramètre et ne doivent
 * jamais devenir des Server Actions joignables depuis le navigateur (cf.
 * `questService.ts`). Les actions exposées vivent dans `actions.ts`.
 *
 * Tout le calcul est fait en TypeScript (`game/quests/voyages.ts`) ; la base
 * n'APPLIQUE qu'une écriture conditionnelle (`apply_voyage_progress`), qui
 * refuse si la ligne a bougé depuis la lecture.
 *
 * Tolérance : tant que la migration `20261007120000_voyages.sql` n'est pas
 * appliquée, la lecture échoue, la Traversée n'existe pas pour le joueur,
 * et rien d'autre n'en souffre.
 */

type Service = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Progression du joueur sur chaque Traversée, `null` si la table est
 * illisible (migration absente, base injoignable). Une Traversée sans
 * ligne n'est pas commencée : elle vaut `freshVoyageProgress`.
 */
export async function readVoyageProgress(service: Service, userId: string): Promise<Map<string, VoyageProgress> | null> {
  const { data, error } = await service
    .from("player_voyages")
    .select("voyage_id, step_index, step_progress, step_meta, claimed_tiers")
    .eq("user_id", userId);
  if (error) return null;
  const byId = new Map<string, VoyageProgress>();
  for (const voyage of VOYAGE_CATALOG) byId.set(voyage.id, freshVoyageProgress(voyage.id));
  for (const row of data ?? []) {
    byId.set(row.voyage_id, {
      voyageId: row.voyage_id,
      stepIndex: row.step_index,
      stepProgress: row.step_progress,
      stepMeta: Array.isArray(row.step_meta) ? row.step_meta : [],
      claimedTiers: row.claimed_tiers,
    });
  }
  return byId;
}

export interface RecordMatchVoyageProgressInput {
  matchId: string;
  userId: string;
  /** La MÊME contribution que celle écrite pour les quêtes : une partie, un calcul. */
  contribution: MatchQuestContribution;
}

/**
 * Fait avancer l'escale en cours de la Traversée en cours. Idempotent par
 * partie (`match_voyage_progress`). Ne lève jamais : une escale manquée ne
 * doit pas faire échouer le coup qui a fini la partie.
 */
export async function recordMatchVoyageProgress({ matchId, userId, contribution }: RecordMatchVoyageProgressInput): Promise<void> {
  try {
    const service = createSupabaseServiceRoleClient();
    // Deux essais : le second ne sert que si une autre partie du même joueur
    // a écrit entre notre lecture et notre écriture.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const progressById = await readVoyageProgress(service, userId);
      if (!progressById) return;
      const voyage = currentVoyage(progressById);
      if (!voyage) return;
      const progress = progressById.get(voyage.id) ?? freshVoyageProgress(voyage.id);
      const advance = advanceVoyage(voyage, progress, contribution);
      if (!advance) return;

      const recap: VoyageRecapRow = {
        voyage_id: voyage.id,
        step_index: progress.stepIndex,
        before: advance.before,
        after: advance.after,
        target: advance.target,
        completed_step: advance.completedStep,
      };
      const { data, error } = await service.rpc("apply_voyage_progress", {
        p_match_id: matchId,
        p_user_id: userId,
        p_voyage_id: voyage.id,
        p_expected_step: progress.stepIndex,
        p_expected_progress: progress.stepProgress,
        p_step_index: advance.next.stepIndex,
        p_step_progress: advance.next.stepProgress,
        p_step_meta: [...advance.next.stepMeta],
        p_recap: recap,
      });
      if (error) {
        console.error("[recordMatchVoyageProgress] Écriture refusée :", error.message);
        return;
      }
      if (data?.conflict) continue;
      // Traversée bouclée : l'exploit (et donc le titre) tombe maintenant,
      // pas à la prochaine synchronisation.
      if (data?.recorded && isVoyageComplete(advance.next)) await syncAchievements(userId);
      return;
    }
  } catch (error) {
    console.error("[recordMatchVoyageProgress] Échec :", error);
  }
}
