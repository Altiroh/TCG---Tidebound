"use client";

import { useEffect } from "react";

/**
 * Verrouille l'écran en paysage quand la plateforme le permet — c'est-à-dire
 * une app INSTALLÉE sur Android (`display: standalone` + `orientation:
 * landscape` dans le manifeste), ou un document passé en plein écran.
 *
 * Partout ailleurs l'appel est refusé, et c'est prévu :
 *  - iOS ne fournit pas `screen.orientation.lock` du tout ;
 *  - dans un onglet ordinaire, la spécification l'interdit hors plein écran.
 *
 * Le repli est le voile CSS de `OrientationGate`, qui demande la rotation au
 * joueur. Aucun message d'erreur : un refus ici n'est pas un incident.
 */
export function OrientationLock() {
  useEffect(() => {
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;
    orientation?.lock?.("landscape").catch(() => {
      // Refus attendu hors app installée / plein écran : le voile prend le relais.
    });
  }, []);

  return null;
}
