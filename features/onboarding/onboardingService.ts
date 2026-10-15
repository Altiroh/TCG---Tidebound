import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { STANDARD_BOOSTER_ID } from "@/game/economy";
import { syncAchievements } from "@/features/achievements/achievementService";
import { ensureStarterDecks, grantStarterDecks, missingStarterDeckIds, starterMissionAccomplished } from "@/features/onboarding/starterMission";

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
 *
 * PREMIÈRE MISSION (15/10/2026) : terminé OU passé, le tutoriel débloque
 * les trois starters (`features/onboarding/starterMission.ts`). Elle
 * remplace le choix gratuit d'un préconstruit.
 */

export type TutorialStatus = "not_started" | "completed" | "skipped";

export interface OnboardingState {
  tutorialStatus: TutorialStatus;
  /** `true` si le booster de tutoriel a déjà été crédité. */
  tutorialRewardClaimed: boolean;
  /**
   * `true` quand la première mission est accomplie ET que les trois
   * starters sont bien débloqués — ce qui autorise son annonce.
   */
  starterMissionDone: boolean;
  /** Starters NOUVELLEMENT accordés par cette lecture (rattrapage d'un compte existant). */
  startersJustGranted: string[];
}

const UNKNOWN: OnboardingState = { tutorialStatus: "not_started", tutorialRewardClaimed: false, starterMissionDone: false, startersJustGranted: [] };

/**
 * État d'onboarding d'un joueur — jamais d'exception, la page appelante doit
 * survivre à une base absente.
 *
 * RATTRAPAGE PARESSEUX : un compte dont le tutoriel est déjà terminé ou
 * passé mais à qui manque un starter le reçoit ici (comptes d'avant le
 * 15/10/2026) — sans reprise de données en base.
 */
export async function readOnboarding(userId: string): Promise<OnboardingState> {
  try {
    const service = createSupabaseServiceRoleClient();
    const [onboarding, unlocks] = await Promise.all([
      service.from("player_onboarding").select("tutorial_status, tutorial_reward_claimed").eq("user_id", userId).maybeSingle(),
      service.from("player_deck_unlocks").select("deck_id").eq("user_id", userId),
    ]);
    const tutorialStatus = (onboarding.data?.tutorial_status as TutorialStatus | undefined) ?? "not_started";
    const before = (unlocks.data ?? []).map((row) => row.deck_id);
    const after = await ensureStarterDecks(userId, tutorialStatus, before);
    return {
      tutorialStatus,
      tutorialRewardClaimed: onboarding.data?.tutorial_reward_claimed ?? false,
      starterMissionDone: starterMissionAccomplished(tutorialStatus) && missingStarterDeckIds(after).length === 0,
      startersJustGranted: [...after].filter((deckId) => !before.includes(deckId)),
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
  /** Starters NOUVELLEMENT débloqués par la première mission — vide au tutoriel rejoué. */
  startersGranted?: string[];
}

/**
 * Clôt le tutoriel, terminé ou passé. Idempotent : le booster n'est crédité
 * qu'à la première complétion, et repasser par « passer » après l'avoir
 * terminé ne retire rien.
 *
 * Dans les DEUX cas, la première mission est accomplie : les starters sont
 * accordés juste après (`grant_starter_decks`, idempotent — un tutoriel
 * rejoué ne double rien). Un échec de l'octroi ne fait pas échouer la fin
 * du tutoriel : le rattrapage de `readOnboarding` le reprendra.
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
    const [startersGranted] = await Promise.all([grantStarterDecks(userId), completed ? syncAchievements(userId) : undefined]);
    return { ok: true, boosterGranted: Boolean(data?.booster_granted), startersGranted };
  } catch (error) {
    console.error("[finishTutorial] Échec :", error);
    return { ok: false, error: "Impossible d'enregistrer la fin du tutoriel." };
  }
}
