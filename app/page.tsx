import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchOnboarding } from "@/features/onboarding/actions";
import { signOut } from "@/app/connexion/actions";
import { TideboundMenuChest } from "@/components/menu/TideboundMenuChest";
import { MenuAmbiance } from "@/components/menu/MenuAmbiance";
import { AuthGateModal } from "@/components/auth/AuthGateModal";
import { OptionsButton } from "@/features/settings/OptionsButton";

/**
 * Résout l'utilisateur connecté, sans jamais faire planter la page
 * d'accueil : une config Supabase manquante/invalide dégrade juste vers
 * "non connecté" (le menu marche toujours en local) plutôt qu'un 500 sur
 * la toute première page vue par n'importe quel visiteur.
 */
async function resolveViewer(): Promise<{ displayName: string | null; isSignedIn: boolean }> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { displayName: null, isSignedIn: false };

    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    return { displayName: profile?.display_name ?? user.email ?? null, isSignedIn: true };
  } catch (error) {
    console.error("[HomePage] Impossible de résoudre l'utilisateur connecté :", error);
    return { displayName: null, isSignedIn: false };
  }
}

export default async function HomePage() {
  const { displayName, isSignedIn } = await resolveViewer();

  // Première connexion : le tutoriel est PROPOSÉ avant tout le reste
  // (Notion « Progression joueur » §2, étape 2 du flow). Une seule fois —
  // dès que le joueur a choisi (fait ou passé), l'accueil reprend sa place.
  if (isSignedIn) {
    const onboarding = await fetchOnboarding();
    if (onboarding.needsTutorialChoice) redirect("/tutoriel");
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.webp)" }}
    >
      <div className="absolute inset-0 bg-board-background/35" />

      <AuthGateModal isSignedIn={isSignedIn} />
      <MenuAmbiance />
      <OptionsButton isSignedIn={isSignedIn} />

      <div className="relative z-10 w-full">
        <TideboundMenuChest />
      </div>

      {/*
       * ENTRÉE TEMPORAIRE DE DÉVELOPPEMENT — à retirer une fois le layout
       * du plateau validé et réinjecté dans le board réel.
       *
       * Volontairement posée en coin plutôt qu'ajoutée aux plaques du
       * coffret : les 3 plaques sont calées au pixel sur l'illustration
       * `menu_box_base.webp` (cf. `TideboundMenuChest`), une 4ᵉ n'aurait
       * nulle part où aller sans retoucher l'asset.
       *
       * Coin HAUT-GAUCHE : le coin haut-droit est pris par le bouton
       * Options (`right-4 top-4`, même z-index) — les deux s'y
       * recouvraient exactement.
       *
       * Ne lance aucune partie : `/game/board-preview` est un bac à sable
       * purement visuel (cf. `features/board-preview/BoardPreviewPage.tsx`).
       */}
      <Link
        href="/game/board-preview"
        className="absolute left-3 top-3 z-20 rounded-full border border-dashed border-board-accent/60 bg-black/45 px-3 py-1.5 text-xs text-board-accent backdrop-blur-sm transition hover:border-board-accent hover:text-white"
      >
        Board Preview <span className="text-slate-400">(temp)</span>
      </Link>

      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-xs text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {isSignedIn ? (
          <>
            Connecté en tant que <span className="text-slate-100">{displayName}</span> ·{" "}
            <Link href="/en-ligne" className="text-board-accent hover:underline">
              Jouer en ligne
            </Link>{" "}
            ·{" "}
            <form action={signOut} className="inline">
              <button type="submit" className="text-board-accent hover:underline">
                Se déconnecter
              </button>
            </form>
          </>
        ) : (
          <Link href="/connexion" className="text-board-accent hover:underline">
            Connexion (pour jouer en ligne)
          </Link>
        )}
      </div>
    </main>
  );
}
