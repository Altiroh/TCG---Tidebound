"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "@/game";
import { describeFinalBlow } from "@/features/match/finalBlow";

/** Tenue de la table après un coup fatal (le temps de ses animations), puis après un abandon / délai. */
const HOLD_STRUCK_MS = 3400;
const HOLD_OTHER_MS = 1600;

/**
 * La partie vient de finir : la table RESTE à l'écran le temps que les
 * animations se jouent (attaque, impact, Ancrage à zéro), puis l'écran de
 * fin arrive. Aucun récapitulatif du dernier coup par-dessus : le plateau
 * suffit.
 *
 * Une partie DÉJÀ finie au montage (rechargement, reconnexion) passe
 * directement à l'écran de fin : il n'y a plus rien à voir.
 */
export function useEndScreenHold(state: GameState): { showEnd: boolean } {
  const finished = state.status === "finished";
  const wasFinishedAtMount = useRef(finished);
  const [showEnd, setShowEnd] = useState(finished);
  const struck = useMemo(() => (finished ? (describeFinalBlow(state, () => "")?.struck ?? false) : false), [finished, state]);

  useEffect(() => {
    if (!finished) {
      wasFinishedAtMount.current = false;
      setShowEnd(false);
      return undefined;
    }
    if (wasFinishedAtMount.current) {
      setShowEnd(true);
      return undefined;
    }
    const timer = setTimeout(() => setShowEnd(true), struck ? HOLD_STRUCK_MS : HOLD_OTHER_MS);
    return () => clearTimeout(timer);
  }, [finished, struck]);

  return { showEnd };
}
