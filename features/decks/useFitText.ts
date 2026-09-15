"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Fait tenir un texte sur UNE seule ligne, en réduisant sa taille au besoin.
 *
 * Le nom d'un deck passe à la ligne ou se coupe dès qu'il est un peu long,
 * et le panneau est étroit. Plutôt que de le tronquer — un deck qui
 * s'appelle « Cra-Poi… » ne se reconnaît plus — on rétrécit la police
 * jusqu'à ce qu'il rentre, avec un plancher pour qu'il reste lisible.
 *
 * Mesuré en `useLayoutEffect` et non `useEffect` : la correction est
 * appliquée AVANT peinture, sans quoi le nom clignoterait à sa taille
 * d'origine à chaque frappe.
 */
export function useFitText(text: string, maxPx: number, minPx: number) {
  const ref = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState(maxPx);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Repart TOUJOURS du maximum : sans ça, un nom raccourci resterait
    // petit, la taille n'étant jamais remontée.
    let next = maxPx;
    element.style.fontSize = `${next}px`;
    // `scrollWidth > clientWidth` = le texte déborde de son conteneur.
    while (next > minPx && element.scrollWidth > element.clientWidth) {
      next -= 1;
      element.style.fontSize = `${next}px`;
    }
    setSize(next);
  }, [text, maxPx, minPx]);

  return { ref, size };
}
