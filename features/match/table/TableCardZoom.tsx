"use client";

import { useEffect, type ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";

interface TableCardZoomProps {
  /** La carte, rendue par le plateau lui-même (`renderFace`) — jamais une seconde définition. */
  children: ReactNode;
  /** Ouvre la fiche détaillée (dégâts, modificateurs, Équipements) depuis l'agrandissement. */
  onDetail: () => void;
  onClose: () => void;
}

/**
 * LA CARTE, EN GRAND, PAR-DESSUS LE PLATEAU.
 *
 * Sur un téléphone couché, une carte de plateau fait ~50 px de large :
 * son texte de règles y est une ligne de fourmis. L'appui long la pose
 * donc ici, à pleine hauteur d'écran, le temps de la lire — et on revient
 * au plateau d'un toucher. C'est le geste courant ; la FICHE détaillée
 * (`features/match/CardDetailModal`), qui déplie l'état vivant de la
 * carte, reste à un bouton d'ici.
 *
 * Jumelle de `features/board-preview/CardZoom` — même calque, mêmes
 * classes — à ceci près qu'elle ne connaît pas la carte : le plateau la
 * lui passe déjà rendue, avec sa Marée, ses dégâts et ses auras.
 *
 * Se ferme au prochain APPUI et non au clic : le relâché du doigt qui
 * vient d'ouvrir la vue ne doit pas la refermer aussitôt.
 */
export function TableCardZoom({ children, onDetail, onClose }: TableCardZoomProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.cardZoom}
      role="dialog"
      aria-modal
      aria-label="Carte agrandie"
      onPointerDown={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className={styles.cardZoomCard}>{children}</div>

      {/* Le seul contrôle du calque : tout le reste referme. */}
      <button
        type="button"
        className={styles.cardZoomDetail}
        onPointerDown={(event) => {
          event.stopPropagation();
          onDetail();
        }}
      >
        Fiche détaillée
      </button>
    </div>
  );
}
