import type { ReactNode } from "react";

interface AuthGlassPanelProps {
  children: ReactNode;
  className?: string;
}

/** Panneau "verre liquide" partagé par les écrans d'authentification (modal d'accueil, pages /connexion, /inscription, ...) — même traitement (glow, dépoli, reflet) que `CardInfoPanel` dans le plateau. */
export function AuthGlassPanel({ children, className = "" }: AuthGlassPanelProps) {
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl ${className}`}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/25 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -left-10 top-0 h-full w-16 -rotate-12 bg-white/10 blur-md" />
      <div className="relative p-6">{children}</div>
    </div>
  );
}

/** Classe d'input partagée par tous les formulaires d'auth, même traitement verre dépoli que le reste de l'UI. */
export const AUTH_INPUT_CLASS =
  "w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-board-accent";

export const AUTH_PRIMARY_BUTTON_CLASS =
  "w-full rounded-md bg-board-accent px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const AUTH_SECONDARY_BUTTON_CLASS =
  "w-full rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 backdrop-blur-md transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50";
