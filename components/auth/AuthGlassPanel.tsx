import type { ReactNode } from "react";

interface AuthGlassPanelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Panneau partagé par les écrans d'authentification (modal d'accueil, pages
 * /connexion, /inscription, …) : le même panneau bleu nuit translucide, au
 * filet cyan en tête, que les panneaux de `GameScreen` — un seul langage
 * de fenêtre dans tout le jeu hors plateau.
 */
export function AuthGlassPanel({ children, className = "" }: AuthGlassPanelProps) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[14px] border border-[rgba(130,178,210,0.3)] bg-[rgba(6,14,24,0.9)] text-[#dce8f2] shadow-[0_30px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl ${className}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#58c8d8] to-transparent" />
      <div className="relative p-6">{children}</div>
    </div>
  );
}

/** Champ partagé par tous les formulaires d'auth — même dessin que `GameScreen.module.css` `.input` : fond sombre, filet fin, focus cyan. */
export const AUTH_INPUT_CLASS =
  "w-full rounded-[9px] border border-[rgba(130,178,210,0.16)] bg-[rgba(4,10,17,0.6)] px-3 py-2 text-sm text-[#dce8f2] placeholder:text-[rgba(190,210,228,0.38)] outline-none transition duration-150 ease-out hover:border-[rgba(130,178,210,0.3)] focus:border-[#58c8d8] focus:shadow-[0_0_0_3px_rgba(88,200,216,0.14)]";

/** Action primaire : cyan teinté, comme `.primary` de la coquille. */
export const AUTH_PRIMARY_BUTTON_CLASS =
  "w-full rounded-[9px] border border-[rgba(88,200,216,0.55)] bg-gradient-to-b from-[rgba(88,200,216,0.22)] to-[rgba(88,200,216,0.12)] px-4 py-2 text-sm font-semibold tracking-wide text-[#eaf8fb] transition duration-150 ease-out hover:border-[#58c8d8] hover:from-[rgba(88,200,216,0.32)] hover:to-[rgba(88,200,216,0.18)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

export const AUTH_SECONDARY_BUTTON_CLASS =
  "w-full rounded-[9px] border border-[rgba(130,178,210,0.3)] bg-[rgba(8,18,30,0.5)] px-4 py-2 text-sm font-semibold tracking-wide text-[#dce8f2] transition duration-150 ease-out hover:border-[rgba(88,200,216,0.6)] hover:bg-[rgba(88,200,216,0.1)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

/** Lien discret ("Retour", "Mot de passe oublié ?"...) — jamais un bleu SaaS. */
export const AUTH_LINK_CLASS = "text-[rgba(190,210,228,0.6)] transition-colors hover:text-[#58c8d8]";
