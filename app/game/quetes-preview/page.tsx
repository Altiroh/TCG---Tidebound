import type { Metadata } from "next";
import { QuestJournalPreview } from "@/features/quests/QuestJournalPreview";

export const metadata: Metadata = {
  title: "Quêtes Preview · Tidebound",
  description: "Écran temporaire de réglage du journal de bord et des Traversées (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/quetes-preview`.
 *
 * Même parti pris que `/game/board-preview` : aucune lecture de session.
 * Quêtes et Traversées sont FABRIQUÉES, pour régler l'écran sans compte ni
 * migration. Les boutons restent câblés aux vraies Server Actions, qui
 * relisent l'état RÉEL du joueur connecté : ils ne peuvent rien réclamer
 * qu'il n'ait pas déjà gagné.
 */
export default function QuetesPreviewRoute() {
  return <QuestJournalPreview />;
}
