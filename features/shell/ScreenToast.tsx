"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "@/features/shell/ScreenToast.module.css";

export type ScreenToastTone = "success" | "error";

export interface ScreenToastMessage {
  /** Change à chaque nouveau message : relance l'animation et le minuteur, même pour un texte identique. */
  id: number;
  tone: ScreenToastTone;
  text: ReactNode;
  /** Lien ou bouton optionnel, à droite du texte. */
  action?: ReactNode;
}

/** Temps d'affichage : assez pour lire une ligne, pas assez pour gêner. Une erreur reste un peu plus. */
const DURATION_MS: Record<ScreenToastTone, number> = { success: 3200, error: 5200 };

/**
 * Petite alerte éphémère des écrans hors plateau, sous le bandeau à
 * droite — juste sous le solde de Tides qu'un achat vient de modifier.
 *
 * Se referme seule ; le survol suspend la fermeture (on peut viser le lien
 * « Ouvrir → » sans qu'il disparaisse sous le curseur). Rendue hors du flux :
 * elle ne pousse jamais le contenu de l'écran, contrairement à l'ancien
 * bandeau de message en tête de page.
 */
export function ScreenToast({ message, onDismiss }: { message: ScreenToastMessage | null; onDismiss: () => void }) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  // Minuteur SUSPENDABLE : le temps restant est conservé au survol, pour
  // rester calé sur le filet de temps (dont l'animation CSS se met en pause).
  const timer = useRef<{ handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number }>({
    handle: null,
    remaining: 0,
    startedAt: 0,
  });

  const resume = () => {
    const state = timer.current;
    if (state.handle) clearTimeout(state.handle);
    state.startedAt = Date.now();
    state.handle = setTimeout(() => onDismissRef.current(), state.remaining);
  };
  const pause = () => {
    const state = timer.current;
    if (!state.handle) return;
    clearTimeout(state.handle);
    state.handle = null;
    state.remaining = Math.max(0, state.remaining - (Date.now() - state.startedAt));
  };

  const messageId = message?.id;
  const messageTone = message?.tone;
  useEffect(() => {
    if (messageId === undefined || !messageTone) return;
    const state = timer.current;
    state.remaining = DURATION_MS[messageTone];
    state.startedAt = Date.now();
    state.handle = setTimeout(() => onDismissRef.current(), state.remaining);
    return () => {
      if (state.handle) clearTimeout(state.handle);
      state.handle = null;
    };
  }, [messageId, messageTone]);

  if (!message) return null;

  return (
    <div className={styles.anchor}>
      <div
        key={message.id}
        className={styles.toast}
        data-tone={message.tone}
        role={message.tone === "error" ? "alert" : "status"}
        onMouseEnter={pause}
        onMouseLeave={resume}
      >
        <span className={styles.icon} aria-hidden>
          {message.tone === "success" ? (
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
              <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
              <path d="M12 7v6.5M12 17v.01" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className={styles.text}>{message.text}</span>
        {message.action && <span className={styles.action}>{message.action}</span>}
        <button type="button" className={styles.close} onClick={onDismiss} aria-label="Fermer">
          <svg viewBox="0 0 24 24" fill="none" width="10" height="10" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          </svg>
        </button>
        <span className={styles.timer} style={{ animationDuration: `${DURATION_MS[message.tone]}ms` }} aria-hidden />
      </div>
    </div>
  );
}
