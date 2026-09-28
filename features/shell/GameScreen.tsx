"use client";

import { useEffect, type ReactNode } from "react";
import { ScreenHeader, type ScreenHeaderProps, type ScreenSection } from "@/features/shell/ScreenHeader";
import shell from "@/features/shell/ScreenShell.module.css";
import styles from "@/features/shell/GameScreen.module.css";

/**
 * LE DÉCOR d'un écran, choisi par la COQUILLE et non par l'écran : l'écran
 * de chargement d'une route (`ScreenLoading`) porte ainsi déjà celui de la
 * page qu'il annonce. Chaque écran posait le sien dans sa propre feuille —
 * le chargement montrait le port de nuit par défaut, puis la page arrivait
 * sur sa table : un fond « noir » qui changeait à chaque onglet (retour du
 * 27/09/2026).
 *
 *   - `port`   : le port de nuit (`collection/background-3`), par défaut ;
 *   - `livre`  : la table au livre de bord (Collection, Decks, Éditeur) ;
 *   - `carte`  : la table à la carte marine (Collectables, Boosters) ;
 *   - `market` : l'échoppe du Market ;
 *   - `cabine` : la cabine du Profil.
 */
export type ScreenBackdrop = "port" | "livre" | "carte" | "market" | "cabine" | "table";

const BACKDROP_OF_SECTION: Partial<Record<ScreenSection, ScreenBackdrop>> = {
  collection: "livre",
  decks: "livre",
  collectables: "carte",
  boosters: "carte",
  market: "market",
};

/**
 * Décors des onglets du bandeau, chargés d'avance une fois la page au
 * repos : passer d'un onglet à l'autre ne montre jamais le fond nu le temps
 * que l'image arrive.
 */
const PRELOADED_BACKDROPS = ["/assets/decks/liste/fond.webp", "/assets/ui/fonds/carte-marine.webp"];
let backdropsPreloaded = false;

interface GameScreenProps {
  active: ScreenHeaderProps["active"];
  /** Décor de l'écran ; à défaut, celui de sa section (`BACKDROP_OF_SECTION`), sinon le port. */
  backdrop?: ScreenBackdrop;
  /** Contrôles propres à l'écran dans le bandeau (recherche…). */
  actions?: ReactNode;
  /** Filtre de navigation du bandeau — cf. `ScreenHeaderProps.onNavigate`. */
  onNavigate?: ScreenHeaderProps["onNavigate"];
  /** `minimal` retire les onglets de collection — cf. `ScreenHeaderProps.nav`. */
  nav?: ScreenHeaderProps["nav"];
  /** Onglets propres à l'écran — cf. `ScreenHeaderProps.tabs`. */
  tabs?: ScreenHeaderProps["tabs"];
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
export function GameScreen({ active, backdrop, actions, onNavigate, nav, tabs, className, children }: GameScreenProps) {
  useEffect(() => {
    if (backdropsPreloaded) return undefined;
    backdropsPreloaded = true;
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(
      () => {
        for (const src of PRELOADED_BACKDROPS) {
          const image = new Image();
          image.decoding = "async";
          image.src = src;
        }
      },
      { timeout: 4000 }
    );
    return () => cancel(id);
  }, []);

  const decor = backdrop ?? (active ? BACKDROP_OF_SECTION[active] : undefined) ?? "port";
  return (
    <div className={`${shell.screen} ${styles.screen}${className ? ` ${className}` : ""}`} data-backdrop={decor}>
      <ScreenHeader active={active} actions={actions} onNavigate={onNavigate} nav={nav} tabs={tabs} />
      {children}
    </div>
  );
}
