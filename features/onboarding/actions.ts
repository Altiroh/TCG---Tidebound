"use server";

import { revalidatePath } from "next/cache";
import { finishTutorial, readOnboarding, type OnboardingState } from "@/features/onboarding/onboardingService";
import { issueTutorialTicket, verifyTutorialTicket } from "@/features/onboarding/tutorialTicket";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Onboarding — Server Actions exposées au navigateur.
 *
 * Le joueur est TOUJOURS déduit de sa session, jamais reçu en paramètre :
 * sans quoi n'importe qui pourrait déclarer « tutoriel terminé » pour un
 * autre compte et lui faire créditer un booster.
 */

const SIGNED_OUT: OnboardingState = { tutorialStatus: "not_started", tutorialRewardClaimed: false, starterMissionDone: false, startersJustGranted: [] };

export interface OnboardingSummary extends OnboardingState {
  isSignedIn: boolean;
  /** `true` tant que le joueur n'a ni terminé ni passé le tutoriel : l'écran de proposition s'affiche. */
  needsTutorialChoice: boolean;
  /**
   * `true` si la PREMIÈRE MISSION est accomplie et ses trois starters
   * débloqués : l'écran peut l'annoncer. L'annonce ne se montre qu'UNE fois
   * par compte — c'est la préférence `STARTER_MISSION_SEEN_KEY`
   * (`features/collection/StarterMissionBanner.tsx`) qui le retient.
   */
  showStarterMission: boolean;
}

export async function fetchOnboarding(): Promise<OnboardingSummary> {
  try {
    const user = await getSessionUser();
    if (!user) return { ...SIGNED_OUT, isSignedIn: false, needsTutorialChoice: false, showStarterMission: false };

    const state = await readOnboarding(user.id);
    return {
      ...state,
      isSignedIn: true,
      needsTutorialChoice: state.tutorialStatus === "not_started",
      // La mission ne s'annonce qu'APRÈS le tutoriel (terminé ou passé), et
      // seulement quand ses starters sont réellement en base.
      showStarterMission: state.starterMissionDone,
    };
  } catch (error) {
    console.error("[fetchOnboarding] Lecture impossible :", error);
    return { ...SIGNED_OUT, isSignedIn: false, needsTutorialChoice: false, showStarterMission: false };
  }
}

export interface FinishTutorialActionResult {
  ok: boolean;
  error?: string;
  boosterGranted?: boolean;
  /** Starters NOUVELLEMENT débloqués par la première mission. */
  startersGranted?: string[];
}

/**
 * Lance la partie guidée : rend le ticket signé qu'exigera sa complétion
 * récompensée (`features/onboarding/tutorialTicket.ts`).
 */
export async function beginTutorial(): Promise<{ ok: boolean; ticket?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const ticket = issueTutorialTicket(user.id);
  return ticket ? { ok: true, ticket } : { ok: false };
}

/**
 * SIGNE DE VIE pendant la partie guidée (retour du 20/10/2026). La partie
 * est locale : de son lancement à sa fin, rien ne passait par le serveur,
 * donc rien ne rafraîchissait la session — un joueur parti faire autre
 * chose revenait déconnecté, et la fin du tutoriel (`completeTutorial`)
 * lui répondait « Connecte-toi ». Chaque appel traverse le middleware, qui
 * rafraîchit les cookies de session ; il ne fait rien d'autre.
 */
export async function keepTutorialSessionAlive(): Promise<{ ok: boolean }> {
  return { ok: (await getSessionUser()) !== null };
}

/**
 * Clôt le tutoriel. `completed: true` crédite le booster de récompense (une
 * seule fois) ; `completed: false` (« Passer ») n'accorde rien — c'est la
 * règle verrouillée de la spec, et elle vit côté serveur.
 *
 * Une complétion n'est acceptée qu'avec le ticket délivré au lancement de
 * la partie guidée (`beginTutorial`), et après sa durée minimale : sans
 * lui, un appel depuis la console suffisait à toucher le booster.
 */
export async function completeTutorial(completed: boolean, ticket?: string): Promise<FinishTutorialActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour commencer." };

  if (completed) {
    const verdict = verifyTutorialTicket(user.id, ticket);
    if (verdict !== "ok") {
      return {
        ok: false,
        error:
          verdict === "expired"
            ? "Cette partie guidée a expiré : relance le tutoriel pour recevoir ton booster."
            : "Le tutoriel doit être joué jusqu'au bout pour recevoir le booster.",
      };
    }
  }

  const result = await finishTutorial(user.id, completed);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/collection");
    revalidatePath("/boosters");
    revalidatePath("/decks");
    revalidatePath("/partie");
  }
  return result;
}
