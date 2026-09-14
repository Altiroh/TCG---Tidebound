"use client";

import { getCardDefinition, HIDDEN_CARD_ID } from "@/game";
import { useImageOk } from "@/features/match/useImageOk";

interface CardThumbProps {
  /** Carte à représenter — absente ou `HIDDEN_CARD_ID` : pastille neutre "?" (jamais d'identité révélée). */
  cardId?: string;
  /** Image alternative (ex: illustration d'un Navire ciblé) quand ce n'est pas une carte. */
  src?: string;
  /** Pictogramme de repli quand il n'y a ni carte ni image (Marée, dégâts…). */
  glyph?: string;
  size?: number;
  /** Classes de bordure/couleur du repli (ex: teinte buff/malus). */
  className?: string;
  glyphClassName?: string;
}

/**
 * Miniature carrée d'une carte (illustration recadrée) — partagée par le
 * journal de partie (`EventFeed`) et la liste des effets appliqués
 * (`AppliedEffectsList`). Le nom complet reste accessible au survol.
 */
export function CardThumb({ cardId, src, glyph, size = 28, className = "border-white/20", glyphClassName = "text-slate-200" }: CardThumbProps) {
  const isCard = Boolean(cardId) && cardId !== HIDDEN_CARD_ID;
  const imageUrl = src ?? (isCard ? `/assets/cards/illustrations/${cardId}.webp` : "");
  const imageOk = useImageOk(imageUrl);
  const name = isCard ? getCardDefinition(cardId!).name : undefined;
  const fallback = glyph ?? (isCard ? name!.charAt(0) : "?");

  return (
    <span
      title={name}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white/10 ${className}`}
      style={{ width: size, height: size }}
    >
      {imageUrl && imageOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- asset local, miniature
        <img src={imageUrl} alt="" draggable={false} className="h-full w-full select-none object-cover" />
      ) : (
        <span className={`font-bold ${glyphClassName}`} style={{ fontSize: size * 0.45 }}>
          {fallback}
        </span>
      )}
    </span>
  );
}
