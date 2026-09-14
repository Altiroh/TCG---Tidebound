"use client";

import type { ReactNode } from "react";
import { ScreenHeader, type ScreenHeaderProps } from "@/features/shell/ScreenHeader";
import shell from "@/features/shell/ScreenShell.module.css";
import styles from "@/features/shell/GameScreen.module.css";

interface GameScreenProps {
  active: ScreenHeaderProps["active"];
  /** Contrôles propres à l'écran dans le bandeau (recherche…). */
  actions?: ReactNode;
  /** Filtre de navigation du bandeau — cf. `ScreenHeaderProps.onNavigate`. */
  onNavigate?: ScreenHeaderProps["onNavigate"];
  /** `minimal` retire les onglets de collection — cf. `ScreenHeaderProps.nav`. */
  nav?: ScreenHeaderProps["nav"];
  /** Classe additionnelle posée sur la racine (grille propre à l'écran, tokens…). */
  className?: string;
  children: ReactNode;
}

/**
 * Coquille commune à tous les écrans hors plateau : décor maritime plein
 * écran + bandeau fin, sur lesquels chaque écran pose ses propres panneaux
 * (`styles.panel`) ou une zone de contenu défilante (`styles.content`).
 *
 * La racine compose `shell.screen` (palette `--cb-*`, grille, polices) et
 * `styles.screen` (décor, tokens de panneau, deux rangées seulement).
 */
export function GameScreen({ active, actions, onNavigate, nav, className, children }: GameScreenProps) {
  return (
    <div className={`${shell.screen} ${styles.screen}${className ? ` ${className}` : ""}`}>
      <ScreenHeader active={active} actions={actions} onNavigate={onNavigate} nav={nav} />
      {children}
    </div>
  );
}
