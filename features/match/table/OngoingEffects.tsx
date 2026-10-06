"use client";

import { useRef, useState, type CSSProperties } from "react";
import { getCardDefinition, type CardInstance, type PlayerId, type TideStateName } from "@/game";
import { cardIllustrationUrl } from "@/features/decks/cardArtUrl";
import { CardTile } from "@/features/match/CardTile";
import { HoverCardPreview } from "@/features/match/table/HoverCardPreview";
import { PORTHOLE_FRAME } from "@/features/match/table/TidePorthole";
import styles from "@/features/match/landes/Landes.module.css";

interface OngoingEffectsProps {
  /** Les effets en cours (Anomalies durables) des deux joueurs, avec leur propriétaire. */
  effects: ReadonlyArray<{ card: CardInstance; ownerId: PlayerId }>;
  viewerId: PlayerId;
  tideState: TideStateName;
  /** Anomalies dont une capacité attend une réponse : leur hublot pulse. */
  pulsingIds?: readonly string[];
}

/**
 * EFFETS EN COURS (05/10/2026) : les Anomalies durables ne sont pas des
 * permanents (`game/rules/ongoing.ts`) — elles ne prennent pas place dans
 * les rangs. Chacune a son hublot à droite de la Marée, à côté de celui de
 * la Lande : son illustration derrière le verre, ses tours restants dans le
 * médaillon (un sablier pour « jusqu'à la fin du tour »), la lueur de son
 * camp (bleue pour toi, rouge pour l'adversaire), la carte en grand au survol.
 */
export function OngoingEffects({ effects, viewerId, tideState, pulsingIds }: OngoingEffectsProps) {
  if (effects.length === 0) return null;
  return (
    <div className={styles.ongoingList}>
      {effects.map(({ card, ownerId }) => (
        <OngoingBadge key={card.instanceId} card={card} mine={ownerId === viewerId} tideState={tideState} pulsing={pulsingIds?.includes(card.instanceId) ?? false} />
      ))}
    </div>
  );
}

function OngoingBadge({ card, mine, tideState, pulsing }: { card: CardInstance; mine: boolean; tideState: TideStateName; pulsing: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<DOMRect | null>(null);
  const [art, setArt] = useState(true);
  const def = getCardDefinition(card.cardId);
  const remaining = def.expiresAtEndOfTurn ? null : card.turnsRemaining;
  const label = `${def.name} (${mine ? "toi" : "adversaire"}) — ${
    remaining === null ? "jusqu'à la fin du tour" : remaining !== undefined ? `${remaining} tour${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""}` : "en cours"
  }`;
  return (
    <div
      ref={ref}
      data-ui-obstacle=""
      className={`${styles.badge} ${styles.ongoingBadge} ${pulsing ? "animate-reaction-pulse" : ""}`}
      role="img"
      aria-label={label}
      data-side={mine ? "mine" : "theirs"}
      style={{ "--lande-rgb": mine ? "96, 170, 255" : "248, 113, 113" } as CSSProperties}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && ref.current) setPreview(ref.current.getBoundingClientRect());
      }}
      onPointerLeave={() => setPreview(null)}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse" || !ref.current) return;
        setPreview((rect) => (rect ? null : ref.current!.getBoundingClientRect()));
      }}
    >
      <span className={styles.badgeWindow}>
        {/* eslint-disable-next-line @next/next/no-img-element -- illustration locale */}
        <img
          src={art ? cardIllustrationUrl(card.cardId) : "/assets/cards/frames/nouveau/types/anomalie.webp"}
          alt=""
          draggable={false}
          className={art ? styles.badgeArt : styles.badgeGlyph}
          onError={() => setArt(false)}
        />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img src={PORTHOLE_FRAME} alt="" draggable={false} className={styles.badgeFrame} />
      <span className={styles.badgeCount}>{remaining === null ? "⌛" : (remaining ?? "∞")}</span>
      {preview && (
        <HoverCardPreview anchor={preview} portal>
          <CardTile instance={card} tideState={tideState} widthClassName="w-full" scaleOnHover={false} showStatusBadges={false} />
        </HoverCardPreview>
      )}
    </div>
  );
}
