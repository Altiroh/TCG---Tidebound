"use client";

import { useEffect, useState } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";

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
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md" onClick={onCancel}>
      <div
        role="dialog"
        aria-label="Choisir une carte du Cimetière"
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{source.name}</p>
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">Choisis une carte à récupérer</h2>
          {source.text && <p className="max-w-2xl text-sm text-slate-300">{source.text}</p>}
        </div>

        <div className="relative pb-2">
          <CardCarousel cards={choices} selectedInstanceId={selected?.instanceId} onSelect={setSelected} />
        </div>

        <div className="relative flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {selected ? `Sélection : ${getCardDefinition(selected.cardId).name}` : "Clique sur une carte pour la sélectionner."}
          </span>
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
        </div>
      </div>
    </div>
  );
}
