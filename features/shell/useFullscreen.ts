"use client";

import { useCallback, useEffect, useState } from "react";

/** Préfixes WebKit (Safari iPad, anciens Chrome) — absents des types DOM standard. */
type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * PLEIN ÉCRAN DU DOCUMENT — pour jouer dans un onglet Android sans la barre
 * d'adresse, quand l'app n'est pas installée.
 *
 * `supported` reste faux au rendu serveur et jusqu'au montage (pas de
 * désaccord d'hydratation), et faux sur iPhone : Safari n'y ouvre le plein
 * écran qu'aux vidéos. `enter` doit être appelé DANS un geste du joueur (un
 * clic) : le navigateur refuse sinon. Une fois en plein écran, on tente de
 * verrouiller le paysage — permis là, refusé dans un onglet ordinaire (voir
 * `OrientationLock`). Tout échec est silencieux : le voile
 * `OrientationGate` reste le dernier recours.
 */
export function useFullscreen(): { supported: boolean; active: boolean; enter: () => Promise<void> } {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    const canRequest = typeof root.requestFullscreen === "function" || typeof root.webkitRequestFullscreen === "function";
    setSupported(canRequest && (doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false));

    const sync = () => setActive(fullscreenElement() !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const enter = useCallback(async () => {
    const root = document.documentElement as FullscreenElement;
    try {
      if (!fullscreenElement()) {
        if (typeof root.requestFullscreen === "function") await root.requestFullscreen({ navigationUI: "hide" });
        else await root.webkitRequestFullscreen?.();
      }
    } catch {
      return; // Refusé (hors geste, iframe, réglage du navigateur) : rien à faire.
    }
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;
    await orientation?.lock?.("landscape").catch(() => undefined);
  }, []);

  return { supported, active, enter };
}
