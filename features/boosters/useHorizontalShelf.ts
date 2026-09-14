"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Une étagère qui se parcourt HORIZONTALEMENT.
 *
 * Au doigt et au pavé tactile, le défilement natif suffit. À la souris, il
 * n'existe pas : d'où les deux flèches, qui ne s'allument que lorsqu'il y a
 * vraiment quelque chose de ce côté-là. `canScrollLeft`/`canScrollRight`
 * sont recalculés au défilement, au redimensionnement ET quand le contenu
 * change (un booster ouvert en retire un de l'étagère).
 */
export function useHorizontalShelf() {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    // Une marge d'un pixel : les largeurs fractionnaires laisseraient sinon
    // une flèche allumée alors qu'on est déjà au bout.
    setCanScrollLeft(element.scrollLeft > 1);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    measure();
    element.addEventListener("scroll", measure, { passive: true });

    // Couvre à la fois le redimensionnement de la fenêtre et l'ajout ou le
    // retrait d'un paquet, sans avoir à prévenir le hook.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    for (const child of Array.from(element.children)) resizeObserver.observe(child);

    return () => {
      element.removeEventListener("scroll", measure);
      resizeObserver.disconnect();
    };
  }, [measure]);

  /** Défile d'environ un écran d'étagère, dans le sens donné. */
  const scrollByPage = useCallback((direction: -1 | 1) => {
    const element = ref.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  return { ref, canScrollLeft, canScrollRight, scrollByPage, measure };
}
