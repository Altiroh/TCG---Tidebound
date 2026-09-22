import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { STANDARD_BOOSTER_ID } from "@/game/economy";
import { syncAchievements } from "@/features/achievements/achievementService";

/**
 * Onboarding — opérations SERVEUR (pas de `"use server"`). Les Server
 * Actions exposées vivent dans `features/onboarding/actions.ts` et
 * déduisent toujours le joueur de sa session.
 *
 * Règle verrouillée (Notion « Progression joueur » §1) :
 *
 *   > S'il termine le tutoriel, il reçoit 1 booster de récompense.
 *   > S'il passe le tutoriel, il ne reçoit pas ce booster.
 *
 * Le booster n'est donc plus offert à la création du compte (cf. la
 * migration `..._player_progression_meta.sql`, qui a retiré cet octroi de
 * `handle_new_user`) : il est la récompense de l'APPRENTISSAGE, et rien
 * d'autre ne le donne.
 */

export type TutorialStatus = "not_started" | "completed" | "skipped";

export interface OnboardingState {
  tutorialStatus: TutorialStatus;
  /** `true` si le booster de tutoriel a déjà été crédité. */
  tutorialRewardClaimed: boolean;
  /**
   * Préconstruit pris avec le choix GRATUIT, ou `null`.
   *
   * En base la ligne porte toujours `source = 'borrowed'` : depuis la
   * fusion des deux rayons (22/09/2026), cette valeur ne désigne plus une
   * famille de deck mais la PORTE par laquelle il est entré — le choix
   * gratuit, par opposition au Jeton.
   */
  freeDeckId: string | null;
}

const UNKNOWN: OnboardingState = { tutorialStatus: "not_started", tutorialRewardClaimed: false, freeDeckId: null };

/** État d'onboarding d'un joueur — jamais d'exception, la page appelante doit survivre à une base absente. */
export async function readOnboarding(userId: string): Promise<OnboardingState> {
  try {
    const service = createSupabaseServiceRoleClient();
    const [onboarding, gratuit] = await Promise.all([
      service.from("player_onboarding").select("tutorial_status, tutorial_reward_claimed").eq("user_id", userId).maybeSingle(),
      service.from("player_deck_unlocks").select("deck_id").eq("user_id", userId).eq("source", "borrowed").maybeSingle(),
    ]);
    return {
      tutorialStatus: (onboarding.data?.tutorial_status as TutorialStatus | undefined) ?? "not_started",
      tutorialRewardClaimed: onboarding.data?.tutorial_reward_claimed ?? false,
      freeDeckId: gratuit.data?.deck_id ?? null,
    };
  } catch (error) {
    console.error("[readOnboarding] Lecture impossible :", error);
    return UNKNOWN;
  }
}

export interface FinishTutorialResult {
  ok: boolean;
  error?: string;
  /** `true` si un booster vient d'être crédité (tutoriel terminé, première fois). */
  boosterGranted?: boolean;
}

/**
 * Clôt le tutoriel, terminé ou passé. Idempotent : le booster n'est crédité
 * qu'à la première complétion, et repasser par « passer » après l'avoir
 * terminé ne retire rien.
 */
export async function finishTutorial(userId: string, completed: boolean): Promise<FinishTutorialResult> {
  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("finish_tutorial", {
      p_user_id: userId,
      p_completed: completed,
      p_booster_id: STANDARD_BOOSTER_ID,
    });
    if (error) {
      console.error("[finishTutorial] Refusé :", error.message);
      return { ok: false, error: "Impossible d'enregistrer la fin du tutoriel." };
    }
    // « Premier quart » se débloque dès que le tutoriel est terminé.
    if (completed) await syncAchievements(userId);
    return { ok: true, boosterGranted: Boolean(data?.booster_granted) };
  } catch (error) {
    console.error("[finishTutorial] Échec :", error);
    return { ok: false, error: "Impossible d'enregistrer la fin du tutoriel." };
  }
}
