"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";
import { NavigationTab } from "@/features/shell/NavigationTab";
import { HeaderPlayer } from "@/features/shell/HeaderPlayer";
import { playButtonClick } from "@/lib/sound";

export type ScreenSection = "collection" | "decks" | "market" | "boosters" | "quetes" | "partie";

/**
 * Les onglets de la COLLECTION, dans l'ordre de lecture.
 *
 * Ce bandeau appartient à la collection du joueur — ce qu'il possède et ce
 * qu'il en fait — et à rien d'autre. Deux destinations en sont donc
 * volontairement absentes :
 *
 *   - JOUER (`/partie`) : lancer une partie est un autre moment du jeu, on
 *     y va depuis le menu principal ;
 *   - MARKET (`/market`) : dépenser des Tides est une boutique, pas une
 *     vitrine de sa propre collection.
 *
 * Les deux se rejoignent depuis le menu principal (le coffret) et depuis
 * les liens croisés du bas de page ; ils se rendent avec `nav="minimal"`,
 * dont le bandeau n'a plus que le retour au menu et le logo.
 */
const TABS: Array<{ section: ScreenSection; label: string; href: string }> = [
  // « Cartes » plutôt que « Collection » : la collection du joueur, c'est
  // aussi ses decks et ses boosters. Cet onglet-ci ne montre que les
  // cartes, autant que son nom le dise.
  { section: "collection", label: "Cartes", href: "/collection" },
  { section: "decks", label: "Decks", href: "/decks" },
  { section: "boosters", label: "Mes boosters", href: "/boosters" },
  { section: "quetes", label: "Quêtes", href: "/quetes" },
];

export interface ScreenHeaderProps {
  /** Section en cours — reçoit le filet turquoise et le halo. `null` : aucun onglet actif (authentification). */
  active: ScreenSection | null;
  /** Contrôles propres à l'écran, posés à droite de la navigation (recherche…). */
  actions?: ReactNode;
  /**
   * Filtre de navigation de l'écran : rendre `true` pour DÉCLINER le
   * déplacement (l'écran s'en charge lui-même — typiquement un dialogue de
   * modifications non sauvegardées). Toute la navigation du bandeau passe
   * par là, logo compris.
   */
  onNavigate?: (href: string) => boolean;
  /**
   * `collection` (défaut) : les onglets de la collection. `minimal` : le
   * retour au menu et le logo, rien d'autre — pour les écrans qui ne font
   * pas partie de la collection (Jouer, Market).
   */
  nav?: "collection" | "minimal";
}

/**
 * Bandeau du haut, commun à tous les écrans hors plateau (`GameScreen`) :
 * fin, sans fond propre — il se fond dans le décor de l'écran.
 *
 * Trois zones : la flèche de retour au menu tout à gauche puis les onglets
 * ; les contrôles de l'écran et la progression tout à droite ; et le logo
 * AU CENTRE, posé hors du flux pour rester centré sur l'écran quel que
 * soit le poids des deux côtés.
 */
export function ScreenHeader({ active, actions, onNavigate, nav = "collection" }: ScreenHeaderProps) {
  const router = useRouter();
  const tabs = nav === "minimal" ? [] : TABS;

  /** Un seul chemin pour tout déplacement du bandeau : l'écran peut le décliner. */
  function go(href: string) {
    if (onNavigate?.(href)) return;
    router.push(href);
  }

  return (
    <header className={styles.header} data-nav={nav}>
      {/* Retour au menu : une flèche, sans libellé. Le geste est assez
          courant dans un client de jeu pour se passer du mot, et le mot
          prenait la place d'un onglet. */}
      <button
        type="button"
        className={styles.backButton}
        aria-label="Retour au menu"
        title="Retour au menu"
        onClick={() => {
          playButtonClick();
          go("/");
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
          <path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {tabs.map((tab) => (
        <NavigationTab
          key={tab.section}
          active={active === tab.section}
          onClick={() => {
            if (active !== tab.section) go(tab.href);
          }}
        >
          {tab.label}
        </NavigationTab>
      ))}

      <span className={styles.headerSpring} />

      {/* Actions de l'écran + bloc joueur (pseudo, niveau, Tides, Options)
          dans UN seul groupe, donc une seule case de grille. */}
      <div className={styles.headerRight}>
        {actions}
        <HeaderPlayer />
      </div>

      {/*
        Le logo est centré sur l'ÉCRAN, pas entre ses deux voisins : il est
        donc hors du flux de la grille (`position: absolute`), sinon la
        largeur des onglets à gauche et de la recherche à droite le
        décentrerait d'un écran à l'autre. Il reste un lien vers le menu —
        le conteneur laisse passer les clics, le lien seul les reçoit.
      */}
      <div className={styles.brandSlot}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Retour au menu"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            if (onNavigate?.("/")) event.preventDefault();
          }}
        >
          <Image
            src="/assets/menu/logo/tidebound-logo.webp"
            alt="Tidebound"
            width={1600}
            height={631}
            priority
            className={styles.brandLogo}
          />
        </Link>
      </div>
    </header>
  );
}
