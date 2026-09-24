import type { Metadata } from "next";
import { FinPreview } from "@/features/match/FinPreview";

export const metadata: Metadata = {
  title: "Fin de partie Preview · Tidebound",
  description: "Écran temporaire de réglage de l'écran de fin de partie (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/fin-preview` (`?issue=defaite` pour la
 * défaite, `?quetes=0` pour la fiche seule).
 *
 * Même parti pris que `/game/board-preview` : aucune lecture de session,
 * aucune écriture. Gain et relevé de quêtes sont FABRIQUÉS — l'écran de fin
 * se règle sans avoir à terminer une vraie partie arbitrée.
 */
export default function FinPreviewRoute() {
  return <FinPreview />;
}
