import { redirect } from "next/navigation";
import { fetchOnboarding } from "@/features/onboarding/actions";
import { TutorialScreen } from "@/features/tutorial/TutorialScreen";

/**
 * Tutoriel — première connexion (Notion « Progression joueur » §2).
 *
 * Le tutoriel se REJOUE volontairement : un joueur qui l'a passé peut
 * revenir le faire et toucher son booster, ce que la spec n'interdit pas et
 * qui évite de punir définitivement un clic sur « Passer ». En revanche le
 * booster ne peut être crédité qu'une fois (`finish_tutorial`).
 *
 * Un visiteur non connecté n'a pas d'onboarding à jouer : il est renvoyé
 * vers la connexion, puisque la récompense se persiste sur un compte.
 */
export default async function TutorielPage() {
  const onboarding = await fetchOnboarding();
  if (!onboarding.isSignedIn) redirect("/connexion?redirect=/tutoriel");

  return <TutorialScreen />;
}
