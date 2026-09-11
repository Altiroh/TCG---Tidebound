"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  calme: "shadow-[0_0_18px_rgba(56,189,248,0.9)]",
  houle: "shadow-[0_0_18px_rgba(34,211,238,0.9)]",
  tempete: "shadow-[0_0_18px_rgba(251,191,36,0.9)]",
  abysses: "shadow-[0_0_18px_rgba(232,121,249,0.9)]",
};

/** Icône info + info-bulle du repère courant — rendue via un portail (`createPortal` dans `document.body`) plutôt qu'en `position: absolute` classique : toute cette barre vit à l'intérieur du plateau mis à l'échelle par `BoardStage` (`transform: scale()`), qui rapetisse aussi le TEXTE de tout ce qui reste dans cet arbre (contrairement à une taille en `px` qu'on pourrait croire fixe). Un portail échappe entièrement à cette mise à l'échelle : texte à taille réelle, toujours lisible quel que soit le zoom du plateau. Position calculée depuis `getBoundingClientRect()`, ouverte vers le haut. */
function TideInfoIcon({ stateName, tideRemainingTurns }: { stateName: TideStateName; tideRemainingTurns: number }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setCoords({ left: rect.left + rect.width / 2, top: rect.top });
    setOpen(true);
  }
  function hide() {
    setOpen(false);
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={`Effets de la Marée ${TIDE_STATE_LABELS[stateName]}`}
        className="absolute -top-9 left-1/2 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-white/50 bg-black/80 text-sm font-bold leading-none text-slate-200 hover:border-board-accent hover:text-board-accent"
      >
        i
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] w-72 -translate-x-1/2 -translate-y-full rounded-md border border-white/15 bg-black/95 p-3.5 text-left shadow-lg"
            style={{ left: coords.left, top: coords.top - 10 }}
          >
            <p
              className={`text-base font-semibold uppercase tracking-wide [font-family:var(--font-card-title)] ${TIDE_STATE_TEXT_CLASS[stateName]}`}
            >
              {TIDE_STATE_LABELS[stateName]} · {tideRemainingTurns} tour{tideRemainingTurns > 1 ? "s" : ""} restant
              {tideRemainingTurns > 1 ? "s" : ""}
            </p>
            <p className="mt-1.5 text-sm leading-snug text-slate-300">{TIDE_STATE_EFFECT_TEXT[stateName]}</p>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Ligne de progression de la Marée, horizontale et sans fond, étirée
 * quasiment d'un bout à l'autre de la bande centrale (connecteurs en
 * `flex-1`) — remplace le texte "Marée : Calme (2 tour(s))" au centre du
 * board (la tuile à gauche, `TideOrientationTile`, reste inchangée). 4
 * repères reliés par une piste blanche épaisse : déjà traversés = disque
 * plein, état courant = disque plus grand avec glow (coloré par état), à
 * venir = simple contour éteint. Le segment de piste entre deux repères se
 * remplit progressivement au fil des tours plutôt que d'un bond brut à
 * chaque transition.
 */
export function TideProgressBar({ tideState, tideRemainingTurns }: TideProgressBarProps) {
  const activeIndex = TIDE_ORDER.indexOf(tideState);
  const currentDuration = TIDE_STATE_DURATION[tideState];
  const currentStageFraction = Math.max(0, Math.min(1, (currentDuration - tideRemainingTurns) / currentDuration));

  return (
    <div className="flex w-full items-center">
      {TIDE_ORDER.map((stateName, index) => {
        const isActive = stateName === tideState;
        const isPast = index < activeIndex;
        const isLast = index === TIDE_ORDER.length - 1;
        const connectorFraction = index < activeIndex ? 1 : index === activeIndex ? currentStageFraction : 0;

        return (
          <div key={stateName} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="relative flex h-8 w-8 items-center justify-center">
                {isActive && <TideInfoIcon stateName={stateName} tideRemainingTurns={tideRemainingTurns} />}
                <div
                  className={`rounded-full transition-all duration-500 ease-out ${
                    isActive
                      ? `h-8 w-8 ${TIDE_STATE_FILL_CLASS[stateName]} ${TIDE_STATE_GLOW[stateName]}`
                      : isPast
                        ? `h-5 w-5 ${TIDE_STATE_FILL_CLASS[stateName]}`
                        : "h-5 w-5 border-2 border-white/60 bg-transparent"
                  }`}
                />
              </div>
              <span
                className={`whitespace-nowrap text-sm font-semibold uppercase tracking-wide [font-family:var(--font-card-title)] [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_6px_rgba(0,0,0,0.9)] ${
                  isActive ? TIDE_STATE_TEXT_CLASS[stateName] : isPast ? "text-white/90" : "text-white/60"
                }`}
              >
                {TIDE_STATE_LABELS[stateName]}
              </span>
            </div>

            {!isLast && (
              <div className="relative mx-3 h-2 min-w-[40px] flex-1 overflow-hidden rounded-full bg-white/35">
                <div
                  className="h-full bg-white transition-[width] duration-700 ease-out"
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
