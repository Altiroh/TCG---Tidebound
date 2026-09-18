import { redirect } from "next/navigation";
import { fetchOnboarding } from "@/features/onboarding/actions";
import { TideboundMenuChest } from "@/components/menu/TideboundMenuChest";
import { MenuAmbiance } from "@/components/menu/MenuAmbiance";
import { AuthGateModal } from "@/components/auth/AuthGateModal";
import { HomeBar } from "@/features/shell/HomeBar";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Résout l'utilisateur connecté, sans jamais faire planter la page
 * d'accueil : une config Supabase manquante/invalide dégrade juste vers
 * "non connecté" (le menu marche toujours en local) plutôt qu'un 500 sur
 * la toute première page vue par n'importe quel visiteur.
 *
 * Le pseudo n'est plus lu ici : il s'affiche dans le bandeau, qui a sa
 * propre lecture — une requête `profiles` de moins à chaque retour au menu.
 */
async function resolveIsSignedIn(): Promise<boolean> {
  try {
    return (await getSessionUser()) !== null;
  } catch (error) {
    console.error("[HomePage] Impossible de résoudre l'utilisateur connecté :", error);
    return false;
  }
}

export default async function HomePage() {
  const isSignedIn = await resolveIsSignedIn();

  // Première connexion : le tutoriel est PROPOSÉ avant tout le reste
  // (Notion « Progression joueur » §2, étape 2 du flow). Une seule fois —
  // dès que le joueur a choisi (fait ou passé), l'accueil reprend sa place.
  if (isSignedIn) {
    const onboarding = await fetchOnboarding();
    if (onboarding.needsTutorialChoice) redirect("/tutoriel");
  }

  return (
    <main
      className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/assets/menu/background/fixed.webp)" }}
    >
      <div className="absolute inset-0 bg-board-background/35" />

      <AuthGateModal isSignedIn={isSignedIn} />
      <MenuAmbiance />
      {/* Le bandeau de tous les écrans : onglets, compte, quêtes, options.
          La déconnexion vit au pied du Profil. */}
      <HomeBar isSignedIn={isSignedIn} />

      <div className="relative z-10 w-full pt-[clamp(40px,5dvh,64px)]">
        <TideboundMenuChest />
      </div>
    </main>
  );
}
