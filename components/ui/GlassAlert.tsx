"use client";

import { useEffect, useRef } from "react";
import styles from "@/components/ui/GlassAlert.module.css";
import { playActionRefused } from "@/lib/sound";

export type AlertSeverity = "error" | "warning";

/** Temps d'affichage avant fermeture automatique. */
const AUTO_DISMISS_MS = 4_000;

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  error: "Erreur",
  warning: "Attention",
};

interface GlassAlertProps {
  message: string | null;
  severity?: AlertSeverity;
  /** Croix : le joueur écarte l'alerte. */
  onDismiss: () => void;
  /**
   * Fin du délai d'affichage, si elle ne vaut PAS « écarter » : l'alerte de
   * Déraison s'efface, mais la confirmation qu'elle annonce reste armée.
   * Absent : le délai appelle `onDismiss`.
   */
  onExpire?: () => void;
}

/**
 * Alerte éphémère en haut à droite (en bas au centre sur un téléphone
 * couché, loin du Menu et de la rangée adverse), dans la matière des
 * alertes du design system (`ScreenToast`) : bleu nuit opaque, liseré rouge
 * (erreur) ou or (avertissement). Se referme seule après `AUTO_DISMISS_MS`
 * ou au clic sur la croix ; le timer repart à chaque nouveau message.
 */
export function GlassAlert({ message, severity = "error", onDismiss, onExpire }: GlassAlertProps) {
  const onTimeoutRef = useRef(onExpire ?? onDismiss);
  onTimeoutRef.current = onExpire ?? onDismiss;

  useEffect(() => {
    if (!message) return;
    // Une erreur, c'est un geste que le jeu refuse : elle s'entend, à chaque nouveau message.
    if (severity === "error") playActionRefused();
    const id = setTimeout(() => onTimeoutRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un son par MESSAGE, pas à chaque changement de gravité.
  }, [message]);

  if (!message) return null;

  return (
    <div className={styles.anchor}>
      <div key={message} role={severity === "error" ? "alert" : "status"} data-severity={severity} className={styles.alert}>
        <span className={styles.icon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
            {severity === "error" ? (
              <>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2} />
                <path d="M12 7.5v5.5M12 16.5v.01" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M12 3.5L21.5 20h-19L12 3.5z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
                <path d="M12 10v4.5M12 17.2v.01" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
              </>
            )}
          </svg>
        </span>

        <div style={{ minWidth: 0 }}>
          <p className={styles.label}>{SEVERITY_LABEL[severity]}</p>
          <p className={styles.message}>{message}</p>
        </div>

        <button type="button" onClick={onDismiss} aria-label="Fermer" className={styles.close}>
          <svg viewBox="0 0 24 24" fill="none" width="10" height="10" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
