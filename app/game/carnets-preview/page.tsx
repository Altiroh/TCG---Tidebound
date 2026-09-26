import type { Metadata } from "next";
import { Suspense } from "react";
import { ShelfPreview } from "@/features/collection/shelf/ShelfPreview";

export const metadata: Metadata = {
  title: "Carnets Preview · Tidebound",
  description: "Écran temporaire de réglage des favoris et des carnets de cartes (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/carnets-preview` — la Collection avec ses
 * cœurs et ses carnets ; `?vue=mur` pour le mur des carnets ; `?refus=1`
 * pour voir un refus du serveur. Aucune lecture de session, aucune
 * écriture : l'étagère est en mémoire.
 */
export default function CarnetsPreviewRoute() {
  return (
    <Suspense>
      <ShelfPreview />
    </Suspense>
  );
}
