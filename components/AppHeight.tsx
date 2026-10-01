"use client";

import { useEffect } from "react";

/**
 * HAUTEUR RÉELLE DE L'APP INSTALLÉE SUR IPHONE.
 *
 * Ouverte depuis l'écran d'accueil (plein cadre, barre d'état translucide,
 * `viewport-fit: cover`), iOS peut annoncer une fenêtre plus BASSE que
 * l'écran : `100dvh` et `position: fixed; inset: 0` s'arrêtent avant le
 * bas, et la bande qui reste montre le fond bleu nuit du document — la
 * « barre bleue » vue au choix du mode et en partie (retour du 01/10).
 *
 * Sans barre de navigateur, la vraie hauteur est connue : c'est le petit
 * côté de l'écran en paysage. Elle est posée dans `--tb-app-h`
 * (`app/globals.css`, `100dvh` par défaut), que lisent les écrans plein
 * cadre. Rien ne change ailleurs : ni dans Safari (sa barre d'outils fait
 * partie de l'écran), ni sur Android (l'écran compte sa barre de
 * navigation), ni sur iPad (une fenêtre partagée n'occupe pas l'écran).
 */
export function AppHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const iPhone = /iPhone|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!iPhone || !standalone) return;

    function update() {
      const landscape = window.innerWidth > window.innerHeight;
      const physical = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
      if (physical > window.innerHeight + 1) root.style.setProperty("--tb-app-h", `${physical}px`);
      else root.style.removeProperty("--tb-app-h");
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      root.style.removeProperty("--tb-app-h");
    };
  }, []);

  return null;
}
