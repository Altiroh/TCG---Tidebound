"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerDeckSummary } from "@/app/decks/actions";

const EMPTY_SLOT_SRC = "/assets/collection/card_empty_placeholder.png";

/** Léger éventail statique des 5 premières cartes du deck, en en-tête de la tuile — volontairement simple ("on pimpera plus tard"). */
function DeckHeaderStack({ cardIds }: { cardIds: string[] }) {
  if (cardIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local, silhouette décorative */}
        <img src={EMPTY_SLOT_SRC} alt="" className="h-[85%] rounded-sm object-cover opacity-60 shadow-md" />
      </div>
    );
  }

  const count = cardIds.length;
  return (
    <div className="relative flex h-full items-center justify-center">
      {cardIds.map((cardId, index) => {
        const offsetFromCenter = index - (count - 1) / 2;
        return (
          <div
            key={cardId}
            className="absolute h-[80%] w-[46%] overflow-hidden rounded-sm border border-amber-100/20 shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
            style={{
              transform: `translateX(${offsetFromCenter * 34}%) rotate(${offsetFromCenter * 9}deg)`,
              zIndex: index,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- vignette d'aperçu, pas une CardTile complète */}
            <img
              src={`/assets/cards/illustrations/${cardId}.png`}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        );
      })}
    </div>
  );
}

interface DeckTileProps {
  deck: PlayerDeckSummary;
  shipName: string;
  isRenaming: boolean;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

export function DeckTile({ deck, shipName, isRenaming, onRenameSubmit, onRenameCancel, onOpen, onContextMenu }: DeckTileProps) {
  const [draftName, setDraftName] = useState(deck.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setDraftName(deck.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming, deck.name]);

  return (
    <button
      type="button"
      onClick={isRenaming ? undefined : onOpen}
      onContextMenu={onContextMenu}
      className="group flex aspect-[5/7] w-full flex-col overflow-hidden rounded-xl border-2 border-amber-700/60 bg-gradient-to-b from-slate-800 to-slate-950 text-left shadow-[0_6px_18px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-0.5 hover:border-amber-500/80"
    >
      <div className="h-[58%] bg-slate-950/60">
        <DeckHeaderStack cardIds={deck.headerCardIds} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 border-t border-amber-700/40 px-2 text-center">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameSubmit(draftName);
              if (e.key === "Escape") onRenameCancel();
            }}
            onBlur={() => onRenameSubmit(draftName)}
            className="w-full rounded border border-board-accent bg-slate-900 px-1.5 py-0.5 text-center text-sm font-semibold text-amber-50 outline-none"
          />
        ) : (
          <span className="w-full truncate text-sm font-semibold text-amber-50 [font-family:var(--font-menu)]">{deck.name}</span>
        )}
        <span className="text-[11px] text-amber-200/60">
          {shipName} · {deck.cardCount} carte{deck.cardCount > 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}
