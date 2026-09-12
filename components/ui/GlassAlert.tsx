"use client";

import { useEffect, useRef } from "react";

export type AlertSeverity = "error" | "warning";

/** Temps d'affichage avant fermeture automatique. */
const AUTO_DISMISS_MS = 4_000;

const SEVERITY_STYLES: Record<AlertSeverity, { tint: string; glow: string; icon: string; label: string }> = {
  error: {
    tint: "bg-rose-500/25",
    glow: "bg-rose-300/35",
    icon: "text-rose-200",
    label: "Erreur",
  },
  warning: {
    tint: "bg-amber-400/25",
    glow: "bg-amber-200/35",
    icon: "text-amber-100",
    label: "Attention",
  },
};

interface GlassAlertProps {
  message: string | null;
  severity?: AlertSeverity;
  onDismiss: () => void;
}

/**
 * Alerte éphémère en haut à droite, en verre liquide teinté de la couleur
 * de sa gravité (rouge = erreur, ambre = avertissement) — même matière que
 * `ReactionPrompt` mais sans bordure. Se referme seule après
 * `AUTO_DISMISS_MS` ou au clic sur la croix ; le timer repart à chaque
 * nouveau message.
 */
export function GlassAlert({ message, severity = "error", onDismiss }: GlassAlertProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [message]);

  if (!message) return null;
  const style = SEVERITY_STYLES[severity];

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[90] flex max-w-sm justify-end">
      <div
        key={message}
        role={severity === "error" ? "alert" : "status"}
        className={`animate-glass-alert-in pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl py-3 pl-4 pr-10 text-left backdrop-blur-[28px] backdrop-brightness-110 backdrop-saturate-150 ${style.tint}`}
        style={{
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -10px 20px -10px rgba(255,255,255,0.08), 0 18px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Reflet "verre liquide" en haut à gauche, teinté comme l'alerte. */}
        <div className={`pointer-events-none absolute -left-6 -top-8 h-20 w-20 rounded-full blur-2xl ${style.glow}`} aria-hidden />

        <svg viewBox="0 0 24 24" fill="none" className={`relative mt-0.5 h-5 w-5 shrink-0 ${style.icon}`} aria-hidden>
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

        <div className="relative min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{style.label}</p>
          <p className="text-sm font-medium leading-snug text-white">{message}</p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer"
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white/60 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
