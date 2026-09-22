"use server";

import { revalidatePath } from "next/cache";
import { finishTutorial, readOnboarding, type OnboardingState } from "@/features/onboarding/onboardingService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Onboarding — Server Actions exposées au navigateur.
 *
 * Le joueur est TOUJOURS déduit de sa session, jamais reçu en paramètre :
 * sans quoi n'importe qui pourrait déclarer « tutoriel terminé » pour un
 * autre compte et lui faire créditer un booster.
 */

const SIGNED_OUT: OnboardingState = { tutorialStatus: "not_started", tutorialRewardClaimed: false, freeDeckId: null };

export interface OnboardingSummary extends OnboardingState {
  isSignedIn: boolean;
  /** `true` tant que le joueur n'a ni terminé ni passé le tutoriel : l'écran de proposition s'affiche. */
  needsTutorialChoice: boolean;
  /** `true` si le joueur n'a pas encore pris son préconstruit gratuit (§3). */
  needsFirstDeck: boolean;
}

export async function fetchOnboarding(): Promise<OnboardingSummary> {
  try {
    const user = await getSessionUser();
    if (!user) return { ...SIGNED_OUT, isSignedIn: false, needsTutorialChoice: false, needsFirstDeck: false };

    const state = await readOnboarding(user.id);
    return {
      ...state,
      isSignedIn: true,
      needsTutorialChoice: state.tutorialStatus === "not_started",
      // Le préconstruit gratuit ne se propose qu'APRÈS le tutoriel (terminé ou
      // passé) : c'est l'étape 4 du flow de la spec, pas un choix parallèle.
      needsFirstDeck: state.tutorialStatus !== "not_started" && state.freeDeckId === null,
    };
  } catch (error) {
    console.error("[fetchOnboarding] Lecture impossible :", error);
    return { ...SIGNED_OUT, isSignedIn: false, needsTutorialChoice: false, needsFirstDeck: false };
  }
}

export interface FinishTutorialActionResult {
  ok: boolean;
  error?: string;
  boosterGranted?: boolean;
}

/**
 * Clôt le tutoriel. `completed: true` crédite le booster de récompense (une
 * seule fois) ; `completed: false` (« Passer ») n'accorde rien — c'est la
 * règle verrouillée de la spec, et elle vit côté serveur pour que le
 * navigateur ne puisse pas déclarer une complétion qu'il n'a pas jouée.
 */
export async function completeTutorial(completed: boolean): Promise<FinishTutorialActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour commencer." };

  const result = await finishTutorial(user.id, completed);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/collection");
    revalidatePath("/boosters");
  }
  return result;
}
