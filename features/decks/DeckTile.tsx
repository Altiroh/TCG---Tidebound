"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerDeckSummary } from "@/app/decks/actions";
import { BORDER_SUBTLE, RADIUS_MD, SHADOW_PANEL, SURFACE_1, TEXT_PRIMARY, TEXT_SECONDARY, TRANSITION } from "@/components/game-ui/tokens";

const EMPTY_SLOT_SRC = "/assets/collection/card_empty_placeholder.png";

/** Léger éventail statique des 5 premières cartes du deck, en en-tête de la tuile — volontairement simple ("on pimpera plus tard"). */
function DeckHeaderStack({ cardIds }: { cardIds: string[] }) {
  if (cardIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local, silhouette décorative */}
        <img src={EMPTY_SLOT_SRC} alt="" className="h-[85%] rounded-sm object-cover opacity-50" />
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
            className="absolute h-[80%] w-[46%] overflow-hidden rounded-sm shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
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
      className={`group flex aspect-[5/7] w-full flex-col overflow-hidden text-left ${SURFACE_1} ${BORDER_SUBTLE} ${RADIUS_MD} ${SHADOW_PANEL} ${TRANSITION} hover:-translate-y-0.5 hover:border-[var(--accent)]/50`}
    >
      <div className="h-[58%] bg-black/20">
        <DeckHeaderStack cardIds={deck.headerCardIds} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 border-t border-[var(--border-subtle)] px-2 text-center">
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
            className={`w-full border-b border-[var(--accent)] bg-transparent px-1.5 py-0.5 text-center text-sm font-semibold ${TEXT_PRIMARY} outline-none`}
          />
        ) : (
          <span className={`w-full truncate text-sm font-semibold ${TEXT_PRIMARY}`}>{deck.name}</span>
        )}
        <span className={`text-[11px] ${TEXT_SECONDARY}`}>
          {shipName} · {deck.cardCount} carte{deck.cardCount > 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}
