import type { Metadata } from "next";
import { TideboundMenuCarte } from "@/components/menu/TideboundMenuCarte";

export const metadata: Metadata = {
  title: "Menu Preview · Tidebound",
  description: "Écran temporaire de calage du menu « carte marine » (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/menu-preview` — la table du menu SEULE,
 * sans bandeau ni session (l'accueil `/`, lui, renvoie à la connexion).
 * `?reperes=1` trace la boîte de chaque calque, comme sur l'accueil.
 * Souffler la bougie n'accorde rien ici : pas de joueur connecté.
 */
export default function MenuPreviewRoute({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[#050d16]">
      <TideboundMenuCarte marks={searchParams.reperes === "1"} />
    </main>
  );
}
