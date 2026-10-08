"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PORTHOLE_SEAS } from "@/features/match/table/TidePorthole";
import type { TableTideModel } from "@/features/match/table/tableModel";
import styles from "@/features/match/table/pont/PontTideTrack.module.css";

/**
 * PISTE DE MARÉE du Pont du Capitaine (labo `/game/pont-preview`, 07/10/2026).
 *
 * Une planche cerclée de cuivre (`piste-maree.webp`, 2094 × 534) percée de
 * quatre hublots, les noms des états peints dessous. Dans chaque hublot, la
 * mer de l'état (`PORTHOLE_SEAS`) : éteinte s'il est à venir, normale s'il
 * est passé, éclairée s'il est en cours, avec le NOMBRE DE TOURS RESTANTS
 * au milieu du hublot. Le SÉLECTEUR doré se pose au-dessus de l'état en
 * cours et pointe vers lui.
 *
 * À sa gauche, dans la même rangée (jamais sur l'emplacement de Lande), la
 * PLAQUE DU SENS (`plaque-sens-maree.webp`) : dans son
 * hublot, le logo de vague — bleu, vers le haut, quand la Marée monte ;
 * rouge, tête en bas, quand elle descend. Les deux sont les faces d'une même
 * pièce qui BASCULE à chaque changement de sens, toujours bord haut poussé
 * vers le bas (l'angle s'accumule : 180°, 360°…).
 */
const TRACK_SRC = "/assets/board/pont/piste-maree.webp";
const SELECTOR_SRC = "/assets/board/pont/selecteur-maree.webp";

/** Hublots dans la planche, en % de l'image : centres x, centre y commun, taille (légère ellipse). */
const HOLE_X = [17.43, 38.68, 60.36, 82.19];
const HOLE_Y = 44.2;
const HOLE_W = 14.6;
const HOLE_H = 52.4;

const SENS_PLAQUE = "/assets/board/pont/plaque-sens-maree.webp";
const SENS_MONTANTE = "/assets/board/pont/sens-montante.webp";
const SENS_DESCENDANTE = "/assets/board/pont/sens-descendante.webp";

/**
 * Angle de la pièce : un demi-tour de plus à chaque changement de sens, pour
 * qu'elle bascule toujours dans le même sens. Au premier rendu, elle est
 * déjà sur la bonne face, sans animation.
 */
function useFlipAngle(rising: boolean): number {
  const [angle, setAngle] = useState(rising ? 0 : 180);
  const last = useRef(rising);
  useEffect(() => {
    if (last.current === rising) return;
    last.current = rising;
    setAngle((a) => a + 180);
  }, [rising]);
  return angle;
}

export function PontTideTrack({ tide }: { tide: TableTideModel }) {
  const current = tide.states[tide.current];
  const rising = tide.orientation === "rising";
  const angle = useFlipAngle(rising);
  const turns = `${tide.remainingTurns} tour${tide.remainingTurns > 1 ? "s" : ""} restant${tide.remainingTurns > 1 ? "s" : ""}`;
  return (
    <div className={styles.pontMaree} data-tide-track="">
      <span className={styles.sens} role="img" aria-label={rising ? "Marée montante" : "Marée descendante"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img src={SENS_PLAQUE} alt="" draggable={false} className={styles.sensPlaque} />
        <span className={styles.sensHole}>
          <span className={styles.sensCoin} style={{ transform: `rotateX(${angle}deg)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
            <img src={SENS_MONTANTE} alt="" draggable={false} className={styles.sensFace} />
            {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
            <img src={SENS_DESCENDANTE} alt="" draggable={false} className={`${styles.sensFace} ${styles.sensBack}`} />
          </span>
        </span>
      </span>
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
            {index === tide.current && (
              <span className={styles.turns}>
                <span className={styles.turnsCount}>{tide.remainingTurns}</span>
                <span className={styles.turnsLabel}>tour{tide.remainingTurns > 1 ? "s" : ""}</span>
              </span>
            )}
          </span>
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img src={TRACK_SRC} alt="" draggable={false} className={styles.frame} />
        <span className={styles.selector} style={{ "--x": `${HOLE_X[tide.current] ?? HOLE_X[0]}%` } as CSSProperties} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
          <img src={SELECTOR_SRC} alt="" draggable={false} className={styles.selectorImage} />
        </span>
      </div>
    </div>
  );
}
