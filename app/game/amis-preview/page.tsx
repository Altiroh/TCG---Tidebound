import type { Metadata } from "next";
import { FriendsLab } from "@/features/friends/FriendsLab";

export const metadata: Metadata = {
  title: "Amis Preview · Tidebound",
  description: "Laboratoire du volet Amis : panneau, fiches, bande de défi et salon (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/amis-preview`. Le volet Amis sur des
 * données FACTICES — panneau (chargé ou en chargement), fiche d'un ami, sa
 * propre fiche, la bande de défi, et le salon dans chacun de ses états (défi
 * envoyé, refusé, l'un prêt, l'autre prêt, compte à rebours). Aucune
 * lecture ni écriture en base : de quoi tout vérifier avant d'ouvrir le
 * volet social à tous (`socialLock.ts`, `friendlyMatchLock.ts`).
 */
export default function AmisPreviewRoute() {
  return <FriendsLab />;
}
