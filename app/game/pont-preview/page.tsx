import type { Metadata } from "next";
import { BoardPreviewPage } from "@/features/board-preview/BoardPreviewPage";

export const metadata: Metadata = {
  title: "Pont Preview · Tidebound",
  description: "Laboratoire du plateau « Le Pont du Capitaine » (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/pont-preview`. Le même bac à sable que
 * `/game/board-preview`, sur le décor du Pont du Capitaine (essai du
 * 07/10/2026). Aucune lecture de session, aucune base, aucune partie.
 */
export default function GamePontPreviewRoute() {
  return <BoardPreviewPage decor="pont" />;
}
