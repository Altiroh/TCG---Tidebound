import { redirect } from "next/navigation";
import { fetchOnboarding } from "@/features/onboarding/actions";
import { TideboundMenuCarte } from "@/components/menu/TideboundMenuCarte";
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

interface HomePageProps {
  /** `?reperes=1` trace la boîte de chaque calque de la scène — le gabarit de calage. */
  searchParams?: { reperes?: string };
}

/**
 * ACCUEIL — la table du navigateur (`TideboundMenuCarte`).
 *
 * Le coffret 3D qui tenait cette place a été retiré le 21/09/2026 : la
 * carte marine l'a remplacé après un temps d'essai côte à côte. Avec lui
 * sont partis `ChestButtons3D`, ses plaques en Three.js, et la dépendance
 * `three` — plus personne ne l'importait.
 */
export default async function HomePage({ searchParams }: HomePageProps) {
  const isSignedIn = await resolveIsSignedIn();

  // Première connexion : le tutoriel est PROPOSÉ avant tout le reste
  // (Notion « Progression joueur » §2, étape 2 du flow). Une seule fois —
  // dès que le joueur a choisi (fait ou passé), l'accueil reprend sa place.
  if (isSignedIn) {
    const onboarding = await fetchOnboarding();
    if (onboarding.needsTutorialChoice) redirect("/tutoriel");
  }

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[#050d16]">
      <AuthGateModal isSignedIn={isSignedIn} />
      {/* Ni onglets ni voile : la carte porte sa propre navigation, il ne
          reste que le compte et les options, à droite. */}
      <HomeBar isSignedIn={isSignedIn} nav="menu" />

      <TideboundMenuCarte marks={searchParams?.reperes === "1"} />
    </main>
  );
}
