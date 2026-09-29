import type { Metadata } from "next";
import { JouerPreview } from "@/features/match/JouerPreview";

export const metadata: Metadata = {
  title: "Jouer Preview · Tidebound",
  description: "Écran temporaire de réglage de l'écran Jouer (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/jouer-preview` — l'écran JOUER hors
 * connexion, préconstruits ouverts. Même parti pris que
 * `/game/board-preview` : aucune lecture de session, aucune écriture.
 */
export default function JouerPreviewRoute() {
  return <JouerPreview />;
}
