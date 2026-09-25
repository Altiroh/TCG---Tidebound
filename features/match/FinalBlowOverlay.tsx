"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/game";
import { describeFinalBlow } from "@/features/match/finalBlow";
import styles from "@/features/match/FinalBlowOverlay.module.css";

/** Tenue de la table après un coup fatal, puis après un abandon / délai. */
const HOLD_STRUCK_MS = 5200;
const HOLD_OTHER_MS = 2400;

/**
 * La partie vient de finir : la table RESTE à l'écran le temps de voir ce
 * qui s'est passé (animations d'attaque, impact, Ancrage à zéro), puis
 * l'écran de fin arrive — ou plus tôt, si le joueur le demande.
 *
 * Une partie DÉJÀ finie au montage (rechargement, reconnexion) passe
 * directement à l'écran de fin : il n'y a plus rien à voir.
 */
export function useEndScreenHold(state: GameState): { showEnd: boolean; skip: () => void } {
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

  return { showEnd, skip: () => setShowEnd(true) };
}

/**
 * Le bandeau posé sur la table pendant la tenue : « Coup fatal », les
 * dégâts en grand, et qui les a portés. Il n'apparaît qu'après un temps,
 * pour laisser l'impact se jouer d'abord sur le plateau.
 */
export function FinalBlowOverlay({
  state,
  viewerId,
  playerLabel,
  onSkip,
}: {
  state: GameState;
  viewerId?: PlayerId | null;
  playerLabel: (playerId?: string) => string;
  onSkip: () => void;
}) {
  const blow = useMemo(() => describeFinalBlow(state, playerLabel), [state, playerLabel]);
  if (!blow) return null;
  const tone = !blow.loserId || !viewerId ? "neutral" : blow.loserId === viewerId ? "defeat" : "victory";
  return (
    <div className={styles.veil} data-tone={tone} data-struck={blow.struck || undefined} role="status" aria-live="assertive">
      <div className={styles.banner}>
        <span className={styles.title}>{blow.title}</span>
        {blow.amount !== undefined && <span className={styles.amount}>−{blow.amount}</span>}
        <span className={styles.line}>{blow.line}</span>
        <button type="button" className={styles.skip} onClick={onSkip}>
          Voir le résultat
        </button>
      </div>
    </div>
  );
}
