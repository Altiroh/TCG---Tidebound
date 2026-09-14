import type { Metadata, Viewport } from "next";
import { BoardPreviewPage } from "@/features/board-preview/BoardPreviewPage";

export const metadata: Metadata = {
  title: "Board Preview · Tidebound",
  description: "Écran temporaire de réglage du layout du plateau (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * `viewportFit: "cover"` est indispensable pour que `env(safe-area-inset-*)`
 * renvoie autre chose que 0 sur un téléphone à encoche : sans lui, la
 * gestion de safe area de `BoardPreview.module.css` serait inopérante.
 *
 * Volontairement déclaré ICI et pas dans `app/layout.tsx` : passer tout le
 * site en `cover` changerait le rendu de tous les autres écrans, ce que
 * cette itération n'a pas à faire.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#05090f",
};

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
