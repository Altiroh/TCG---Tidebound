import type { Metadata } from "next";
import { CadrePreview } from "@/features/cadre-preview/CadrePreview";

export const metadata: Metadata = {
  title: "Nouveau cadre Preview · Tidebound",
  description: "Écran temporaire de test du nouveau cadre de carte (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/cadre-preview`. Le nouveau cadre à côté de
 * l'ancien, sans toucher au rendu des cartes ailleurs dans le jeu.
 */
export default function CadrePreviewRoute() {
  return <CadrePreview />;
}
