"use client";

import { useState } from "react";
import { getCardDefinition, type CardInstance, type KeepUnitsChoice, UNIT_CARD_TYPES } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";

interface KeepUnitsPromptProps {
  choice: KeepUnitsChoice;
  /** Plateau du joueur à qui la question est posée. */
  board: CardInstance[];
  onConfirm: (instanceIds: string[]) => void;
}

/**
 * « Chaque joueur choisit jusqu'à N unités qu'il contrôle. Détruisez toutes
 * les autres. » (Lot 14 — Chacun sa Place, Abandonnez le Navire !).
 *
 * Un board wipe À CHOIX : c'est ce qui le distingue d'une destruction
 * totale, et ce qui en fait une carte jouable des deux côtés de la table.
 * Chacun répond à son tour, et rien ne part avant que les deux aient
 * répondu — l'écran doit donc dire clairement que ce qu'on ne garde pas est
 * perdu, sans quoi on croit choisir ce qu'on détruit.
 *
 * Même forme que les autres écrans de désignation : une rangée de grandes
 * cartes, un clic sélectionne, un bouton confirme.
 */
export function KeepUnitsPrompt({ choice, board, onConfirm }: KeepUnitsPromptProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const unites = board.filter((unit) => UNIT_CARD_TYPES.includes(getCardDefinition(unit.cardId).type));

  function toggle(card: CardInstance) {
    setSelected((current) => {
      if (current.includes(card.instanceId)) return current.filter((id) => id !== card.instanceId);
      const next = [...current, card.instanceId];
      // Une de trop chasse la plus ancienne : sélectionner reste un geste.
      return next.length > choice.keep ? next.slice(next.length - choice.keep) : next;
    });
  }

  const perdues = unites.length - selected.length;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-label="Choisir les unités à garder"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sauve ce que tu peux</p>
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">
            {choice.keep > 1 ? `Garde jusqu'à ${choice.keep} unités` : "Garde une unité"}
          </h2>
          <p className="max-w-2xl text-sm text-slate-300">
            {unites.length === 0
              ? "Tu ne contrôles aucune unité."
              : "Toutes celles que tu ne gardes pas seront détruites."}
          </p>
        </div>

        <div className="relative pb-2">
          <CardCarousel cards={unites} selectedInstanceIds={selected} onSelect={toggle} emptyLabel="Aucune unité sur ton plateau." />
        </div>

        <div className="relative flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {perdues > 0
              ? `${perdues} unité${perdues > 1 ? "s" : ""} sera${perdues > 1 ? "ont" : ""} détruite${perdues > 1 ? "s" : ""}`
              : "Tout ton plateau est sauvé."}
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
