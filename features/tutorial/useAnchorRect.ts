"use client";

import { useEffect, useState } from "react";

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Suit la position à l'écran d'un élément du plateau, désigné par un
 * sélecteur CSS.
 *
 * Pourquoi un sélecteur et pas une `ref` : le guide du tutoriel est monté
 * À CÔTÉ du plateau (`TutorialScreen` rend `MatchBoard` puis
 * `TutorialCoach`), il n'a aucun moyen de tenir une référence sur une zone
 * qui vit à l'intérieur. Le plateau porte déjà des ancres stables
 * (`data-zone`, `data-drop`, `data-graveyard`) : on s'en sert.
 *
 * La position est relue à chaque image tant que le sélecteur est actif. Le
 * plateau bouge en permanence — cartes qui arrivent, main qui s'élargit,
 * fenêtre qui change de taille, animations — et un `ResizeObserver` sur le
 * seul élément raterait tout ce qui le déplace sans le redimensionner.
 * L'état n'est mis à jour que si le rectangle a VRAIMENT bougé, donc la
 * boucle ne provoque aucun rendu au repos.
 */
export function useAnchorRect(selector: string | null): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    let frame = 0;
    let previous: AnchorRect | null = null;

    const read = () => {
      const element = document.querySelector(selector);
      const next = element ? toRect(element.getBoundingClientRect()) : null;

      if (!sameRect(previous, next)) {
        previous = next;
        setRect(next);
      }
      frame = requestAnimationFrame(read);
    };

    frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, [selector]);

  return rect;
}

function toRect(box: DOMRect): AnchorRect {
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

/** Comparaison au pixel près : un écart sous-pixel ne vaut pas un rendu. */
function sameRect(a: AnchorRect | null, b: AnchorRect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}
