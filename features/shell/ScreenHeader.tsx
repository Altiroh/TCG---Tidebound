"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";
import { NavigationTab } from "@/features/shell/NavigationTab";
import { ProgressionBadge } from "@/features/progression/ProgressionBadge";

interface ScreenHeaderProps {
  /** Section en cours — reçoit le filet turquoise et le halo. */
  active: "collection" | "decks" | "boosters" | "quetes";
  /**
   * `false` quand l'écran peint lui-même son décor de fond et que le
   * bandeau doit s'y fondre plutôt que d'empiler une seconde scène marine
   * (cas de la Collection). Défaut : `true` — les autres écrans gardent
   * leur panorama.
   */
  showPanorama?: boolean;
  /** Contrôles propres à l'écran, posés à droite de la navigation (recherche…). */
  actions?: ReactNode;
}

/**
 * Bandeau du haut, commun aux trois écrans — le panorama marin n'est pas
 * une vignette coincée entre des onglets : il occupe TOUT le fond du header
 * (`.panorama`, en `position:absolute`), et les libellés de navigation sont
 * posés par-dessus. Seul un voile dégradé (`.panoramaScrim`, opaque à
 * gauche, transparent à droite) garantit leur lisibilité — aucun libellé
 * n'a de boîte à lui.
 *
 * Les couches de la scène (étoiles, deux lignes de crêtes, eau, lumière du
 * phare) restent des zones responsives empilées : rien n'est positionné en
 * dur pour une résolution donnée.
 */
export function ScreenHeader({ active, showPanorama = true, actions }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <header className={styles.header}>
      {showPanorama && (
        <>
          <div className={styles.panorama} aria-hidden>
            <div className={styles.panoramaStars} />
            <div className={styles.panoramaBeacon} />
            <div className={styles.panoramaPeaksFar} />
            <div className={styles.panoramaPeaks} />
            <div className={styles.panoramaWater} />
          </div>
          <div className={styles.panoramaScrim} aria-hidden />
        </>
      )}

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

      <NavigationTab
        active={active === "boosters"}
        onClick={() => {
          if (active !== "boosters") router.push("/boosters");
        }}
      >
        Boosters
      </NavigationTab>

      <NavigationTab
        active={active === "quetes"}
        onClick={() => {
          if (active !== "quetes") router.push("/quetes");
        }}
      >
        Quêtes
      </NavigationTab>

      <span />

      {/*
       * Progression et emblème dans UN seul groupe, donc une seule case de
       * grille : `ProgressionBadge` ne rend rien quand personne n'est
       * connecté, et un enfant de grille en moins décalerait sinon l'emblème
       * hors de sa colonne.
       */}
      <div className={styles.headerRight}>
        {actions}
        <ProgressionBadge />

        {/* Emblème Tidebound : le laiton franc est réservé à ce genre de signe
            d'identité — pas de médaillon, pas de bordure, juste le glyphe
            précédé d'un court séparateur. */}
        <div className={styles.emblem} aria-hidden>
          <span className={styles.emblemRule} />
          <svg viewBox="0 0 24 24" height="100%" fill="none">
            <path
              d="M12 2v13m0 0l-3-3m3 3l3-3M6 8h12M8 5h8M12 15v3a4 4 0 0 1-4 4M12 18a4 4 0 0 0 4 4"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </header>
  );
}
