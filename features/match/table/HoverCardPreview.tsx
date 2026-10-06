"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "@/features/match/table/Table.module.css";

interface HoverCardPreviewProps {
  /** Boîte de la carte survolée, en coordonnées de la fenêtre (`getBoundingClientRect`). */
  anchor: DOMRect;
  /** La carte, rendue en grand (`CardTile` à pleine largeur du calque). */
  children: ReactNode;
  /**
   * Rendu dans `document.body` : pour un aperçu ouvert depuis un élément
   * pris dans un contexte d'empilement plus bas que les piles et la main
   * (le hublot de Lande, au centre) — sinon il passe dessous.
   */
  portal?: boolean;
  /**
   * Posé CONTRE la carte, du côté libre de l'écran : l'effet en texte de
   * lecture (`CardRulesPanel`), qu'un effet long rend minuscule sur la face.
   */
  aside?: ReactNode;
}

/** Marge au bord de la fenêtre, et écart entre la carte survolée et son aperçu. */
const MARGIN = 10;
const GAP = 14;

/**
 * Aperçu LISIBLE d'une carte survolée — main ou plateau.
 *
 * L'agrandissement en place (`--card-hover-scale`) garde la carte à sa
 * taille de jeu ou presque : un texte de règles y reste une ligne de
 * fourmis. Ici la carte est rendue une seconde fois, en grand, dans un
 * calque fixe posé à côté de l'originale : au-dessus quand la carte est
 * dans la moitié basse de l'écran (la main, sa rangée), en dessous sinon
 * (la rangée adverse), toujours centrée sur elle et ramenée dans la
 * fenêtre. Le calque ne reçoit aucun pointeur : le survol reste sur la
 * carte, et le geste (glisser, viser) n'est jamais gêné.
 *
 * Souris seulement : au doigt il n'y a pas de survol, et c'est l'appui long
 * qui pose la carte en grand au milieu de l'écran (`TableCardZoom`).
 */
export function HoverCardPreview({ anchor, children, portal = false, aside }: HoverCardPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // La CARTE (pas l'encart) se centre sur l'originale ; l'encart déborde du côté libre.
    const card = el.querySelector<HTMLElement>("[data-preview-card]");
    const cardWidth = card?.offsetWidth ?? width;
    const offset = card?.offsetLeft ?? 0;
    const centered = anchor.left + anchor.width / 2 - cardWidth / 2 - offset;
    const left = Math.min(Math.max(MARGIN, centered), Math.max(MARGIN, viewportWidth - width - MARGIN));

    const above = anchor.top + anchor.height / 2 > viewportHeight / 2;
    const wanted = above ? anchor.top - GAP - height : anchor.bottom + GAP;
    const top = Math.min(Math.max(MARGIN, wanted), Math.max(MARGIN, viewportHeight - height - MARGIN));

    setPosition({ left, top });
  }, [anchor]);

  // L'encart va du côté où il reste de la place : à gauche d'une carte de droite.
  const side = anchor.left + anchor.width / 2 > (typeof window === "undefined" ? 0 : window.innerWidth / 2) ? "left" : "right";
  const layer = (
    <div
      ref={ref}
      className={styles.hoverPreview}
      data-hover-preview=""
      data-ready={position ? "true" : "false"}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
      aria-hidden
    >
      <div className={styles.hoverPreviewRow} data-side={side}>
        <div className={styles.hoverPreviewCard} data-preview-card="">{children}</div>
        {aside}
      </div>
    </div>
  );
  return portal ? createPortal(layer, document.body) : layer;
}
