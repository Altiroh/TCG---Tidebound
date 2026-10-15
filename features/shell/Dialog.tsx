"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "@/features/shell/Dialog.module.css";
import { ScrollArea } from "@/features/shell/ScrollArea";

export type DialogTone = "default" | "danger";

interface DialogProps {
  title: string;
  /** Une phrase sous le titre, qui précise l'enjeu (bleu grisé). */
  description?: ReactNode;
  children?: ReactNode;
  /** Boutons, dans l'ordre de lecture : annuler d'abord, action engageante en dernier. */
  actions?: ReactNode;
  onClose: () => void;
  /**
   * Largeur maximale d'une FENÊTRE — les sélecteurs visuels (illustrations,
   * navires, options…) en demandent une. Sans largeur, le dialogue est un
   * avertissement et prend la forme d'un BANDEAU (cf. `variant`).
   */
  width?: number;
  /**
   * `banner` (défaut sans `width`) : un grand bandeau noir d'un bord à
   * l'autre de l'écran, l'avertissement au milieu — le titre sur la
   * première ligne, la description sur la deuxième, les boutons sur la
   * troisième (retour du 13/10/2026). `panel` (défaut avec `width`) : la
   * fenêtre, pour ce qui se parcourt ou se choisit.
   */
  variant?: "banner" | "panel";
  /**
   * `danger` : suppression ou perte — le filet de tête et le halo passent au
   * rouge désaturé. Le bouton engageant reste `game.danger`.
   */
  tone?: DialogTone;
  /**
   * Masque la croix de fermeture. À réserver aux dialogues où renoncer doit
   * passer par un bouton explicite ; par défaut la croix est là, parce
   * qu'une fenêtre dont on ne voit pas comment sortir est une impasse.
   */
  hideCloseButton?: boolean;
}

/**
 * Dialogue commun à tous les écrans hors plateau : confirmation,
 * suppression, achat, renommage, erreur, détail, prévisualisation. Une seule
 * fenêtre pour tout le jeu, pour qu'elle ait la même tête partout.
 * Échap, clic sur le voile et la croix en tête ferment — trois sorties pour
 * la même porte, aucune à deviner.
 */
export function Dialog({ title, description, children, actions, onClose, width, variant, tone = "default", hideCloseButton = false }: DialogProps) {
  const shape = variant ?? (width ? "panel" : "banner");
  // Porté sur `body` (15/10/2026) : ouvert depuis un panneau latéral, le
  // bandeau prenait la boîte du panneau pour repère et s'y écrasait.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className={styles.overlay} data-variant={shape} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        data-variant={shape}
        data-tone={tone}
        style={width ? ({ "--dialog-width": `${width}px` } as React.CSSProperties) : undefined}
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {!hideCloseButton && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
              <svg viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        {children && (
          <ScrollArea className={styles.bodyArea} contentClassName={styles.body}>
            {children}
          </ScrollArea>
        )}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
