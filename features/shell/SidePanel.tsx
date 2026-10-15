"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "@/features/shell/SidePanel.module.css";

interface SidePanelProps {
  title: string;
  /** Icône peinte à gauche du titre (chemin d'un asset local). */
  iconSrc?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * PANNEAU LATÉRAL du bandeau (Courrier, Options) : il glisse depuis la
 * droite, l'écran reste deviné à gauche. Échap, le voile et la croix
 * ferment. Un `Dialog` ouvert DEDANS se ferme seul (le panneau ignore Échap
 * tant qu'un `[role="dialog"][data-variant]` est ouvert par-dessus).
 */
export function SidePanel({ title, iconSrc, onClose, children }: SidePanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Un bandeau ou une fenêtre posée par-dessus se ferme d'abord.
      if (document.querySelector('[role="dialog"][data-variant]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div className={styles.veil} onClick={onClose} role="presentation">
      <div className={styles.panel} role="dialog" aria-modal aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className={styles.head}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icône locale */}
          {iconSrc && <img className={styles.headIcon} src={iconSrc} alt="" draggable={false} />}
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className={styles.scroll}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
