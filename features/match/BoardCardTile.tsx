"use client";

import type { CardInstance, TideStateName } from "@/game";
import { CardTile } from "@/features/match/CardTile";

interface BoardCardTileProps {
  instance: CardInstance;
  tideState: TideStateName;
  selected?: boolean;
  onClick?: () => void;
  onShowDetail: () => void;
  widthClassName?: string;
}

/**
 * Carte de plateau : plus d'agrandissement au survol (remplace l'ancien
 * `HoverLiftTile`) — le clic principal reste la sélection de jeu (cible
 * d'attaque, Saborder…), un petit bouton "i" toujours visible en coin
 * ouvre le détail complet (`CardDetailModal`) sans interférer avec cette
 * sélection (`stopPropagation`).
 */
export function BoardCardTile({ instance, tideState, selected, onClick, onShowDetail, widthClassName = "w-28" }: BoardCardTileProps) {
  return (
    <div className="relative">
      <CardTile
        instance={instance}
        tideState={tideState}
        selected={selected}
        onClick={onClick}
        widthClassName={widthClassName}
        scaleOnHover={false}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onShowDetail();
        }}
        aria-label="Voir le détail de la carte"
        title="Voir le détail de la carte"
        className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/50 bg-black/70 text-[10px] font-bold leading-none text-slate-200 transition-colors hover:border-board-accent hover:text-board-accent"
      >
        i
      </button>
    </div>
  );
}
