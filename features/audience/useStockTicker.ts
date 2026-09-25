"use client";

import { useEffect, useRef, useState } from "react";

/** Crans du défilement, et leur cadence. */
const TICKS = 10;
const TICK_MS = 90;
/** Le temps de lire la nouvelle valeur en couleur, avant le retour au blanc. */
const SETTLE_MS = 1200;

/**
 * Un nombre qui DÉFILE jusqu'à sa cible, cran après cran comme un cours de
 * bourse — vite au départ, plus lentement à l'approche — et qui dit s'il
 * monte (`up`) ou baisse (`down`) le temps du défilement, puis revient au
 * repos (`null`). La première valeur connue s'affiche telle quelle.
 */
export function useStockTicker(target: number | null): { shown: number | null; trend: "up" | "down" | null } {
  const [shown, setShown] = useState<number | null>(target);
  const [trend, setTrend] = useState<"up" | "down" | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (target === null) return;
    const from = shownRef.current;
    if (from === null) {
      setShown(target);
      return;
    }
    if (from === target) return;
    setTrend(target > from ? "up" : "down");
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let tick = 1; tick <= TICKS; tick += 1) {
      const progress = 1 - (1 - tick / TICKS) ** 2;
      timers.push(setTimeout(() => setShown(Math.round(from + (target - from) * progress)), tick * TICK_MS));
    }
    timers.push(setTimeout(() => setTrend(null), TICKS * TICK_MS + SETTLE_MS));
    return () => timers.forEach(clearTimeout);
  }, [target]);

  return { shown, trend };
}
