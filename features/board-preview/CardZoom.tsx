"use client";

import { useEffect } from "react";
import type { TideStateName } from "@/game";
import styles from "@/features/match/table/Table.module.css";
import { PreviewGameCard } from "@/features/board-preview/PreviewGameCard";
import type { TableCardModel } from "@/features/board-preview/previewFixtures";

interface CardZoomProps {
  card: TableCardModel | null;
  tideState: TideStateName;
  damage?: number;
  onClose: () => void;
}

/**
 * Carte affichée en grand, pour la lire : au doigt (appui long, ou toucher sur
 * une carte de main — cf. `useTableGestures`), ou d'un clic droit à la souris.
 * Sur un téléphone en paysage, une carte de plateau fait ~50 px de large :
 * son texte y est illisible.
 *
 * Se ferme au prochain APPUI (pas au clic) : le relâché du doigt qui vient
 * d'ouvrir la vue ne doit pas la refermer aussitôt. Échap aussi.
 */
export function CardZoom({ card, tideState, damage = 0, onClose }: CardZoomProps) {
  useEffect(() => {
    if (!card) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  if (!card) return null;

  return (
    <div
      className={styles.cardZoom}
      role="dialog"
      aria-modal
      aria-label="Carte agrandie"
      onPointerDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.cardZoomCard}>
        <PreviewGameCard card={card} tideState={tideState} showStatusBadges={false} damage={damage} />
      </div>
    </div>
  );
}
