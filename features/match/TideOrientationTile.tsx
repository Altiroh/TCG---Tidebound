"use client";

import { useState } from "react";
import type { TideOrientation, TideStateName } from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";

interface TideGaugeProps {
  tideState: TideStateName;
  tideRemainingTurns: number;
  orientation: TideOrientation;
}

/**
 * Ordre du cadrage (`game/environment/types.ts`, `TIDE_STATES_ORDER`),
 * rendu ici en colonne (via `flex-col-reverse`) Calme en bas → Abysses en
 * haut, pour que "Montante" progresse visuellement vers le haut.
 */
const TIDE_ORDER: readonly TideStateName[] = ["calme", "houle", "tempete", "abysses"];

/** Reprise de `RULES.TIDE_STATE_DURATION` (`game/rules/constants.ts`) — sert uniquement à situer la progression AU SEIN de l'état courant ; la donnée vivante reste `tideRemainingTurns`. */
const TIDE_STATE_DURATION: Record<TideStateName, number> = { calme: 2, houle: 2, tempete: 1, abysses: 1 };

/** Rappel du malus de chaque état (README "Malus globaux des Marées") — affiché dans l'info-bulle du repère courant uniquement. */
const TIDE_STATE_EFFECT_TEXT: Record<TideStateName, string> = {
  calme: "Aucun malus.",
  houle:
    "Chaque tour, une carte aléatoire du plateau a 10% de chances de devenir Malade (perd 1 Résistance/tour tant qu'elle le reste).",
  tempete: "Chaque Navire perd 1 Ancrage au début de chaque tour.",
  abysses: "À l'entrée : chaque Navire perd 2 Ancrage et sa Raison maximale est réduite de 2 (restaurée à la sortie).",
};

const TIDE_STATE_FILL_CLASS: Record<TideStateName, string> = {
  calme: "bg-sky-400",
  houle: "bg-cyan-400",
  tempete: "bg-amber-400",
  abysses: "bg-fuchsia-400",
};

const TIDE_STATE_TEXT_CLASS: Record<TideStateName, string> = {
  calme: "text-sky-300",
  houle: "text-cyan-300",
  tempete: "text-amber-300",
  abysses: "text-fuchsia-300",
};

const TIDE_STATE_GLOW: Record<TideStateName, string> = {
  calme: "shadow-[0_0_14px_rgba(56,189,248,0.75)]",
  houle: "shadow-[0_0_14px_rgba(34,211,238,0.75)]",
  tempete: "shadow-[0_0_14px_rgba(251,191,36,0.75)]",
  abysses: "shadow-[0_0_14px_rgba(232,121,249,0.75)]",
};

/**
 * Jauge de Marée codée directement — cadrage confirmé, `public/assets/
 * board/tide-states/` reste volontairement vide, aucun asset par état.
 * 4 repères empilés (Calme en bas → Abysses en haut, cerclés du même
 * anneau laiton que le bouton de phase `phase-buttons/frame.png`, pour
 * rester cohérent avec l'esthétique "instrument" déjà posée par
 * `ResourceGauge`) reliés par une piste qui se remplit progressivement
 * jusqu'au repère courant à mesure que les tours s'écoulent — évolution
 * continue plutôt qu'un simple remplacement d'image à chaque transition.
 * Un icône info n'apparaît qu'au survol du repère EN COURS (tours
 * restants + rappel de son malus).
 */
export function TideOrientationTile({ tideState, tideRemainingTurns, orientation }: TideGaugeProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const activeIndex = TIDE_ORDER.indexOf(tideState);
  const currentDuration = TIDE_STATE_DURATION[tideState];
  const currentStageFraction = Math.max(0, Math.min(1, (currentDuration - tideRemainingTurns) / currentDuration));
  const trackFraction = (activeIndex + currentStageFraction) / (TIDE_ORDER.length - 1);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-between gap-1 overflow-visible rounded-md bg-black/80 px-2 py-2.5">
      <span
        className={`text-[10px] font-semibold uppercase tracking-wide [font-family:var(--font-card-title)] ${TIDE_STATE_TEXT_CLASS[tideState]}`}
      >
        {orientation === "montante" ? "▲ Montante" : "▼ Descendante"}
      </span>

      <div className="relative flex flex-1 flex-col items-center justify-center">
        {/* Piste verticale de fond */}
        <div className="absolute inset-y-1 w-[3px] rounded-full bg-white/10" />
        {/* Piste remplie jusqu'à la position courante — évolution progressive animée */}
        <div
          className={`absolute bottom-1 w-[3px] rounded-full transition-[height] duration-700 ease-out ${TIDE_STATE_FILL_CLASS[tideState]}`}
          style={{ height: `${trackFraction * 100}%` }}
        />

        <div className="relative flex flex-col-reverse items-center gap-2.5">
          {TIDE_ORDER.map((stateName, index) => {
            const isActive = stateName === tideState;
            const isPast = index < activeIndex;
            const withinStageFraction = isActive ? currentStageFraction : isPast ? 1 : 0;

            return (
              <div key={stateName} className="relative flex items-center justify-center" style={{ width: 30, height: 30 }}>
                {isActive && (
                  <button
                    type="button"
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                    onFocus={() => setInfoOpen(true)}
                    onBlur={() => setInfoOpen(false)}
                    aria-label={`Effets de la Marée ${TIDE_STATE_LABELS[stateName]}`}
                    className="absolute -top-4 left-1/2 z-10 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full border border-white/50 bg-black/80 text-[8px] font-bold leading-none text-slate-200 hover:border-board-accent hover:text-board-accent"
                  >
                    i
                  </button>
                )}
                {isActive && infoOpen && (
                  <div className="absolute left-1/2 top-full z-20 mt-1 w-48 -translate-x-1/2 rounded-md border border-white/15 bg-black/95 p-2 text-left shadow-lg">
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wide [font-family:var(--font-card-title)] ${TIDE_STATE_TEXT_CLASS[stateName]}`}
                    >
                      {TIDE_STATE_LABELS[stateName]} · {tideRemainingTurns} tour{tideRemainingTurns > 1 ? "s" : ""} restant
                      {tideRemainingTurns > 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 text-[10px] leading-snug text-slate-300">{TIDE_STATE_EFFECT_TEXT[stateName]}</p>
                  </div>
                )}

                {/* eslint-disable-next-line @next/next/no-img-element -- anneau laiton réutilisé du bouton de phase, taille fixe */}
                <img
                  src="/assets/board/phase-buttons/frame.png"
                  alt=""
                  aria-hidden
                  draggable={false}
                  className={`absolute inset-0 h-full w-full select-none transition-opacity duration-500 ${
                    isActive || isPast ? "opacity-100" : "opacity-35"
                  }`}
                />
                <div className="absolute inset-[26%] overflow-hidden rounded-full bg-black/60">
                  <div
                    className={`absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out ${TIDE_STATE_FILL_CLASS[stateName]} ${
                      isActive ? TIDE_STATE_GLOW[stateName] : ""
                    }`}
                    style={{ height: `${withinStageFraction * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <span
        className={`text-xs font-bold uppercase tracking-wide [font-family:var(--font-card-title)] ${TIDE_STATE_TEXT_CLASS[tideState]}`}
      >
        {TIDE_STATE_LABELS[tideState]}
      </span>
    </div>
  );
}
