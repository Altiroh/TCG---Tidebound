"use client";

import { useState } from "react";
import { getCardDefinition, type CardInstance, type PickUnitsChoice } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";

interface PickUnitsPromptProps {
  choice: PickUnitsChoice;
  /** Les deux plateaux : une cible légale peut être de n'importe quel côté. */
  allUnits: CardInstance[];
  onConfirm: (instanceIds: string[]) => void;
}

/**
 * « Renvoyez jusqu'à N unités […] » (Panique sur le Pont, Lot 14).
 *
 * `chosenUnit` ne désigne qu'une cible, et la désignation se fait alors en
 * pointant directement sur le plateau. Dès qu'un texte en vise PLUSIEURS, il
 * faut un moment où l'on compose sa sélection avant de valider — d'où cet
 * écran, de la même forme que les autres désignations.
 *
 * Les cibles proposées sont exactement celles que le moteur acceptera : la
 * liste vient de lui (`choice.among`), calculée avec le filtre de l'effet.
 */
export function PickUnitsPrompt({ choice, allUnits, onConfirm }: PickUnitsPromptProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const cibles = choice.among
    .map((instanceId) => allUnits.find((unit) => unit.instanceId === instanceId))
    .filter((unit): unit is CardInstance => unit !== undefined);

  function toggle(card: CardInstance) {
    setSelected((current) => {
      if (current.includes(card.instanceId)) return current.filter((id) => id !== card.instanceId);
      const next = [...current, card.instanceId];
      return next.length > choice.pick ? next.slice(next.length - choice.pick) : next;
    });
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-label="Désigner les unités visées"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cibles</p>
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">
            {choice.pick > 1 ? `Désigne jusqu'à ${choice.pick} unités` : "Désigne une unité"}
          </h2>
          <p className="max-w-2xl text-sm text-slate-300">
            {cibles.length === 0 ? "Aucune cible légale." : "Tu peux en désigner moins."}
          </p>
        </div>

        <div className="relative pb-2">
          <CardCarousel cards={cibles} selectedInstanceIds={selected} onSelect={toggle} emptyLabel="Aucune cible légale." />
        </div>

        <div className="relative flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {selected.length > 0
              ? selected.map((id) => getCardDefinition(cibles.find((c) => c.instanceId === id)!.cardId).name).join(", ")
              : `0 / ${choice.pick} désignée${choice.pick > 1 ? "s" : ""}`}
          </span>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
