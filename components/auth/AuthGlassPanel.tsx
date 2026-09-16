import type { ReactNode } from "react";
import game from "@/features/shell/GameScreen.module.css";
import dialog from "@/features/shell/Dialog.module.css";
import styles from "@/components/auth/AuthGlassPanel.module.css";

interface AuthGlassPanelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Panneau partagé par les écrans d'authentification (modal d'accueil, pages
 * /connexion, /inscription, …) : la MÊME fenêtre que le `Dialog` commun
 * (`Dialog.module.css` — navy opaque, filet cyan en tête), sans sa tête ni
 * ses actions : un seul langage de fenêtre dans tout le jeu hors plateau.
 */
export function AuthGlassPanel({ children, className = "" }: AuthGlassPanelProps) {
  return (
    <div className={`${dialog.dialog} ${styles.panel} ${className}`}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}

/** Champ partagé par tous les formulaires d'auth — `game.input` du design system. */
export const AUTH_INPUT_CLASS = `${game.input}`;
/** Le même champ, avec la place d'une icône à gauche (enveloppe) ou à droite (œil). */
export const AUTH_INPUT_ICON_LEFT_CLASS = `${game.inputIconLeft}`;
export const AUTH_INPUT_ICON_RIGHT_CLASS = `${game.inputIconRight}`;

/** Action primaire : le `game.primary` cyan, pleine largeur dans un formulaire. */
export const AUTH_PRIMARY_BUTTON_CLASS = `${game.primary} w-full`;

export const AUTH_SECONDARY_BUTTON_CLASS = `${game.secondary} w-full`;

/** Lien discret ("Retour", "Mot de passe oublié ?"...) — `game.link`, jamais un bleu SaaS. */
export const AUTH_LINK_CLASS = `${game.link}`;
