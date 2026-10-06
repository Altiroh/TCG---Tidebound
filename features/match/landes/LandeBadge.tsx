"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getCardDefinition, landeRemainingTableTurns, type ActiveLande, type CardInstance, type EnvironmentState, type TideStateName } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import { HoverCardPreview } from "@/features/match/table/HoverCardPreview";
import { PORTHOLE_FRAME } from "@/features/match/table/TidePorthole";
import { landeScene } from "@/features/match/landes/landeScenes";
import styles from "@/features/match/landes/Landes.module.css";

interface LandeBadgeProps {
  environment: EnvironmentState;
  tideState: TideStateName;
  /** Une Lande est en train d'être glissée depuis la main : le hublot devient la cible de dépôt. */
  dropState: "idle" | "ready" | "over";
}

/**
 * La Lande en jeu, À DROITE de la piste de Marée : un hublot du même cuivre
 * que ceux de la Marée, son illustration derrière le verre, et le nombre de
 * TOURS DE TABLE restants dans le médaillon. Rien d'autre sur la table — la
 * scène (`LandeLayer`) dit déjà qu'elle est là.
 *
 * Survol (souris) : la carte en grand, pour relire ce qu'elle change. Au
 * doigt, un toucher l'ouvre, un toucher ailleurs la referme.
 *
 * Sans Lande, le hublot reste vide et éteint ; il ne s'éclaire que pendant
 * le glisser d'une Lande, pour dire où la poser.
 */
export function LandeBadge({ environment, tideState, dropState }: LandeBadgeProps) {
  const lande = environment.lande;
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<DOMRect | null>(null);
  const [touchOpen, setTouchOpen] = useState(false);

  useEffect(() => {
    if (!touchOpen) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setTouchOpen(false);
        setPreview(null);
      }
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [touchOpen]);

  if (!lande && dropState === "idle") return <div className={styles.badgeSlot} data-drop="lande" />;

  const remaining = lande ? landeRemainingTableTurns(environment) : 0;
  const def = lande ? getCardDefinition(lande.cardId) : undefined;
  const scene = lande ? landeScene(lande.cardId) : undefined;
  const label = def ? `${def.name} — ${remaining} tour${remaining > 1 ? "s" : ""} de table restant${remaining > 1 ? "s" : ""}` : "Poser la Lande ici";

  return (
    <div className={styles.badgeSlot} data-drop="lande">
      <div
        ref={ref}
        className={styles.badge}
        data-ui-obstacle=""
        data-drop-state={dropState}
        data-empty={lande ? undefined : ""}
        role={lande ? "img" : undefined}
        aria-label={label}
        title={lande ? undefined : label}
        style={scene ? ({ "--lande-rgb": scene.rgb } as CSSProperties) : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && lande && ref.current) setPreview(ref.current.getBoundingClientRect());
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setPreview(null);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "mouse" || !lande || !ref.current) return;
          setTouchOpen((open) => !open);
          setPreview((rect) => (rect ? null : ref.current!.getBoundingClientRect()));
        }}
      >
        <span className={styles.badgeWindow}>
          {lande && <LandeWindow lande={lande} />}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img src={PORTHOLE_FRAME} alt="" draggable={false} className={styles.badgeFrame} />
        {lande && <span className={styles.badgeCount}>{remaining}</span>}
      </div>
      {preview && lande && (
        <HoverCardPreview anchor={preview} portal>
          <CardTile instance={asInstance(lande)} tideState={tideState} widthClassName="w-full" scaleOnHover={false} showStatusBadges={false} />
        </HoverCardPreview>
      )}
    </div>
  );
}

/** L'illustration de la Lande derrière le verre ; à défaut, le glyphe du type. */
function LandeWindow({ lande }: { lande: ActiveLande }) {
  const [art, setArt] = useState<"illustration" | "glyph">("illustration");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- illustration locale
    <img
      key={`${lande.cardId}-${art}`}
      src={art === "illustration" ? `/assets/cards/illustrations/${lande.cardId}.webp` : "/assets/cards/frames/nouveau/types/lande.webp"}
      alt=""
      draggable={false}
      className={art === "illustration" ? styles.badgeArt : styles.badgeGlyph}
      onError={() => setArt("glyph")}
    />
  );
}

function asInstance(lande: ActiveLande): CardInstance {
  return {
    instanceId: lande.instanceId,
    cardId: lande.cardId,
    ownerId: lande.ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}
