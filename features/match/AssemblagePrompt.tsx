"use client";

import { useMemo, useState } from "react";
import {
  CHROMATIC_COLOR_LABELS,
  chromaticColorsOf,
  findAssemblage,
  getCardDefinition,
  isSentinel,
  type CardInstance,
  type ChromaticColor,
} from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";

interface AssemblagePromptProps {
  /** La carte à Assemblage que le joueur veut jouer (Le Géant Chromatique). */
  card: CardInstance;
  /** Plateau du joueur : les Sentinelles s'y choisissent. */
  board: CardInstance[];
  /** Assemblage confirmé : les Sentinelles et la couleur que chacune porte. */
  onAssemble: (assemblage: Array<{ instanceId: string; color: ChromaticColor }>) => void;
  /** Jouer la carte à son coût normal. */
  onPlayNormally: () => void;
  onCancel: () => void;
}

/**
 * « Assemblage Chromatique » (Lot 15) : le joueur désigne les Sentinelles
 * qu'il place au Cimetière — c'est SA décision, le moteur ne choisit pas
 * lesquelles partent. Seule l'affectation des couleurs, pour une Sentinelle
 * qui en porte plusieurs, est déduite : n'importe quelle affectation valide
 * de ces Sentinelles-là donne le même Assemblage.
 */
export function AssemblagePrompt({ card, board, onAssemble, onPlayNormally, onCancel }: AssemblagePromptProps) {
  const def = getCardDefinition(card.cardId);
  const requis = def.chromaticAssemblage?.sentinels ?? 4;
  const cout = def.chromaticAssemblage?.reasonCost ?? 0;
  const sentinelles = useMemo(() => board.filter(isSentinel), [board]);
  const [selected, setSelected] = useState<string[]>([]);

  const choisies = sentinelles.filter((unit) => selected.includes(unit.instanceId));
  const assemblage = choisies.length === requis ? findAssemblage(choisies, requis) : undefined;

  function toggle(unit: CardInstance) {
    setSelected((current) => {
      if (current.includes(unit.instanceId)) return current.filter((id) => id !== unit.instanceId);
      const next = [...current, unit.instanceId];
      return next.length > requis ? next.slice(next.length - requis) : next;
    });
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-label={`Assemblage de ${def.name}`}
        className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Assemblage Chromatique</p>
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">{def.name}</h2>
          <p className="max-w-2xl text-sm text-slate-300">
            Désigne {requis} Sentinelles de couleurs différentes : elles vont au Cimetière sans être détruites, et la
            carte se joue pour {cout} Raison.
          </p>
        </div>

        <div className="relative pb-2">
          <CardCarousel
            cards={sentinelles}
            selectedInstanceIds={selected}
            onSelect={toggle}
            renderCaption={(unit) => (
              <span className="text-xs text-slate-300">
                {chromaticColorsOf(unit, board)
                  .map((color) => CHROMATIC_COLOR_LABELS[color])
                  .join(" · ") || "Sans couleur"}
              </span>
            )}
            emptyLabel="Aucune Sentinelle en jeu."
          />
        </div>

        <div className="relative flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {choisies.length}/{requis} désignées
            {choisies.length === requis && !assemblage ? " — il faut des couleurs différentes" : ""}
          </span>
          <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-slate-300 hover:text-white">
            Annuler
          </button>
          <button
            type="button"
            onClick={onPlayNormally}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Coût normal ({def.cost} Raison)
          </button>
          <button
            type="button"
            disabled={!assemblage}
            onClick={() => assemblage && onAssemble(assemblage)}
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Assembler ({cout} Raison)
          </button>
        </div>
      </div>
    </div>
  );
}
