"use client";

import { useRef, useState } from "react";
import type { CardInstance, TideStateName } from "@/game";
import { CardTile } from "@/features/match/CardTile";

interface HandFanProps {
  cards: CardInstance[];
  tideState: TideStateName;
  selectedInstanceId?: string;
  disabled?: boolean;
  draggable?: boolean;
  draggingId?: string | null;
  onDragStart?: (e: React.DragEvent, instanceId: string) => void;
  onDragEnd?: () => void;
  onClick: (instanceId: string) => void;
}

/** Largeur de base d'une carte de main (nettement plus grande que le standard `w-28` des autres contextes). */
const BASE_WIDTH = "w-36";
/** Largeur de la carte survolée, "levée" du rang — assez grande pour que le texte de règles reste lisible. */
const HOVER_WIDTH = "w-64";

const MAX_ROTATION_DEG = 26;
const MAX_ARC_DROP_PX = 26;
const OVERLAP_PX = 38;

/**
 * Rang de main en léger arc-de-cercle : chaque carte tourne et descend
 * légèrement en s'éloignant du centre (façon éventail), en se chevauchant.
 * Au survol, la carte se lève du rang (translation vers le haut, agrandie,
 * remise à plat) — le texte de règles est toujours visible sur `CardTile`,
 * survolée ou non. Remplace l'ancien aperçu flottant (`CardHoverPreview`,
 * retiré : l'info est désormais directement portée par la carte elle-même).
 */
export function HandFan({
  cards,
  tideState,
  selectedInstanceId,
  disabled,
  draggable,
  draggingId,
  onDragStart,
  onDragEnd,
  onClick,
}: HandFanProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** Clones invisibles (hors écran), un par carte, TOUJOURS à `BASE_WIDTH` — servent uniquement d'image de glissement native (`setDragImage`) pour que la carte glissée ne parte pas "figée en grand" quand le survol était actif au moment du `dragstart` (React ne rafraîchit pas forcément le DOM à temps pour le cliché synchrone que prend le navigateur). */
  const dragImageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const count = cards.length;
  const angleStep = count > 1 ? Math.min(8, MAX_ROTATION_DEG / ((count - 1) / 2)) : 0;

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] -top-[9999px]">
        {cards.map((card) => (
          <div
            key={card.instanceId}
            ref={(el) => {
              dragImageRefs.current[card.instanceId] = el;
            }}
          >
            <CardTile instance={card} tideState={tideState} widthClassName={BASE_WIDTH} />
          </div>
        ))}
      </div>

      <div className="flex items-end justify-center">
        {cards.map((card, index) => {
          const offsetFromCenter = index - (count - 1) / 2;
          const rotation = offsetFromCenter * angleStep;
          const arcDrop = Math.min(MAX_ARC_DROP_PX, Math.abs(offsetFromCenter) * 6);
          const isDraggingThis = draggingId === card.instanceId;
          const isHovered = hoveredId === card.instanceId;
          // Une carte en cours de glissement ne doit plus se comporter comme survolée :
          // taille/position classiques dans le rang, l'image native suit la souris.
          const isEnlarged = isHovered && !isDraggingThis;

          return (
            <div
              key={card.instanceId}
              draggable={draggable && !disabled}
              onDragStart={(e) => {
                const dragImage = dragImageRefs.current[card.instanceId];
                if (dragImage) {
                  const rect = dragImage.getBoundingClientRect();
                  e.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2);
                }
                setHoveredId(null);
                onDragStart?.(e, card.instanceId);
              }}
              onDragEnd={onDragEnd}
              onMouseEnter={() => setHoveredId(card.instanceId)}
              onMouseLeave={() => setHoveredId((current) => (current === card.instanceId ? null : current))}
              className="pointer-events-auto origin-bottom rounded-xl transition-transform duration-150 ease-out"
              style={{
                marginLeft: index === 0 ? 0 : -OVERLAP_PX,
                zIndex: isEnlarged ? 40 : index,
                transform: isEnlarged
                  ? "translateY(-80px) scale(1.08) rotate(0deg)"
                  : `translateY(${arcDrop}px) rotate(${rotation}deg)`,
                opacity: isDraggingThis ? 0.5 : 1,
                boxShadow: isDraggingThis ? "0 0 25px 6px rgba(125,211,252,0.65)" : undefined,
              }}
            >
              <CardTile
                instance={card}
                tideState={tideState}
                selected={selectedInstanceId === card.instanceId}
                disabled={disabled}
                onClick={() => onClick(card.instanceId)}
                widthClassName={isEnlarged ? HOVER_WIDTH : BASE_WIDTH}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
