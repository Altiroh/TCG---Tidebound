"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { CardInstance } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import { landeScene } from "@/features/match/landes/landeScenes";
import styles from "@/features/match/landes/Landes.module.css";
import type { TideStateName } from "@/game";

/**
 * Chronologie de l'arrivée (ms). La scène de la Lande (`LandeLayer`)
 * apparaît à `DISSOLVE_AT` : le décor prend la place de la carte pendant
 * qu'elle se défait.
 */
export const LANDE_ARRIVAL = {
  APPEAR_MS: 520,
  DISSOLVE_AT: 1350,
  DISSOLVE_MS: 1250,
  END_AT: 3000,
} as const;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}

interface LandeArrivalProps {
  cardId: string;
  instanceId: string;
  ownerId: string;
  tideState: TideStateName;
  /** Fin de l'animation : le conteneur la démonte. */
  onDone: () => void;
}

/**
 * ARRIVÉE d'une Lande : la carte vient se poser au centre de la table, se
 * tient un instant, puis SE DISSOUT dans le décor — un masque de bruit qui
 * la ronge depuis l'intérieur, bordé d'un liseré brûlant à la couleur de la
 * Lande, pendant que des particules s'en détachent et que la scène de la
 * Lande s'installe derrière.
 *
 * Purement visuel et non bloquant : aucun pointeur n'est retenu, le joueur
 * peut agir pendant l'animation. Sous « réduire les animations », rien ne
 * se joue : la scène apparaît en fondu.
 */
export function LandeArrival({ cardId, instanceId, ownerId, tideState, onDone }: LandeArrivalProps) {
  const scene = landeScene(cardId);
  const filterId = `lande-dissolve-${useId().replace(/:/g, "")}`;
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<SVGFEFuncAElement>(null);
  const edgeRef = useRef<SVGFEFuncAElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  const [phase, setPhase] = useState<"appear" | "hold" | "dissolve">("appear");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      doneRef.current();
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas) {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    const particles: Particle[] = [];
    // Le sens où s'en vont les particules dit la Lande : la pluie retombe,
    // le verre éclate, la rouille s'envole en braises.
    const gravity = scene.fx === "acidRain" ? 240 : scene.fx === "glassSpikes" ? 120 : scene.fx === "chains" ? -40 : -60;
    const spread = scene.fx === "glassSpikes" ? 260 : 120;

    const start = performance.now();
    let last = start;
    let frame = 0;
    const tick = (now: number) => {
      const t = now - start;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t >= LANDE_ARRIVAL.APPEAR_MS && t < LANDE_ARRIVAL.DISSOLVE_AT) setPhase((p) => (p === "appear" ? "hold" : p));
      const p = Math.max(0, Math.min(1, (t - LANDE_ARRIVAL.DISSOLVE_AT) / LANDE_ARRIVAL.DISSOLVE_MS));
      if (t >= LANDE_ARRIVAL.DISSOLVE_AT) setPhase("dissolve");

      // Le masque de bruit : `alpha = 10·n + b`, b descend de 1 à −9 — les
      // creux du bruit cèdent d'abord, la carte se troue puis disparaît.
      const eased = p * p * (3 - 2 * p);
      const intercept = 1 - 10 * eased;
      maskRef.current?.setAttribute("intercept", String(intercept));
      edgeRef.current?.setAttribute("intercept", String(intercept + 1.4));
      dispRef.current?.setAttribute("scale", String(eased * 46));

      // Particules arrachées à la carte, d'autant plus nombreuses que la
      // dissolution avance — puis plus rien, le temps qu'elles retombent.
      const rect = cardRef.current?.getBoundingClientRect();
      const host = canvas?.getBoundingClientRect();
      if (ctx && canvas && rect && host) {
        if (p > 0 && p < 1) {
          const count = Math.round(140 * dt * (1 + 3 * Math.sin(p * Math.PI)));
          for (let i = 0; i < count; i++) {
            particles.push({
              x: (rect.left - host.left + Math.random() * rect.width) * dpr,
              y: (rect.top - host.top + Math.random() * rect.height) * dpr,
              vx: (Math.random() - 0.5) * spread * dpr,
              vy: ((Math.random() - 0.6) * spread * 0.6) * dpr,
              age: 0,
              life: 0.7 + Math.random() * 1.1,
              size: (1.2 + Math.random() * 2.8) * dpr,
            });
          }
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "lighter";
        for (let i = particles.length - 1; i >= 0; i--) {
          const q = particles[i]!;
          q.age += dt;
          if (q.age >= q.life) {
            particles.splice(i, 1);
            continue;
          }
          q.vy += gravity * dpr * dt;
          q.vx *= 1 - 0.8 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          const a = 1 - q.age / q.life;
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.size * 3);
          g.addColorStop(0, `rgba(${scene.rgbHot}, ${a})`);
          g.addColorStop(0.4, `rgba(${scene.rgb}, ${a * 0.6})`);
          g.addColorStop(1, `rgba(${scene.rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(q.x - q.size * 3, q.y - q.size * 3, q.size * 6, q.size * 6);
        }
        ctx.globalCompositeOperation = "source-over";
      }

      if (t >= LANDE_ARRIVAL.END_AT) {
        doneRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene]);

  const card: CardInstance = {
    instanceId,
    cardId,
    ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };

  return (
    <div aria-hidden className={styles.arrival} style={{ "--lande-rgb": scene.rgb, "--lande-hot": scene.rgbHot } as CSSProperties}>
      <svg width="0" height="0" className={styles.arrivalDefs}>
        <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="11" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="noiseAlpha" />
          <feComponentTransfer in="noiseAlpha" result="mask">
            <feFuncA ref={maskRef} type="linear" slope="10" intercept="1" />
          </feComponentTransfer>
          <feComponentTransfer in="noiseAlpha" result="edge">
            <feFuncA ref={edgeRef} type="linear" slope="10" intercept="2.4" />
          </feComponentTransfer>
          <feComposite in="edge" in2="mask" operator="out" result="band" />
          <feFlood floodColor={`rgb(${scene.rgbHot})`} result="hot" />
          <feComposite in="hot" in2="band" operator="in" result="bandHot" />
          <feComposite in="bandHot" in2="SourceAlpha" operator="in" result="bandOnCard" />
          <feGaussianBlur in="bandOnCard" stdDeviation="3" result="glow" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" result="cut" />
          <feDisplacementMap ref={dispRef} in="cut" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" result="warped" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="warped" />
            <feMergeNode in="bandOnCard" />
          </feMerge>
        </filter>
      </svg>
      <div className={styles.arrivalHalo} data-phase={phase} />
      <div ref={cardRef} className={styles.arrivalCard} data-phase={phase} style={{ filter: `url(#${filterId})` }}>
        <CardTile instance={card} tideState={tideState} widthClassName="w-full" scaleOnHover={false} showStatusBadges={false} />
      </div>
      <canvas ref={canvasRef} className={styles.arrivalCanvas} />
    </div>
  );
}
