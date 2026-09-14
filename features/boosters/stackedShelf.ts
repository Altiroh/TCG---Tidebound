"use client";

import { useEffect, useState } from "react";

/** Largeur d'un emplacement de sachet, en fraction de sa hauteur (le plus large des visuels fermés). */
export const PACK_SLOT_RATIO = 0.62;

export interface StackedShelfLayout {
  /** Hauteur d'un sachet, en px. */
  packHeight: number;
  /** Largeur d'un emplacement, en px. */
  slotWidth: number;
  /** Distance entre les bords gauches de deux sachets voisins, en px. Inférieure à `slotWidth` : ils se chevauchent. */
  step: number;
  /** Bord gauche du premier sachet, en px — la rangée est centrée. */
  offset: number;
}

/**
 * Disposition d'une étagère de `count` sachets dans une zone de
 * `width` × `height` px.
 *
 * Les sachets gardent la même taille quel que soit leur nombre : c'est
 * l'ÉCART qui se resserre. Espacés tant qu'il y a la place, puis de plus
 * en plus rapprochés, jusqu'à se chevaucher — un paquet de sachets se lit
 * encore comme une pile, alors que des vignettes rétrécies ne se lisent
 * plus du tout. Le pas ne descend jamais sous `minStep` : au-delà, la
 * rangée déborde plutôt que de rendre les sachets inattrapables.
 */
export function stackedShelfLayout(
  count: number,
  width: number,
  height: number,
  { gap = 24, minStep = 14, maxPackHeight = 420 }: { gap?: number; minStep?: number; maxPackHeight?: number } = {}
): StackedShelfLayout {
  const packHeight = Math.max(0, Math.min(maxPackHeight, height, width / PACK_SLOT_RATIO));
  const slotWidth = packHeight * PACK_SLOT_RATIO;

  if (count <= 1) {
    return { packHeight, slotWidth, step: 0, offset: Math.max(0, (width - slotWidth) / 2) };
  }

  const spacious = slotWidth + gap;
  const fitting = (width - slotWidth) / (count - 1);
  const step = Math.max(minStep, Math.min(spacious, fitting));
  const rowWidth = slotWidth + step * (count - 1);

  return { packHeight, slotWidth, step, offset: Math.max(0, (width - rowWidth) / 2) };
}

/**
 * Taille réelle d'un élément, suivie au redimensionnement. Ref par
 * CALLBACK : l'élément peut n'apparaître qu'après coup (étagère vide, puis
 * remplie par un achat) et doit alors être observé à son tour.
 */
export function useElementSize<T extends HTMLElement>() {
  const [element, ref] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref, ...size };
}
