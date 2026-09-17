import type { Metadata } from "next";
import { BoardPreviewPage } from "@/features/board-preview/BoardPreviewPage";

export const metadata: Metadata = {
  title: "Board Preview · Tidebound",
  description: "Écran temporaire de réglage du layout du plateau (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

// Pas de `viewport` propre : `viewportFit: "cover"` est déclaré une fois
// pour tout le site dans `app/layout.tsx`, ce qui rend `env(safe-area-inset-*)`
// utilisable ici comme ailleurs.

/**
 * Route de laboratoire : `/game/board-preview`.
 *
 * Aucune lecture de session, aucun client Supabase, aucun accès au moteur
 * de partie — la page se contente de monter le bac à sable visuel. Elle est
 * donc accessible connecté ou non, et ne peut rien casser côté données.
 */
export default function GameBoardPreviewRoute() {
  return <BoardPreviewPage />;
}
