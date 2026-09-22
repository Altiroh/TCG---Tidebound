"use client";

import { useState } from "react";
import { getCardDefinition, type CardInstance, type HealAllocationChoice } from "@/game";

interface HealAllocationPromptProps {
  choice: HealAllocationChoice;
  /** Plateau du joueur à qui la question est posée. */
  board: CardInstance[];
  onConfirm: (allocation: Array<{ instanceId: string; amount: number }>) => void;
}

/**
 * « Restaurez jusqu'à N Résistance RÉPARTIE entre les unités que vous
 * contrôlez » (Lot 14 — Trousse du Bord, Chirurgien du Bord).
 *
 * Répartir est une décision : soigner d'abord la plus blessée n'est pas
 * toujours le bon coup. L'écran se contente donc de rendre la répartition
 * facile — un clic sur une unité y verse un point, un clic droit le
 * reprend, et le compteur dit ce qu'il reste.
 *
 * Seules les unités BLESSÉES sont proposées : verser un point sur une unité
 * intacte ne ferait rien, et l'offrir laisserait croire le contraire.
 *
 * « Jusqu'à » : valider sans avoir tout réparti est une réponse valable, et
 * ne rien verser aussi.
 */
export function HealAllocationPrompt({ choice, board, onConfirm }: HealAllocationPromptProps) {
  const [parts, setParts] = useState<Record<string, number>>({});

  const blessees = board.filter((unit) => unit.damageMarked > 0);
  const verse = Object.values(parts).reduce((somme, n) => somme + n, 0);
  const restant = choice.budget - verse;

  function verser(unit: CardInstance, delta: number) {
    setParts((current) => {
      const actuel = current[unit.instanceId] ?? 0;
      // On ne verse jamais plus que ce qui reste à répartir, ni plus que
      // les dégâts réellement marqués : un point perdu d'avance n'est pas
      // un choix, c'est un piège.
      const plafond = Math.min(unit.damageMarked, actuel + restant);
      const suivant = Math.max(0, Math.min(plafond, actuel + delta));
      const next = { ...current, [unit.instanceId]: suivant };
      if (suivant === 0) delete next[unit.instanceId];
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-label="Répartir la Résistance restaurée"
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Réparations</p>
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">
            Répartis {choice.budget} Résistance
          </h2>
          <p className="max-w-2xl text-sm text-slate-300">
            {blessees.length === 0
              ? "Aucune de tes unités n'est blessée."
              : "Clique pour en verser un point, clic droit pour le reprendre. Tu peux en verser moins."}
          </p>
        </div>

        <div className="relative flex flex-col gap-2 px-6 pb-2">
          {blessees.map((unit) => {
            const def = getCardDefinition(unit.cardId);
            const part = parts[unit.instanceId] ?? 0;
            return (
              <button
                key={unit.instanceId}
                type="button"
                onClick={() => verser(unit, 1)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  verser(unit, -1);
                }}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/10"
              >
                <span className="text-sm font-medium text-white">{def.name}</span>
                <span className="flex items-center gap-3 text-sm text-slate-300">
                  <span>{unit.damageMarked} dégât{unit.damageMarked > 1 ? "s" : ""}</span>
                  <span className={part > 0 ? "font-semibold text-emerald-300" : "text-slate-500"}>+{part}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {restant} / {choice.budget} encore à répartir
          </span>
          <button
            type="button"
            onClick={() =>
              onConfirm(Object.entries(parts).map(([instanceId, amount]) => ({ instanceId, amount })))
            }
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500"
          >
            Réparer
          </button>
        </div>
      </div>
    </div>
  );
}
