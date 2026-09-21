import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchOnboarding } from "@/features/onboarding/actions";
import { TideboundMenuChest } from "@/components/menu/TideboundMenuChest";
import { TideboundMenuCarte } from "@/components/menu/TideboundMenuCarte";
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

/**
 * Lien d'aperçu, posé en bas de l'accueil : il fait passer d'un menu à
 * l'autre sans rien changer au reste. Discret — c'est un essai, pas une
 * destination.
 */
function MenuSwitch({ to, label }: { to: string; label: string }) {
  return (
    <Link
      href={to}
      className="absolute bottom-[calc(10px+var(--tb-safe-bottom))] left-1/2 z-40 -translate-x-1/2 rounded-full border border-[rgba(199,154,78,0.45)] bg-[rgba(6,16,26,0.72)] px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[#e0cfa4] backdrop-blur-sm transition-colors hover:border-[#c79a4e] hover:text-[#fdf0d0]"
    >
      {label}
    </Link>
  );
}

interface HomePageProps {
  /** `?menu=carte` ouvre la variante « carte marine » ; sans rien, le coffret. */
  searchParams?: { menu?: string; reperes?: string };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const isSignedIn = await resolveIsSignedIn();
  const variante = searchParams?.menu === "carte" ? "carte" : "coffre";

  // Première connexion : le tutoriel est PROPOSÉ avant tout le reste
  // (Notion « Progression joueur » §2, étape 2 du flow). Une seule fois —
  // dès que le joueur a choisi (fait ou passé), l'accueil reprend sa place.
  if (isSignedIn) {
    const onboarding = await fetchOnboarding();
    if (onboarding.needsTutorialChoice) redirect("/tutoriel");
  }

  // APERÇU — la table du navigateur, en cours d'évaluation. Le coffret
  // reste le menu par défaut tant que la variante n'est pas tranchée.
  if (variante === "carte") {
    return (
      <main className="relative h-[100dvh] overflow-hidden bg-[#050d16]">
        <AuthGateModal isSignedIn={isSignedIn} />
        <MenuAmbiance />
        {/* Ni onglets ni voile : la carte porte sa propre navigation, il ne
            reste que le compte et les options, à droite. */}
        <HomeBar isSignedIn={isSignedIn} nav="menu" />

        <TideboundMenuCarte marks={searchParams?.reperes === "1"} />

        <MenuSwitch to="/" label="Revenir au coffret" />
      </main>
    );
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

      <div className="relative z-10 w-full pt-[clamp(40px,5vh,64px)]">
        <TideboundMenuChest />
      </div>

      <MenuSwitch to="/?menu=carte" label="Essayer la carte marine" />
    </main>
  );
}
