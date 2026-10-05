import type { Metadata } from "next";
import { Suspense } from "react";
import { LandePreview } from "@/features/match/LandePreview";

export const metadata: Metadata = {
  title: "Landes Preview · Tidebound",
  description: "Laboratoire des Landes : arrivée, scène et règles sur le vrai plateau (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/lande-preview` (`?lande=vallee-de-verre`
 * pour partir d'une Lande déjà en jeu).
 *
 * Même parti pris que `/game/board-preview` : aucune lecture de session,
 * aucune écriture — une partie locale, entièrement dans le navigateur.
 */
export default function LandePreviewRoute() {
  return (
    <Suspense>
      <LandePreview />
    </Suspense>
  );
}
