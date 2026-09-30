"use client";

import { useEffect, useState } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";
import { CarouselPromptFrame } from "@/features/match/CarouselPromptFrame";

interface GraveyardPickPromptProps {
  /** Objet dont le bris demande de choisir une carte de défausse (ex: Grappin de Récupération). */
  sourceCardId: string;
  /** Cartes éligibles, déjà filtrées par le moteur (`graveyardChoicesForBreak`). */
  choices: CardInstance[];
  onConfirm: (card: CardInstance) => void;
  onCancel: () => void;
}

/**
 * Choix d'une carte de sa défausse pour un effet de récupération (retour de
 * test du 13/09) : grandes cartes éligibles sur une rangée qui défile, un clic
 * sélectionne, "Récupérer" confirme. Seules les cartes que le moteur
 * accepterait sont proposées.
 */
export function GraveyardPickPrompt({ sourceCardId, choices, onConfirm, onCancel }: GraveyardPickPromptProps) {
  const [selected, setSelected] = useState<CardInstance | null>(choices.length === 1 ? choices[0]! : null);
  const source = getCardDefinition(sourceCardId);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  return (
    <CarouselPromptFrame
      ariaLabel="Choisir une carte du Cimetière"
      eyebrow={source.name}
      title="Choisis une carte à récupérer"
      description={source.text || undefined}
      onBackdropClick={onCancel}
      status={selected ? `Sélection : ${getCardDefinition(selected.cardId).name}` : "Clique sur une carte pour la sélectionner."}
      actions={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Récupérer
          </button>
        </>
      }
    >
      <CardCarousel cards={choices} selectedInstanceId={selected?.instanceId} onSelect={setSelected} />
    </CarouselPromptFrame>
  );
}
