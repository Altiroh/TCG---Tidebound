import type { Metadata } from "next";
import { BoostersScreen } from "@/features/boosters/BoostersScreen";
import { previewBoosterInventory } from "@/features/boosters/previewInventory";

export const metadata: Metadata = {
  title: "Boosters Preview · Tidebound",
  description: "Écran temporaire de réglage du rayon d'extensions (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/boosters-preview`.
 *
 * Même parti pris que `/game/board-preview` : aucune lecture de session,
 * aucun client Supabase, aucune écriture. L'écran « Mes boosters » est
 * monté sur un inventaire FABRIQUÉ (`previewInventory`), dont l'intérêt
 * principal est de contenir des extensions qu'on ne possède PAS — l'état
 * qu'on ne peut pas provoquer sur un vrai compte bien fourni.
 *
 * Le bouton « Ouvrir » y appelle la vraie Server Action et échouera faute
 * de session : c'est un laboratoire de LAYOUT, pas un bac à sable de jeu.
 */
export default function BoostersPreviewRoute() {
  return <BoostersScreen inventory={previewBoosterInventory()} />;
}
