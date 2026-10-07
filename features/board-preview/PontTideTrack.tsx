"use client";

import type { CSSProperties } from "react";
import { PORTHOLE_SEAS } from "@/features/match/table/TidePorthole";
import type { TableTideModel } from "@/features/match/table/tableModel";
import styles from "@/features/board-preview/PontTideTrack.module.css";

/**
 * PISTE DE MARÉE du Pont du Capitaine (labo `/game/pont-preview`, 07/10/2026).
 *
 * Une planche cerclée de cuivre (`piste-maree.webp`, 2094 × 534) percée de
 * quatre hublots, les noms des états peints dessous. Dans chaque hublot, la
 * mer de l'état (`PORTHOLE_SEAS`) : éteinte s'il est à venir, normale s'il
 * est passé, éclairée s'il est en cours. Le SÉLECTEUR doré se pose au-dessus
 * de l'état en cours, pointe vers lui, et porte sur son bouton central le
 * nombre de tours restants.
 */
const TRACK_SRC = "/assets/board/pont/piste-maree.webp";
const SELECTOR_SRC = "/assets/board/pont/selecteur-maree.webp";

/** Hublots dans la planche, en % de l'image : centres x, centre y commun, taille (légère ellipse). */
const HOLE_X = [17.43, 38.68, 60.36, 82.19];
const HOLE_Y = 44.2;
const HOLE_W = 14.6;
const HOLE_H = 52.4;

export function PontTideTrack({ tide }: { tide: TableTideModel }) {
  const current = tide.states[tide.current];
  const turns = `${tide.remainingTurns} tour${tide.remainingTurns > 1 ? "s" : ""} restant${tide.remainingTurns > 1 ? "s" : ""}`;
  return (
    <div className={styles.track} role="group" aria-label={current ? `Marée : ${current.label}, ${turns}` : "Marée"} data-ui-obstacle="">
      {tide.states.map((state, index) => (
        <span
          key={state.id}
          className={`${styles.hole} ${index === tide.current ? styles.holeActive : index < tide.current ? styles.holePast : styles.holeNext}`}
          style={{ "--x": `${HOLE_X[index]}%`, "--y": `${HOLE_Y}%`, "--w": `${HOLE_W}%`, "--h": `${HOLE_H}%` } as CSSProperties}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
          <img src={PORTHOLE_SEAS[state.id]} alt="" draggable={false} className={styles.sea} />
        </span>
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img src={TRACK_SRC} alt="" draggable={false} className={styles.frame} />
      <span className={styles.selector} style={{ "--x": `${HOLE_X[tide.current] ?? HOLE_X[0]}%` } as CSSProperties} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img src={SELECTOR_SRC} alt="" draggable={false} className={styles.selectorImage} />
        <span className={styles.count}>{tide.remainingTurns}</span>
      </span>
    </div>
  );
}
