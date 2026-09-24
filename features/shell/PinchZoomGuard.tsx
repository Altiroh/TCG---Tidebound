"use client";

import { useEffect } from "react";

/**
 * VERROU DE ZOOM — le pincement ne doit rien déplacer.
 *
 * Décision du 18/09 (retour de test iOS) : sur un téléphone, un pincement
 * involontaire décale toute l'interface, et rien ne dit au joueur qu'il a
 * zoomé — il croit l'écran cassé. Le jeu est déjà dimensionné pour tenir
 * dans la fenêtre (paysage imposé, tailles en `clamp`, hauteurs en `dvh`) :
 * le zoom n'y apporte rien qu'un décalage.
 *
 * Trois verrous, parce qu'aucun ne suffit seul :
 *  1. `maximumScale: 1` + `userScalable: false` dans le viewport
 *     (`app/layout.tsx`) — respecté par Android/Chrome ;
 *  2. `touch-action: manipulation` sur la racine (`app/globals.css`) —
 *     supprime le zoom par double-tape ;
 *  3. CE composant — Safari iOS ignore délibérément `user-scalable=no`
 *     depuis iOS 10 ; seul l'annulation des événements `gesture*`
 *     (propres à WebKit) et des `touchmove` à plusieurs doigts arrête
 *     réellement le pincement.
 *
 * Contrepartie assumée : le zoom navigateur n'est plus disponible sur
 * mobile (WCAG 1.4.4). C'est un choix produit explicite ; la lisibilité est
 * donc à la charge des écrans eux-mêmes, jamais du zoom.
 */
export function PinchZoomGuard() {
  useEffect(() => {
    // `gesturestart` / `gesturechange` / `gestureend` : événements WebKit,
    // émis dès que deux doigts se rapprochent ou s'écartent. Les annuler
    // empêche Safari d'échelonner la page.
    const stop = (event: Event) => event.preventDefault();

    // Un `touchmove` à deux doigts et plus est un pincement (ou un
    // défilement à deux doigts) : rien de ce que le jeu utilise. Non
    // passif, sans quoi `preventDefault` n'a aucun effet.
    function onTouchMove(event: TouchEvent) {
      if (event.touches.length > 1) event.preventDefault();
    }

    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("gestureend", stop);
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return null;
}
