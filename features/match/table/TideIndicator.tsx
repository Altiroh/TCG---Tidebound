"use client";

import { Fragment, useState, type CSSProperties } from "react";
import type { TideStateName } from "@/game";
import styles from "@/features/match/table/Table.module.css";
import { PORTHOLE_FRAME, PORTHOLE_SEAS } from "@/features/match/table/TidePorthole";
import type { TableTideModel } from "@/features/match/table/tableModel";

interface TideIndicatorProps {
  tide: TableTideModel;
}

/** Le tube de verre cerclé de cuivre qui relie deux hublots. */
const TIDE_PIPE = "/assets/board/tuyau.webp";

/** Couleur de chaque état — mêmes teintes que `TideProgressBar` (sky / cyan / amber / fuchsia). */
const TIDE_COLOR: Record<TideStateName, string> = {
  calme: "56, 189, 248",
  houle: "34, 211, 238",
  tempete: "251, 191, 36",
  abysses: "232, 121, 249",
};

/** Rappel du malus de chaque état — repris de `TideProgressBar` (README "Malus globaux des Marées"). */
const TIDE_EFFECT: Record<TideStateName, string> = {
  calme: "Aucun malus.",
  houle: "Chaque tour, une carte aléatoire du plateau a 10% de chances de devenir Malade (perd 1 Résistance/tour tant qu'elle le reste).",
  tempete: "Chaque Navire perd 1 Ancrage au début de chaque tour.",
  abysses: "À l'entrée : chaque Navire perd 2 Ancrage et sa Raison maximale est réduite de 2 (restaurée à la sortie).",
};

/**
 * Piste de progression de la Marée, au centre du plateau, posée directement
 * sur le décor :
 *   - 4 repères reliés par des segments blancs translucides. Chaque repère
 *     est un HUBLOT (le cadre de cuivre de `TidePorthole`) par lequel on
 *     voit la mer de cet état — c'est pour ça que les cadres existent, à
 *     la place des anciens disques de couleur ;
 *   - à venir = mer éteinte derrière le verre ; franchi = mer normale ;
 *     courant = hublot plus grand, halo à la couleur de l'état, et le
 *     NOMBRE DE TOURS RESTANTS gravé dans le médaillon du bas du cadre ;
 *   - le segment après l'état courant se remplit au fil de ses tours ;
 *   - un « i » au-dessus du repère courant rappelle son effet.
 * Tailles en tokens (et non en pixels fixes) pour tenir jusqu'au mobile.
 * Le sens (montante / descendante) a sa propre tuile, entre les navires.
 */
export function TideIndicator({ tide }: TideIndicatorProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const current = tide.states[tide.current];

  return (
    <div className={styles.tide} aria-label="Progression de la Marée" role="group">
      {tide.states.map((state, index) => {
        const isActive = index === tide.current;
        const isPast = index < tide.current;
        const isLast = index === tide.states.length - 1;
        const fill = index < tide.current ? 1 : isActive ? tide.stageProgress : 0;

        return (
          <Fragment key={state.id}>
            <div
              className={`${styles.tideStep} ${isActive ? styles.tideStepActive : ""} ${isPast ? styles.tideStepPast : ""}`}
              style={{ "--tide-rgb": TIDE_COLOR[state.id] } as CSSProperties}
              aria-current={isActive ? "step" : undefined}
              aria-label={isActive ? `${state.label}, ${tide.remainingTurns} tour${tide.remainingTurns > 1 ? "s" : ""} restant${tide.remainingTurns > 1 ? "s" : ""}` : undefined}
            >
              <span className={styles.tideMarker}>
                {isActive && (
                  <button
                    type="button"
                    className={styles.tideInfo}
                    aria-label={`Effets de la Marée ${state.label}`}
                    aria-expanded={infoOpen}
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                    onFocus={() => setInfoOpen(true)}
                    onBlur={() => setInfoOpen(false)}
                    // Au doigt, pas de survol : un toucher ouvre et referme.
                    onClick={() => setInfoOpen((open) => !open)}
                  >
                    i
                  </button>
                )}
                <span className={styles.tidePort} aria-hidden>
                  <span className={styles.tidePortWindow}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
                    <img src={PORTHOLE_SEAS[state.id]} alt="" draggable={false} className={styles.tidePortSea} />
                    <span className={styles.tidePortGlass} />
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
                  <img src={PORTHOLE_FRAME} alt="" draggable={false} className={styles.tidePortFrame} />
                  {/* Le décompte, dans le médaillon du bas du cadre : la
                      seule donnée chiffrée de la piste, là où l'œil tombe. */}
                  {isActive && <span className={styles.tidePortCount}>{tide.remainingTurns}</span>}
                </span>
              </span>
              <span className={styles.tideName}>{state.label}</span>
            </div>
            {!isLast && (
              /* Le tuyau vers l'état suivant : il se remplit d'eau, à la
                 couleur de l'état courant, au fil de ses tours. */
              <span className={styles.tideSegment} style={{ "--tide-rgb": TIDE_COLOR[state.id] } as CSSProperties} aria-hidden>
                <span className={styles.tideSegmentGlass}>
                  <span className={styles.tideSegmentFill} style={{ width: `${fill * 100}%` }} />
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
                <img src={TIDE_PIPE} alt="" draggable={false} className={styles.tideSegmentPipe} />
              </span>
            )}
          </Fragment>
        );
      })}

      {infoOpen && current && (
        <div className={styles.tideTooltip} role="tooltip" style={{ "--tide-rgb": TIDE_COLOR[current.id] } as CSSProperties}>
          <p className={styles.tideTooltipTitle}>
            {current.label} · {tide.remainingTurns} tour{tide.remainingTurns > 1 ? "s" : ""} restant{tide.remainingTurns > 1 ? "s" : ""}
          </p>
          <p className={styles.tideTooltipText}>{TIDE_EFFECT[current.id]}</p>
        </div>
      )}
    </div>
  );
}
