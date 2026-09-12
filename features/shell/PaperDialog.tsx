"use client";

import { useEffect, type ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";

interface PaperDialogProps {
  title: string;
  children?: ReactNode;
  /** Boutons d'action, dans l'ordre de lecture (annuler d'abord, action engageante en dernier). */
  actions: ReactNode;
  onClose: () => void;
}

/**
 * Confirmation / question : une feuille posée sur la table, pas une fenêtre
 * de système. Papier, encre, un seul filet de laiton en tête (cf.
 * `.dialog`) — même famille que les menus (`.inkMenu`), en plus grand.
 *
 * Remplace `GameModal` sur ces écrans : le verre fumé sombre des tokens
 * `game-ui` appartient à une autre direction artistique (partie, auth) et
 * jurait au milieu du papier.
 */
export function PaperDialog({ title, children, actions, onClose }: PaperDialogProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(3, 10, 16, 0.66)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="presentation"
    >
      <div className={styles.dialog} role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.dialogTitle}>{title}</h2>
        {children}
        <div className={styles.dialogActions}>{actions}</div>
      </div>
    </div>
  );
}
