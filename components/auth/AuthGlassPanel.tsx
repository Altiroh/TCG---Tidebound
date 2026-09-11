import type { ReactNode } from "react";

interface AuthGlassPanelProps {
  children: ReactNode;
  className?: string;
}

/** Panneau "verre liquide" partagé par les écrans d'authentification (modal d'accueil, pages /connexion, /inscription, ...), sur les tokens de la refonte (`app/globals.css`). */
export function AuthGlassPanel({ children, className = "" }: AuthGlassPanelProps) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-glass)] shadow-[var(--shadow-floating)] backdrop-blur-2xl ${className}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="relative p-6">{children}</div>
    </div>
  );
}

/** Classe d'input partagée par tous les formulaires d'auth — pas de boîte bordée façon formulaire, un simple soulignement laiton au focus. */
export const AUTH_INPUT_CLASS =
  "w-full border-b border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none transition duration-150 ease-out focus:border-[var(--accent)] focus:bg-white/[0.05]";

export const AUTH_PRIMARY_BUTTON_CLASS =
  "w-full rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#1a1410] transition duration-150 ease-out hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

export const AUTH_SECONDARY_BUTTON_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition duration-150 ease-out hover:border-[var(--accent)]/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

/** Lien discret ("Retour", "Mot de passe oublié ?"...) — jamais un bleu SaaS. */
export const AUTH_LINK_CLASS = "text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-hover)]";
