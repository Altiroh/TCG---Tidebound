"use client";

import { useLayoutEffect, useRef } from "react";

/** Mouvement réduit : les effets dessinés ne se jouent pas. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export interface FxBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Un canvas posé sur `bounds` (coordonnées viewport), net sur écran dense,
 * qui appelle `paint` à chaque image pendant `durationMs` — en coordonnées
 * VIEWPORT, le canvas s'en charge — puis se vide. Partagé par les sorts
 * (`EffectFxLayer`) et les chocs de combat (`AttackImpactLayer`).
 */
export function FxCanvas({
  bounds,
  durationMs,
  paint,
}: {
  bounds: FxBounds;
  durationMs: number;
  paint: (ctx: CanvasRenderingContext2D, elapsed: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reducedMotion()) return undefined;
    // Plafonné à 2 : au-delà, le coût monte sans que l'œil y gagne.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.ceil(bounds.width * dpr);
    canvas.height = Math.ceil(bounds.height * dpr);
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // L'horodatage d'une image peut précéder le montage de quelques millisecondes.
      const elapsed = Math.max(0, now - startedAt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (elapsed >= durationMs) return;
      ctx.setTransform(dpr, 0, 0, dpr, -bounds.left * dpr, -bounds.top * dpr);
      paint(ctx, elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un effet ne se joue qu'une fois.
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute z-30"
      style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
    />
  );
}
