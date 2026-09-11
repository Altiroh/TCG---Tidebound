"use client";

import { useState } from "react";
import type { CardInstance, TideStateName } from "@/game";
import { CardTile } from "@/features/match/CardTile";

interface HoverLiftTileProps {
  instance: CardInstance;
  tideState: TideStateName;
  selected?: boolean;
  onClick?: () => void;
  widthClassName?: string;
  hoverWidthClassName?: string;
}

/**
 * Enveloppe une `CardTile` de plateau : au survol, la carte se lève
 * légèrement, s'agrandit et passe en version détail (texte de règles
 * affiché) — même principe que `HandFan` pour la main, sans l'arc.
 * Remplace l'ancien aperçu flottant (`CardHoverPreview`, retiré).
 */
export function HoverLiftTile({
  instance,
  tideState,
  selected,
  onClick,
  widthClassName = "w-28",
  hoverWidthClassName = "w-44",
}: HoverLiftTileProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="origin-center transition-transform duration-150 ease-out"
      style={{
        zIndex: hovered ? 40 : undefined,
        transform: hovered ? "translateY(-18px) scale(1.08)" : undefined,
      }}
    >
      <CardTile
        instance={instance}
        tideState={tideState}
        selected={selected}
        onClick={onClick}
        widthClassName={hovered ? hoverWidthClassName : widthClassName}
        variant={hovered ? "detail" : "preview"}
      />
    </div>
  );
}
