"use client";

import { useEffect, type ReactNode } from "react";
import styles from "@/features/shell/Dialog.module.css";

interface DialogProps {
  title: string;
  children?: ReactNode;
  /** Boutons, dans l'ordre de lecture : annuler d'abord, action engageante en dernier. */
  actions?: ReactNode;
  onClose: () => void;
  /** Largeur maximale (défaut 440px) — les sélecteurs visuels en demandent plus. */
  width?: number;
}

/**
 * Dialogue commun à tous les écrans hors plateau : confirmation, question,
 * sélecteur. Remplace `PaperDialog` (papier) et `GameModal` (verre fumé) sur
 * ces écrans, pour qu'une fenêtre flottante ait la même tête partout.
 * Échap et clic sur le voile ferment.
 */
export function Dialog({ title, children, actions, onClose, width }: DialogProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        style={width ? ({ "--dialog-width": `${width}px` } as React.CSSProperties) : undefined}
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        {children && <div className={styles.body}>{children}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
