"use client";

import { useEffect, useState } from "react";
import type { TideStateName } from "@/game";
import { useImageOk } from "@/features/match/useImageOk";
import { useLandeTuning } from "@/features/match/landes/landeTuning";
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
export function BackgroundLayer({
  tideState,
  floor = null,
}: {
  tideState: TideStateName;
  /**
   * Sol d'une Lande (`LandeScene.floor`) qui remplace la mer : `key` change
   * avec la Lande, `delayMs` attend la fin de son arrivée.
   */
  floor?: { src: string; key: string; delayMs: number } | null;
}) {
  const [allMounted, setAllMounted] = useState(false);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => setAllMounted(true), { timeout: 4000 });
    return () => cancel(id);
  }, []);
  const tuning = useLandeTuning();
  // Un sol de Lande remplace la mer : pont et voile se règlent avec lui (`landeTuning.ts`).
  const onFloor = floor !== null;

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
      <LandeFloor floor={floor} />
      {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
      <img
        src={DECK_SRC}
        alt=""
        draggable={false}
        decoding="async"
        className={`${styles.backgroundImage} ${styles.backgroundTuned}`}
        style={{ opacity: onFloor ? tuning.deckOpacity : 1 }}
      />
      <div className={`${styles.backgroundVeil} ${styles.backgroundTuned}`} style={{ opacity: onFloor ? tuning.veilOpacity : 1 }} />
    </div>
  );
}

/** Durée du fondu de sortie d'un sol, quand sa Lande part. */
const FLOOR_LEAVE_MS = 1200;

/**
 * Le SOL d'une Lande, entre la mer et le pont : il surgit du centre en une
 * onde, la table tremble, puis il tient tant que la Lande est là. Absent
 * (fichier pas encore livré) : rien ne change, la mer reste.
 */
function LandeFloor({ floor }: { floor: { src: string; key: string; delayMs: number } | null }) {
  const ok = useImageOk(floor?.src ?? null);
  const { floorBrightness } = useLandeTuning();
  const [leaving, setLeaving] = useState<{ src: string; key: string } | null>(null);
  const [shown, setShown] = useState<{ src: string; key: string; delayMs: number } | null>(null);
  useEffect(() => {
    if (floor && ok) {
      setShown(floor);
      return;
    }
    if (!floor && shown) {
      setLeaving(shown);
      setShown(null);
      const timer = window.setTimeout(() => setLeaving(null), FLOOR_LEAVE_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor?.key, ok]);
  // La luminosité vit sur un calque autour du sol : l'animation d'entrée,
  // qui joue elle-même sur `filter`, l'écraserait sur l'image.
  return (
    <div className={styles.landeFloorLayer} style={{ filter: floorBrightness === 1 ? undefined : `brightness(${floorBrightness})` }}>
      {leaving && (
        // eslint-disable-next-line @next/next/no-img-element -- décor plein écran
        <img key={`out-${leaving.key}`} src={leaving.src} alt="" draggable={false} className={`${styles.backgroundImage} ${styles.landeFloorOut}`} />
      )}
      {shown && (
        // eslint-disable-next-line @next/next/no-img-element -- décor plein écran
        <img
          key={shown.key}
          src={shown.src}
          alt=""
          draggable={false}
          className={`${styles.backgroundImage} ${styles.landeFloor}`}
          style={{ animationDelay: `${shown.delayMs}ms` }}
        />
      )}
    </div>
  );
}
