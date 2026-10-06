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
/** Attribut posé SUR l'élément désigné : le halo est dessiné par lui (`app/globals.css`). */
export const HALO_ATTRIBUTE = "data-tuto-halo";

export function useAnchorRect(selector: string | null, halo = false): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    let frame = 0;
    let previous: AnchorRect | null = null;
    let lit: Element | null = null;

    const read = () => {
      const element = document.querySelector(selector);
      const next = element ? toRect(element.getBoundingClientRect()) : null;

      // Le HALO vit sur l'élément lui-même (attribut + règle globale) et non
      // dans un calque posé par-dessus : il suit la carte au pixel, et le
      // gros plan d'une carte survolée passe devant lui au lieu d'être barré.
      // Relu à chaque image : l'élément peut être remplacé par un rendu.
      const want = halo ? element : null;
      if (want !== lit) {
        lit?.removeAttribute(HALO_ATTRIBUTE);
        want?.setAttribute(HALO_ATTRIBUTE, "");
        lit = want;
      }

      if (!sameRect(previous, next)) {
        previous = next;
        setRect(next);
      }
      frame = requestAnimationFrame(read);
    };

    frame = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(frame);
      lit?.removeAttribute(HALO_ATTRIBUTE);
    };
  }, [selector, halo]);

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
