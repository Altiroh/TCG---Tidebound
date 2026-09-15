"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { finishTutorial, readOnboarding, type OnboardingState } from "@/features/onboarding/onboardingService";

/**
 * Onboarding — Server Actions exposées au navigateur.
 *
 * Le joueur est TOUJOURS déduit de sa session, jamais reçu en paramètre :
 * sans quoi n'importe qui pourrait déclarer « tutoriel terminé » pour un
 * autre compte et lui faire créditer un booster.
 */

const SIGNED_OUT: OnboardingState = { tutorialStatus: "not_started", tutorialRewardClaimed: false, borrowedDeckId: null };

export interface OnboardingSummary extends OnboardingState {
  isSignedIn: boolean;
  /** `true` tant que le joueur n'a ni terminé ni passé le tutoriel : l'écran de proposition s'affiche. */
  needsTutorialChoice: boolean;
  /** `true` si le joueur n'a pas encore choisi son deck d'emprunt (§3). */
  needsBorrowedDeck: boolean;
}

export async function fetchOnboarding(): Promise<OnboardingSummary> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ...SIGNED_OUT, isSignedIn: false, needsTutorialChoice: false, needsBorrowedDeck: false };

    const state = await readOnboarding(user.id);
    return {
      ...state,
      isSignedIn: true,
      needsTutorialChoice: state.tutorialStatus === "not_started",
      // Le deck d'emprunt ne se propose qu'APRÈS le tutoriel (terminé ou
      // passé) : c'est l'étape 4 du flow de la spec, pas un choix parallèle.
      needsBorrowedDeck: state.tutorialStatus !== "not_started" && state.borrowedDeckId === null,
    };
  } catch (error) {
    console.error("[fetchOnboarding] Lecture impossible :", error);
    return { ...SIGNED_OUT, isSignedIn: false, needsTutorialChoice: false, needsBorrowedDeck: false };
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
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour commencer." };

  const result = await finishTutorial(user.id, completed);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/collection");
    revalidatePath("/boosters");
  }
  return result;
}
