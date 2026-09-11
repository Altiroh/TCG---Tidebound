"use client";

import type { CardInstance, TideStateName } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import { CardBack } from "@/features/match/CardBack";

interface BoardCardTileProps {
  instance: CardInstance;
  tideState: TideStateName;
  selected?: boolean;
  onClick?: () => void;
  onShowDetail: () => void;
  widthClassName?: string;
  /**
   * Structure actuellement invisible pour l'adversaire selon la Marée
   * (`visibleDuringTide` — son propriétaire la voit TOUJOURS, quel que
   * soit l'état de Marée). À ne passer `true` que pour le plateau de
   * l'AUTRE joueur du point de vue du viewer courant — jamais pour son
   * propre plateau. Le slot reste occupé (face cachée), le bouton de
   * détail disparaît (on n'inspecte pas ce qu'on n'a pas identifié).
   */
  hiddenFromViewer?: boolean;
  /**
   * Structure actuellement invisible pour la Marée courante, SUR SON PROPRE plateau : le propriétaire garde
   * les badges de statut (dont "Durée") ET ce bouton "i" pour consulter la carte, mais son illustration/cadre/
   * stats sont remplacés par un dos de carte — voir `CardTile.faceDown`. À l'inverse de `hiddenFromViewer`, ne
   * retire aucune affordance : seul le rendu visuel change.
   */
  faceDown?: boolean;
}

/**
 * Carte de plateau : plus d'agrandissement au survol (remplace l'ancien
 * `HoverLiftTile`) — le clic principal reste la sélection de jeu (cible
 * d'attaque, Saborder…), un petit bouton "i" toujours visible en coin
 * ouvre le détail complet (`CardDetailModal`) sans interférer avec cette
 * sélection (`stopPropagation`).
 */
export function BoardCardTile({
  instance,
  tideState,
  selected,
  onClick,
  onShowDetail,
  widthClassName = "w-28",
  hiddenFromViewer = false,
  faceDown = false,
}: BoardCardTileProps) {
  if (hiddenFromViewer) {
    return (
      <div className="relative cursor-pointer" onClick={onClick} role={onClick ? "button" : undefined}>
        <CardBack widthClassName={widthClassName} />
      </div>
    );
  }

  return (
    <div className="relative">
      <CardTile
        instance={instance}
        tideState={tideState}
        selected={selected}
        onClick={onClick}
        widthClassName={widthClassName}
        scaleOnHover={false}
        faceDown={faceDown}
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
