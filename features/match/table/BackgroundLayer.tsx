"use client";

import { useEffect, useState } from "react";
import type { TideStateName } from "@/game";
import styles from "@/features/match/table/Table.module.css";

/** Mer et ciel propres à chaque état de Marée (1672×941, même cadrage). */
const TIDE_BACKGROUNDS: Record<TideStateName, string> = {
  calme: "/assets/board/tide-states/calme.webp",
  houle: "/assets/board/tide-states/houle.webp",
  tempete: "/assets/board/tide-states/tempete.webp",
  abysses: "/assets/board/tide-states/abysses.webp",
};

/**
 * Pont du navire, découpé dans l'ancien fond et fondu vers le haut (alpha
 * progressif au niveau du bastingage). Même format et même cadrage que les
 * fonds de Marée : posé par-dessus avec le même `object-fit`, il tombe
 * exactement au même endroit quel que soit le format d'écran.
 */
const DECK_SRC = "/assets/board/board-deck.webp";

/**
 * Décor de la scène : la mer de l'état de Marée courant, et le pont devant.
 * Les quatre mers se relaient en fondu enchaîné au changement d'état — pas
 * de chargement ni de flash à ce moment-là.
 *
 * Mais elles ne se chargent plus toutes D'ENTRÉE (audit du 24/09) : 1,3 Mo
 * d'images se disputaient le réseau avec la première image de la partie,
 * pour trois mers que la Marée n'atteindra pas avant plusieurs tours. La
 * mer courante part en priorité haute ; les trois autres sont montées une
 * fois la page au repos, en priorité basse — bien avant qu'une transition
 * n'en ait besoin.
 *
 * Recadré en `object-fit: cover` selon le format d'écran SANS jamais déplacer le
 * gameplay, qui vit dans un calque séparé au-dessus.
 *
 * De vraies balises `<img>` plutôt qu'un `background-image` : même raison
 * que `BoardBackdrop` (repaint peu fiable d'un fond CSS chargé tard).
 */
export function BackgroundLayer({ tideState }: { tideState: TideStateName }) {
  const [allMounted, setAllMounted] = useState(false);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => setAllMounted(true), { timeout: 4000 });
    return () => cancel(id);
  }, []);

  return (
    <div aria-hidden className={styles.background}>
      {(Object.keys(TIDE_BACKGROUNDS) as TideStateName[])
        .filter((state) => allMounted || state === tideState)
        .map((state) => (
          // eslint-disable-next-line @next/next/no-img-element -- décor plein écran, jamais responsive au sens Next/Image
          <img
            key={state}
            src={TIDE_BACKGROUNDS[state]}
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority={state === tideState ? "high" : "low"}
            className={`${styles.backgroundImage} ${styles.backgroundTide} ${state === tideState ? styles.backgroundTideActive : ""}`}
          />
        ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
      <img src={DECK_SRC} alt="" draggable={false} decoding="async" className={styles.backgroundImage} />
      <div className={styles.backgroundVeil} />
    </div>
  );
}
