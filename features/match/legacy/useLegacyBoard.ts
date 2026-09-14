"use client";

import { useEffect, useState } from "react";

/**
 * `?plateau=ancien` dans l'URL de la partie : affiche l'ANCIEN plateau
 * (`MatchBoardLegacy` / `OnlineBoardLegacy`) au lieu du nouveau — filet de
 * sécurité le temps de valider le nouveau plateau.
 *
 * Lu après le montage (et non pendant le rendu) : le rendu serveur ne connaît
 * pas l'URL du navigateur, lire `window` au premier rendu désynchroniserait
 * l'hydratation.
 */
export function useLegacyBoard(): boolean {
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    setLegacy(new URLSearchParams(window.location.search).get("plateau") === "ancien");
  }, []);
  return legacy;
}
