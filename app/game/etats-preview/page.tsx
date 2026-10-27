import type { Metadata } from "next";
import { EtatsLab } from "@/features/match/EtatsLab";

export const metadata: Metadata = {
  title: "États Preview · Tidebound",
  description: "Le vrai plateau sur un état fabriqué : badges d'état, aperçus, zoom (développement).",
  robots: { index: false, follow: false },
};

/** Route de laboratoire : `/game/etats-preview`. Aucune base : la partie est locale. */
export default function EtatsPreviewRoute() {
  return <EtatsLab />;
}
