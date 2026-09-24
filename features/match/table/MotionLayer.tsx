"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "@/features/match/table/Table.module.css";
import { useCardBackSrcFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import { FLIGHT_MS, SHATTER_MS, type Flight } from "@/features/match/table/useCardMotion";

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
  // Une carte piochée vole avec le dos de celui qui la pioche.
  const cardBack = useCardBackSrcFor(flight.look.kind === "back" ? flight.look.ownerId : undefined);
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
        <img src={cardBack} alt="" draggable={false} className={styles.flyingBack} />
      ) : (
        flight.look.node
      )}
    </div>
  );
}

/**
 * Éclats d'une carte brisée, en pourcentages de la carte. Tous partent du
 * même point d'impact (un peu au-dessus du centre) : la carte casse en
 * étoile, comme un verre qu'on frappe.
 */
const IMPACT = [48, 44] as const;
const SHARD_RIM: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [42, 0],
  [100, 0],
  [100, 36],
  [100, 100],
  [58, 100],
  [0, 100],
  [0, 62],
];
const SHARDS = SHARD_RIM.map((point, index) => {
  const next = SHARD_RIM[(index + 1) % SHARD_RIM.length]!;
  const polygon = [IMPACT, point, next];
  const cx = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const cy = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  return { clip: `polygon(${polygon.map(([x, y]) => `${x}% ${y}%`).join(", ")})`, cx, cy };
});

/**
 * Carte DÉTRUITE : elle tremble et se fissure là où elle était, éclate, puis
 * ses éclats convergent vers le Cimetière (`to`) en rétrécissant. Quand
 * `to` est sa propre place (un jeton, qui ne va nulle part), les éclats
 * retombent et s'éteignent sur place.
 */
function ShatteringCard({ flight }: { flight: Flight }) {
  const ref = useRef<HTMLDivElement>(null);
  const { from, to } = flight;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const animations: Animation[] = [];
    const gx = to.x + to.width / 2;
    const gy = to.y + to.height / 2;
    const stays = to.x === from.x && to.y === from.y;
    const shards = Array.from(el.querySelectorAll<HTMLElement>("[data-shard]"));
    shards.forEach((shard, index) => {
      const { cx, cy } = SHARDS[index]!;
      // Écart de l'éclat par rapport au point d'impact : c'est dans cette direction qu'il saute.
      const ox = ((cx - IMPACT[0]) / 100) * from.width;
      const oy = ((cy - IMPACT[1]) / 100) * from.height;
      const norm = Math.hypot(ox, oy) || 1;
      const burst = from.width * 0.16;
      const bx = (ox / norm) * burst;
      const by = (oy / norm) * burst;
      const spin = (index % 2 === 0 ? 1 : -1) * (10 + ((index * 7) % 12));
      // Arrivée : le centre de l'éclat sur le crâne du Cimetière — ou, sans destination, une chute sur place.
      const ex = stays ? bx * 1.6 : gx - (from.x + (cx / 100) * from.width);
      const ey = stays ? by * 1.6 + from.height * 0.35 : gy - (from.y + (cy / 100) * from.height);
      shard.style.transformOrigin = `${cx}% ${cy}%`;
      animations.push(
        shard.animate(
          [
            { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
            { transform: "translate(-3px, 1px) rotate(0deg) scale(1)", opacity: 1, offset: 0.08 },
            { transform: "translate(3px, -1px) rotate(0deg) scale(1)", opacity: 1, offset: 0.16 },
            { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, offset: 0.24, easing: "cubic-bezier(.1,.8,.3,1)" },
            { transform: `translate(${bx}px, ${by}px) rotate(${spin}deg) scale(0.96)`, opacity: 1, offset: 0.42, easing: "cubic-bezier(.5,0,.3,1)" },
            {
              transform: `translate(${ex}px, ${ey}px) rotate(${spin * 3}deg) scale(${stays ? 0.7 : 0.22})`,
              opacity: 0,
            },
          ],
          { duration: SHATTER_MS, delay: index * 14, easing: "linear", fill: "forwards" }
        )
      );
    });
    // Les fissures s'allument au choc, puis disparaissent quand la carte éclate.
    const cracks = el.querySelector<HTMLElement>("[data-cracks]");
    if (cracks) {
      animations.push(
        cracks.animate(
          [
            { opacity: 0, offset: 0 },
            { opacity: 1, offset: 0.14 },
            { opacity: 1, offset: 0.26 },
            { opacity: 0, offset: 0.34 },
            { opacity: 0 },
          ],
          { duration: SHATTER_MS, fill: "forwards" }
        )
      );
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [from, to]);

  const node = flight.look.kind === "face" ? flight.look.node : null;
  return (
    <div ref={ref} className={styles.shatteringCard} style={{ left: from.x, top: from.y, width: from.width, height: from.height }}>
      {SHARDS.map((shard, index) => (
        <div key={index} data-shard className={styles.shard} style={{ clipPath: shard.clip }}>
          {node}
        </div>
      ))}
      <svg data-cracks className={styles.cracks} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {SHARD_RIM.map(([x, y], index) => (
          <line key={index} x1={IMPACT[0]} y1={IMPACT[1]} x2={x} y2={y} />
        ))}
      </svg>
    </div>
  );
}

/**
 * Couche des mouvements : cartes en vol et cartes brisées (`useCardMotion`), et effets de choc
 * d'une attaque (flash, dégâts qui s'envolent — ceux de l'ancien
 * `AttackImpactLayer`). Plein écran, jamais cliquable.
 */
export function MotionLayer({ flights, fx = [] }: MotionLayerProps) {
  return (
    <div aria-hidden className={styles.motionLayer}>
      {flights.map((flight) =>
        flight.ending === "shatter" ? <ShatteringCard key={flight.id} flight={flight} /> : <FlyingCard key={flight.id} flight={flight} />
      )}
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
