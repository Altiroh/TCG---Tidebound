"use client";

import { useEffect } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
import { CardTile } from "@/features/match/CardTile";

interface ObjectBreakPromptProps {
  card: CardInstance;
  /** "hand" : Bris depuis la main (coût réduit). "board" : Objet posé — le Sabordage reste proposé en alternative. */
  source: "hand" | "board";
  /** Bris depuis la main : coût réellement dû et Raison résultante (`previewHandBreakReason`). */
  handCost?: { cost: number; reasonAfter: number; allowed: boolean };
  onBreak: () => void;
  onScuttle?: () => void;
  onCancel: () => void;
}

/**
 * Confirmation ouverte quand un Objet est glissé sur le crâne (retour de test
 * du 13/09) : on demande si l'on veut ACTIVER son effet de bris, plutôt que
 * de le défausser ou de le saborder en silence — un Sabordage ne résout jamais
 * l'effet de bris ("Briser ≠ Saborder").
 */
export function ObjectBreakPrompt({ card, source, handCost, onBreak, onScuttle, onCancel }: ObjectBreakPromptProps) {
  const def = getCardDefinition(card.cardId);

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

  const blocked = source === "hand" && handCost !== undefined && !handCost.allowed;
  const deraison = source === "hand" && handCost !== undefined && handCost.allowed && handCost.reasonAfter < 0;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/65 p-6 backdrop-blur-md" onClick={onCancel}>
      <div
        role="dialog"
        aria-label={`Briser ${def.name}`}
        onClick={(event) => event.stopPropagation()}
        className="relative flex w-full max-w-xl flex-col gap-5 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:flex-row"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/15 to-transparent" />
        <div className="pointer-events-none relative mx-auto w-40 shrink-0">
          <CardTile instance={card} tideState="calme" widthClassName="w-40" scaleOnHover={false} badgeSize={40} />
        </div>

        <div className="relative flex flex-1 flex-col gap-3 [font-family:var(--font-card-body)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {source === "hand" ? "Briser depuis la main" : "Objet sur le plateau"}
            </p>
            <h2 className="text-xl font-semibold text-white [font-family:var(--font-card-title)]">Activer l&apos;effet de bris ?</h2>
          </div>

          {def.text && <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-slate-200">{def.text}</p>}

          {source === "hand" && handCost && (
            <p className="text-sm text-slate-300">
              Coût : <span className="font-semibold text-sky-300">{handCost.cost} Raison</span>
              <span className="text-slate-400"> (moitié du coût imprimé, sans occuper de Slot)</span>
            </p>
          )}
          {deraison && (
            <p className="text-sm text-amber-200">Ta Raison passera à {handCost!.reasonAfter} : tu entreras en Déraison.</p>
          )}
          {blocked && <p className="text-sm text-rose-300">Pas assez de Raison pour briser cet Objet depuis la main.</p>}
          {source === "board" && (
            <p className="text-xs text-slate-400">Saborder l&apos;envoie au cimetière sans résoudre son effet de bris.</p>
          )}

          <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Annuler
            </button>
            {onScuttle && (
              <button
                type="button"
                onClick={onScuttle}
                className="rounded-md border border-white/15 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-rose-400/60 hover:text-rose-200"
              >
                Saborder sans effet
              </button>
            )}
            <button
              type="button"
              onClick={onBreak}
              disabled={blocked}
              className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Briser et activer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
