"use client";

import { useState } from "react";
import type { TideStateName } from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";

interface TideProgressBarProps {
  tideState: TideStateName;
  tideRemainingTurns: number;
}

/** Ordre du cadrage (`game/environment/types.ts`, `TIDE_STATES_ORDER`). */
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
  calme: "shadow-[0_0_12px_rgba(56,189,248,0.9)]",
  houle: "shadow-[0_0_12px_rgba(34,211,238,0.9)]",
  tempete: "shadow-[0_0_12px_rgba(251,191,36,0.9)]",
  abysses: "shadow-[0_0_12px_rgba(232,121,249,0.9)]",
};

/**
 * Ligne de progression de la Marée, horizontale et sans fond — remplace le
 * texte "Marée : Calme (2 tour(s))" au centre du board (la tuile à gauche,
 * `TideOrientationTile`, reste inchangée). 4 repères reliés par une piste :
 * déjà traversés = petit disque plein, état courant = disque avec glow
 * (coloré par état), à venir = simple contour éteint. Le segment de piste
 * entre deux repères se remplit progressivement au fil des tours plutôt que
 * d'un bond brut à chaque transition.
 */
export function TideProgressBar({ tideState, tideRemainingTurns }: TideProgressBarProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const activeIndex = TIDE_ORDER.indexOf(tideState);
  const currentDuration = TIDE_STATE_DURATION[tideState];
  const currentStageFraction = Math.max(0, Math.min(1, (currentDuration - tideRemainingTurns) / currentDuration));

  return (
    <div className="flex items-start">
      {TIDE_ORDER.map((stateName, index) => {
        const isActive = stateName === tideState;
        const isPast = index < activeIndex;
        const isLast = index === TIDE_ORDER.length - 1;
        const connectorFraction = index < activeIndex ? 1 : index === activeIndex ? currentStageFraction : 0;

        return (
          <div key={stateName} className="flex items-start">
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative flex h-4 w-4 items-center justify-center">
                {isActive && (
                  <button
                    type="button"
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                    onFocus={() => setInfoOpen(true)}
                    onBlur={() => setInfoOpen(false)}
                    aria-label={`Effets de la Marée ${TIDE_STATE_LABELS[stateName]}`}
                    className="absolute -top-5 left-1/2 z-10 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full border border-white/50 bg-black/80 text-[8px] font-bold leading-none text-slate-200 hover:border-board-accent hover:text-board-accent"
                  >
                    i
                  </button>
                )}
                {isActive && infoOpen && (
                  <div className="absolute left-1/2 top-full z-20 mt-2 w-48 -translate-x-1/2 rounded-md border border-white/15 bg-black/95 p-2 text-left shadow-lg">
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wide [font-family:var(--font-card-title)] ${TIDE_STATE_TEXT_CLASS[stateName]}`}
                    >
                      {TIDE_STATE_LABELS[stateName]} · {tideRemainingTurns} tour{tideRemainingTurns > 1 ? "s" : ""} restant
                      {tideRemainingTurns > 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 text-[10px] leading-snug text-slate-300">{TIDE_STATE_EFFECT_TEXT[stateName]}</p>
                  </div>
                )}
                <div
                  className={`rounded-full transition-all duration-500 ease-out ${
                    isActive
                      ? `h-4 w-4 ${TIDE_STATE_FILL_CLASS[stateName]} ${TIDE_STATE_GLOW[stateName]}`
                      : isPast
                        ? `h-2.5 w-2.5 ${TIDE_STATE_FILL_CLASS[stateName]}`
                        : "h-2.5 w-2.5 border border-white/25 bg-transparent"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide [font-family:var(--font-card-title)] ${
                  isActive ? TIDE_STATE_TEXT_CLASS[stateName] : isPast ? "text-slate-300" : "text-slate-600"
                }`}
              >
                {TIDE_STATE_LABELS[stateName]}
              </span>
            </div>

            {!isLast && (
              <div className="relative mx-2 h-[2px] w-16 overflow-hidden rounded-full bg-white/10" style={{ marginTop: 7 }}>
                <div
                  className="h-full bg-sky-200/80 transition-[width] duration-700 ease-out"
                  style={{ width: `${connectorFraction * 100}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
