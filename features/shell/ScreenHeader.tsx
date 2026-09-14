"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";
import { NavigationTab } from "@/features/shell/NavigationTab";
import { ProgressionBadge } from "@/features/progression/ProgressionBadge";

export type ScreenSection = "collection" | "decks" | "market" | "boosters" | "quetes" | "partie";

/**
 * Les onglets du bandeau, dans l'ordre de lecture.
 *
 * « Jouer » n'en fait PAS partie : lancer une partie se fait depuis le menu
 * principal (le coffret), pas depuis un écran de gestion. L'onglet
 * correspondant a été retiré ; `/partie` reste atteignable et garde son
 * `active="partie"` (aucun onglet ne s'allume alors), mais le bandeau
 * propose à la place un retour explicite au menu.
 */
const TABS: Array<{ section: ScreenSection; label: string; href: string }> = [
  { section: "collection", label: "Collection", href: "/collection" },
  { section: "decks", label: "Decks", href: "/decks" },
  { section: "market", label: "Market", href: "/market" },
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
}

/**
 * Bandeau du haut, commun à tous les écrans hors plateau (`GameScreen`) :
 * fin, sans fond propre — il se fond dans le décor de l'écran. Le logo à
 * gauche et l'onglet « Menu » ramènent au menu principal ; les autres
 * onglets sont du texte, l'actif se lit à un filet cyan ; à droite, les
 * contrôles de l'écran puis la progression du joueur.
 */
export function ScreenHeader({ active, actions, onNavigate }: ScreenHeaderProps) {
  const router = useRouter();

  /** Un seul chemin pour tout déplacement du bandeau : l'écran peut le décliner. */
  function go(href: string) {
    if (onNavigate?.(href)) return;
    router.push(href);
  }

  return (
    <header className={styles.header}>
      {/* Le logo TIENT LIEU de bouton Retour : même destination que l'onglet
          « Menu », mais il porte l'identité au lieu d'un libellé de plus.
          C'est un vrai lien (clic milieu, ouverture dans un onglet), dont le
          clic gauche passe quand même par le filtre de l'écran. */}
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

      {/* Retour au menu principal, en toutes lettres : le logo seul ne se
          lit pas comme un bouton pour qui ne le sait pas déjà. */}
      <NavigationTab onClick={() => go("/")}>
        <span aria-hidden>←</span> Menu
      </NavigationTab>

      {TABS.map((tab) => (
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

      <span />

      {/* Actions de l'écran + progression dans UN seul groupe, donc une seule
          case de grille (`ProgressionBadge` ne rend rien hors connexion). */}
      <div className={styles.headerRight}>
        {actions}
        <ProgressionBadge />
      </div>
    </header>
  );
}
