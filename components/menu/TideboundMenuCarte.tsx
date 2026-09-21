"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { CSSProperties } from "react";
import styles from "@/components/menu/MenuCarte.module.css";
import { playButtonClick } from "@/lib/sound";

/**
 * MENU « CARTE MARINE » — variante d'accueil en cours d'évaluation.
 *
 * Une table de navigateur vue de haut : la carte punaisée, et trois
 * parchemins qui mènent aux trois destinations du jeu. Tout tient dans UNE
 * illustration ; ce composant ne fait qu'y poser le logo et les zones
 * cliquables, en pourcentages de l'image.
 *
 * L'ancien menu (le coffret, `TideboundMenuChest`) reste celui par défaut :
 * celui-ci s'ouvre depuis le bouton d'aperçu de l'accueil (`?menu=carte`),
 * le temps de trancher.
 */

/** Les assets de ce menu, nommés une fois. */
export const MENU_CARTE_ASSETS = {
  plateau: "/assets/menu/carte/plateau.webp",
  logo: "/assets/menu/logo/tidebound-logo.webp",
} as const;

interface CarteSlot {
  id: string;
  label: string;
  href: Route | string;
  /**
   * Gabarit du parchemin PEINT, en pourcentages de l'illustration
   * (1672 × 941) : centre, taille, inclinaison. Mesuré sur l'image —
   * `?menu=carte&reperes=1` trace les contours pour recaler.
   */
  rect: { x: string; y: string; w: string; h: string; rot: string };
}

const SLOTS: CarteSlot[] = [
  // « Cartes » dans le bandeau, « Collection » sur l'illustration : c'est
  // le catalogue de cartes, pas l'ensemble de la collection du joueur.
  {
    id: "collection",
    label: "Collection",
    href: "/collection",
    rect: { x: "25.3%", y: "59.8%", w: "16.5%", h: "29.2%", rot: "-7.7deg" },
  },
  {
    id: "jouer",
    label: "Jouer",
    href: "/partie",
    rect: { x: "49.4%", y: "61.6%", w: "26.1%", h: "31.2%", rot: "-4.9deg" },
  },
  // Le Market, c'est la BOUTIQUE (achat en Tides) ; la réserve de boosters
  // et leur ouverture sont un écran voisin, atteignable depuis le bandeau.
  {
    id: "market",
    label: "Market",
    href: "/market",
    rect: { x: "75.4%", y: "62.9%", w: "16.8%", h: "29.6%", rot: "-4.4deg" },
  },
];

/** `true` trace le contour des zones : le gabarit de calage. */
export function TideboundMenuCarte({ marks = false }: { marks?: boolean }) {
  return (
    <div
      className={`${styles.scene} ${marks ? styles.marks : ""}`}
      style={{ "--plate-image": `url(${MENU_CARTE_ASSETS.plateau})` } as CSSProperties}
    >
      {/* La scène déborde d'elle-même : pas de bande noire sur les écrans
          qui ne sont pas en 16/9. */}
      <div className={styles.spill} aria-hidden />

      <div className={styles.plate}>
        <Image
          src={MENU_CARTE_ASSETS.plateau}
          alt=""
          fill
          priority
          sizes="100vw"
          draggable={false}
          className={styles.plateImage}
        />

        {/* Le titre peint s'éteint, le vrai logo se pose dessus. */}
        <div className={styles.titleVeil} aria-hidden />
        <Image
          src={MENU_CARTE_ASSETS.logo}
          alt="Tidebound"
          width={1600}
          height={631}
          priority
          draggable={false}
          className={styles.logo}
        />

        <nav aria-label="Menu Tidebound">
          {SLOTS.map((slot) => (
            <Link
              key={slot.id}
              href={slot.href as Route}
              className={styles.card}
              style={
                {
                  "--x": slot.rect.x,
                  "--y": slot.rect.y,
                  "--w": slot.rect.w,
                  "--h": slot.rect.h,
                  "--rot": slot.rect.rot,
                } as CSSProperties
              }
              onClick={() => playButtonClick()}
            >
              {/* La lumière du survol : masquée pour s'éteindre au bord. */}
              <span className={styles.cardLight} aria-hidden />
              <span className={styles.cardLabel}>{slot.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
