"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";
import { NavigationTab } from "@/features/shell/NavigationTab";
import { ProgressionBadge } from "@/features/progression/ProgressionBadge";

export interface ScreenHeaderProps {
  /** Section en cours — reçoit le filet turquoise et le halo. `null` : aucun onglet actif (authentification). */
  active: "collection" | "decks" | "boosters" | "quetes" | "partie" | null;
  /** Contrôles propres à l'écran, posés à droite de la navigation (recherche…). */
  actions?: ReactNode;
}

/**
 * Bandeau du haut, commun à tous les écrans hors plateau (`GameScreen`) :
 * fin, sans fond propre — il se fond dans le décor de l'écran. Le logo à
 * gauche tient lieu de retour au menu ; les onglets sont du texte, l'actif
 * se lit à un filet cyan ; à droite, les contrôles de l'écran puis la
 * progression du joueur.
 */
export function ScreenHeader({ active, actions }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <header className={styles.header}>
      {/* Le logo TIENT LIEU de bouton Retour : même destination, mais il
          porte l'identité au lieu d'un libellé de plus. */}
      <Link href="/" className={styles.brand} aria-label="Retour au menu">
        <Image
          src="/assets/menu/logo/tidebound-logo.webp"
          alt="Tidebound"
          width={1600}
          height={631}
          priority
          className={styles.brandLogo}
        />
      </Link>

      <NavigationTab
        active={active === "collection"}
        onClick={() => {
          if (active !== "collection") router.push("/collection");
        }}
      >
        Collection
      </NavigationTab>

      <NavigationTab
        active={active === "decks"}
        onClick={() => {
          if (active !== "decks") router.push("/decks");
        }}
      >
        Decks
      </NavigationTab>

      {/* Market = l'écran des boosters (`/boosters`) : un seul onglet, un seul écran. */}
      <NavigationTab
        active={active === "boosters"}
        onClick={() => {
          if (active !== "boosters") router.push("/boosters");
        }}
      >
        Market
      </NavigationTab>

      <NavigationTab
        active={active === "quetes"}
        onClick={() => {
          if (active !== "quetes") router.push("/quetes");
        }}
      >
        Quêtes
      </NavigationTab>

      <NavigationTab
        active={active === "partie"}
        onClick={() => {
          if (active !== "partie") router.push("/partie");
        }}
      >
        Jouer
      </NavigationTab>

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
