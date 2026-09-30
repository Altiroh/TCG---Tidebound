"use client";

import { useState } from "react";
import { getCardDefinition, type CardInstance, type PickUnitsChoice } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";
import { CarouselPromptFrame } from "@/features/match/CarouselPromptFrame";

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
    <CarouselPromptFrame
      ariaLabel="Désigner les unités visées"
      eyebrow="Cibles"
      title={choice.pick > 1 ? `Désigne jusqu'à ${choice.pick} unités` : "Désigne une unité"}
      description={cibles.length === 0 ? "Aucune cible légale." : "Tu peux en désigner moins."}
      status={
        selected.length > 0
          ? selected.map((id) => getCardDefinition(cibles.find((c) => c.instanceId === id)!.cardId).name).join(", ")
          : `0 / ${choice.pick} désignée${choice.pick > 1 ? "s" : ""}`
      }
      actions={
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500"
        >
          Confirmer
        </button>
      }
    >
      <CardCarousel cards={cibles} selectedInstanceIds={selected} onSelect={toggle} emptyLabel="Aucune cible légale." />
    </CarouselPromptFrame>
  );
}
