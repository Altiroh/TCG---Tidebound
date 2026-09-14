"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import { PREVIEW_CARD_BACK_SRC } from "@/features/board-preview/PreviewCargo";
import { FLIGHT_MS, type Flight } from "@/features/board-preview/useCardMotion";

/** Effet ponctuel à un point de l'écran : flash d'impact ou dégâts qui s'envolent. */
export interface ImpactFx {
  id: number;
  kind: "flash" | "damage";
  x: number;
  y: number;
  /** Dégâts affichés (`damage`). */
  amount?: number;
  /** Taille de référence (hauteur de la carte touchée) : l'effet suit la taille du board. */
  size: number;
}

interface MotionLayerProps {
  flights: Flight[];
  /** Effets de choc (labo). Le vrai plateau garde ceux d'`AttackImpactLayer`. */
  fx?: ImpactFx[];
}

function FlyingCard({ flight }: { flight: Flight }) {
  const ref = useRef<HTMLDivElement>(null);
  const { from, to, ending, delayMs = 0 } = flight;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // L'élément est posé sur sa DESTINATION ; l'animation part de l'origine.
    const dx = from.x + from.width / 2 - (to.x + to.width / 2);
    const dy = from.y + from.height / 2 - (to.y + to.height / 2);
    const scale = from.width / to.width;
    const keyframes =
      ending === "land"
        ? [
            { transform: `translate(${dx}px, ${dy}px) scale(${scale * 0.85}) rotate(-8deg)`, opacity: 1 },
            { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
          ]
        : [
            { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, opacity: 1 },
            { offset: 0.7, opacity: 0.9 },
            { transform: "translate(0, 0) scale(0.7) rotate(6deg)", opacity: 0 },
          ];
    el.animate(keyframes, { duration: FLIGHT_MS, delay: delayMs, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
  }, [from, to, ending, delayMs]);

  return (
    <div
      ref={ref}
      className={styles.flyingCard}
      // Invisible pendant son attente : l'animation (fill forwards) la rend visible à son départ.
      style={{ left: to.x, top: to.y, width: to.width, opacity: delayMs > 0 ? 0 : undefined }}
    >
      {flight.look.kind === "back" ? (
        // eslint-disable-next-line @next/next/no-img-element -- dos de carte standard : une pioche ne révèle jamais la face en vol
        <img src={PREVIEW_CARD_BACK_SRC} alt="" draggable={false} className={styles.flyingBack} />
      ) : (
        flight.look.node
      )}
    </div>
  );
}

/**
 * Couche des mouvements : cartes en vol (`useCardMotion`) et effets de choc
 * d'une attaque (flash, dégâts qui s'envolent — ceux de l'ancien
 * `AttackImpactLayer`). Plein écran, jamais cliquable.
 */
export function MotionLayer({ flights, fx = [] }: MotionLayerProps) {
  return (
    <div aria-hidden className={styles.motionLayer}>
      {flights.map((flight) => (
        <FlyingCard key={flight.id} flight={flight} />
      ))}
      {fx.map((item) =>
        item.kind === "flash" ? (
          <span
            key={item.id}
            className={styles.fxFlash}
            style={{ left: item.x, top: item.y, width: item.size * 0.6, height: item.size * 0.6 }}
          />
        ) : (
          <span key={item.id} className={styles.fxDamage} style={{ left: item.x, top: item.y, fontSize: item.size * 0.2, ["--rise" as string]: `${-item.size * 0.35}px` }}>
            −{item.amount}
          </span>
        )
      )}
    </div>
  );
}
