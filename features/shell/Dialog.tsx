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
  /**
   * Masque la croix de fermeture. À réserver aux dialogues où renoncer doit
   * passer par un bouton explicite ; par défaut la croix est là, parce
   * qu'une fenêtre dont on ne voit pas comment sortir est une impasse.
   */
  hideCloseButton?: boolean;
}

/**
 * Dialogue commun à tous les écrans hors plateau : confirmation, question,
 * sélecteur. Remplace `PaperDialog` (papier) et `GameModal` (verre fumé) sur
 * ces écrans, pour qu'une fenêtre flottante ait la même tête partout.
 * Échap, clic sur le voile et la croix en tête ferment — trois sorties pour
 * la même porte, aucune à deviner.
 */
export function Dialog({ title, children, actions, onClose, width, hideCloseButton = false }: DialogProps) {
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
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {!hideCloseButton && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
              <svg viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        {children && <div className={styles.body}>{children}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
