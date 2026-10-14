"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "@/game";
import { describeFinalBlow } from "@/features/match/finalBlow";

/**
 * Tenue de la table après un coup fatal, puis après un abandon / délai.
 *
 * L'état reçu est l'état AFFICHÉ : il ne passe à « terminée » qu'une fois le
 * coup fatal joué jusqu'au bout, Navire qui encaisse compris
 * (`useAttackPresentation`, `FINAL_BLOW_LINGER_MS`). Les 2,2 s d'avant
 * s'ajoutaient donc à ce temps-là — près de 4 s entre le coup et l'écran de
 * fin (audit de fluidité du 14/10/2026). Il ne reste qu'un souffle.
 */
const HOLD_STRUCK_MS = 600;
const HOLD_OTHER_MS = 1000;

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
