"use client";

import { useEffect, useRef } from "react";
import styles from "@/features/match/table/pont/PontLandeFx.module.css";

/**
 * EFFETS DE LANDE DU PONT (labo `/game/pont-preview`, 08/10/2026), dessinés
 * sur canvas entre le décor et le plateau : ils habillent le sol sans jamais
 * passer devant une carte.
 *
 * Tout suit la PLONGÉE du plateau : un point du sol plus bas à l'écran est
 * plus proche de l'œil. `depth(y)` en tire un facteur d'échelle (≈ 0,55 en
 * haut, 1,15 en bas) : les gouttes y sont plus longues et plus rapides, les
 * ondes et les flaques de lumière plus grandes et moins écrasées (un cercle
 * posé sur le sol se voit en ellipse, d'autant plus plate qu'il est loin).
 * Les verticales fuient vers un point au-dessus du centre de l'écran.
 *
 *   - `pluieVerte` (Pluie corrosive) : une pluie acide verte qui tombe en
 *     biais ; chaque goutte qui touche le sol y ouvre une onde ;
 *   - `puitsLumiere` (Calme trompeur) : des puits de lumière tombés du ciel,
 *     un à un, à des places au hasard, avec leur tache au sol et leurs
 *     poussières qui dansent.
 */
export type PontLandeFxKind = "pluieVerte" | "puitsLumiere";

interface Drop {
  /** Point d'impact au sol, en px. */
  x: number;
  y: number;
  /** Avancement de la chute, 0 → 1. */
  t: number;
  speed: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}

interface Shaft {
  x: number;
  y: number;
  age: number;
  life: number;
  width: number;
  motes: { u: number; v: number; phase: number }[];
}

/** Échelle de profondeur d'un point du sol (0 en haut de l'écran, h en bas). */
function depth(y: number, h: number) {
  return 0.55 + 0.6 * Math.min(1, Math.max(0, y / h));
}

/** Aplatissement d'un cercle posé au sol à cette hauteur (ry / rx). */
function flatten(y: number, h: number) {
  return 0.28 + 0.22 * Math.min(1, Math.max(0, y / h));
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function PontLandeFx({ kind }: { kind: PontLandeFxKind }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Point de fuite : au-dessus du centre de l'écran.
    const vanish = () => ({ x: w / 2, y: -h * 1.4 });

    const drops: Drop[] = [];
    const ripples: Ripple[] = [];
    const shafts: Shaft[] = [];
    const DROPS = reduced ? 40 : 170;
    /** Hauteur de chute d'une goutte, à l'échelle 1. */
    const FALL = () => h * 0.32;
    /** Vent : décalage horizontal de la chute, en fraction de sa hauteur. */
    const WIND = 0.22;

    const newDrop = (fresh: boolean): Drop => ({
      x: rand(-0.05, 1.05) * w,
      y: rand(0.04, 1) * h,
      t: fresh ? rand(0, 1) : 0,
      speed: rand(1.6, 2.3),
    });
    if (kind === "pluieVerte") for (let i = 0; i < DROPS; i++) drops.push(newDrop(true));

    const newShaft = (): Shaft => ({
      x: rand(0.08, 0.92) * w,
      y: rand(0.2, 0.92) * h,
      age: 0,
      life: rand(5, 8),
      width: rand(0.08, 0.14) * w,
      motes: Array.from({ length: 14 }, () => ({ u: Math.random(), v: Math.random(), phase: rand(0, Math.PI * 2) })),
    });
    let nextShaft = 0;

    // Bande où l'effet a le droit d'être : entre la main adverse (en haut) et
    // la mienne (en bas). Les mains, tenues par les joueurs, restent nettes.
    let clipTop = 0;
    let clipBottom = Number.POSITIVE_INFINITY;
    let nextMeasure = 0;
    const measureHands = (now: number) => {
      if (now < nextMeasure) return;
      nextMeasure = now + 500;
      const origin = canvas.getBoundingClientRect();
      const mine = document.querySelector('[data-zone="PlayerHand"]')?.getBoundingClientRect();
      const theirs = document.querySelector('[data-zone="OpponentHand"]')?.getBoundingClientRect();
      clipBottom = mine && mine.height > 0 ? mine.top - origin.top : h;
      clipTop = theirs && theirs.height > 0 ? theirs.bottom - origin.top : 0;
    };

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      measureHands(now);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, clipTop, w, Math.max(0, clipBottom - clipTop));
      ctx.clip();

      if (kind === "pluieVerte") {
        // ONDES d'impact : ellipses écrasées par la perspective, qui s'élargissent et s'éteignent.
        ctx.lineWidth = 1.2;
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i]; if (!r) continue;
          r.age += dt;
          const k = r.age / r.life;
          if (k >= 1) {
            ripples.splice(i, 1);
            continue;
          }
          const d = depth(r.y, h);
          const rx = r.size * d * (0.15 + k);
          const alpha = (1 - k) * 0.85;
          ctx.lineWidth = 1 + 1.4 * d;
          ctx.strokeStyle = `rgba(160, 235, 90, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(r.x, r.y, rx, rx * flatten(r.y, h), 0, 0, Math.PI * 2);
          ctx.stroke();
          // Un second anneau, plus serré, quand l'onde est jeune.
          if (k < 0.5) {
            ctx.strokeStyle = `rgba(200, 255, 140, ${alpha * 0.7})`;
            ctx.beginPath();
            ctx.ellipse(r.x, r.y, rx * 0.5, rx * 0.5 * flatten(r.y, h), 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // GOUTTES : un trait qui tombe en biais vers son point d'impact,
        // plus long et plus épais au premier plan.
        ctx.lineCap = "round";
        for (let i = 0; i < drops.length; i++) {
          const p = drops[i]; if (!p) continue;
          const d = depth(p.y, h);
          p.t += dt * p.speed * (0.7 + 0.5 * d);
          if (p.t >= 1) {
            ripples.push({ x: p.x, y: p.y, age: 0, life: rand(0.55, 0.9), size: rand(16, 28) });
            drops[i] = newDrop(false);
            continue;
          }
          const fall = FALL() * d;
          const remaining = (1 - p.t) * fall;
          const headX = p.x - remaining * WIND;
          const headY = p.y - remaining;
          const len = 26 * d;
          ctx.strokeStyle = `rgba(150, 230, 80, ${0.35 + 0.35 * d})`;
          ctx.lineWidth = 0.8 + 1.1 * d;
          ctx.beginPath();
          ctx.moveTo(headX, headY);
          ctx.lineTo(headX - len * WIND, headY - len);
          ctx.stroke();
        }
      } else {
        // PUITS DE LUMIÈRE : un nouveau toutes les ~1,6 s, quatre au plus.
        nextShaft -= dt;
        if (nextShaft <= 0 && shafts.length < 4) {
          shafts.push(newShaft());
          nextShaft = rand(1.2, 2.2);
        }
        const v = vanish();
        ctx.globalCompositeOperation = "screen";
        for (let i = shafts.length - 1; i >= 0; i--) {
          const s = shafts[i]; if (!s) continue;
          s.age += reduced ? dt * 0.5 : dt;
          const k = s.age / s.life;
          if (k >= 1) {
            shafts.splice(i, 1);
            continue;
          }
          // Monte, tient, s'éteint.
          const alpha = Math.min(1, k / 0.2, (1 - k) / 0.3);
          const d = depth(s.y, h);
          const half = (s.width * d) / 2;
          // Le faisceau remonte vers le point de fuite : son pied est au sol,
          // sa tête au-dessus du haut de l'écran, plus étroite.
          const topY = -h * 0.1;
          const reach = (s.y - topY) / (s.y - v.y);
          const topX = s.x + (v.x - s.x) * reach;
          const topHalf = half * (1 - reach) * 0.75;
          const grad = ctx.createLinearGradient(0, topY, 0, s.y);
          grad.addColorStop(0, `rgba(255, 236, 190, 0)`);
          grad.addColorStop(0.55, `rgba(255, 236, 190, ${0.16 * alpha})`);
          grad.addColorStop(1, `rgba(255, 230, 170, ${0.34 * alpha})`);
          ctx.fillStyle = grad;
          // Bords flous : un faisceau, pas une planche.
          ctx.filter = `blur(${Math.round(half * 0.3)}px)`;
          ctx.beginPath();
          ctx.moveTo(topX - topHalf, topY);
          ctx.lineTo(topX + topHalf, topY);
          ctx.lineTo(s.x + half, s.y);
          ctx.lineTo(s.x - half, s.y);
          ctx.closePath();
          ctx.fill();
          ctx.filter = "none";

          // La tache de lumière au sol : une ellipse douce.
          const ry = half * flatten(s.y, h) * 1.4;
          const pool = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, half * 1.3);
          pool.addColorStop(0, `rgba(255, 244, 205, ${0.55 * alpha})`);
          pool.addColorStop(1, "rgba(255, 220, 150, 0)");
          ctx.fillStyle = pool;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.scale(1, ry / (half * 1.3));
          ctx.translate(-s.x, -s.y);
          ctx.beginPath();
          ctx.arc(s.x, s.y, half * 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Les poussières qui dansent dans le faisceau.
          for (const m of s.motes) {
            const mv = (m.v + s.age * 0.05) % 1;
            const my = topY + (s.y - topY) * (0.35 + 0.65 * mv);
            const along = (my - topY) / (s.y - topY);
            const cx = topX + (s.x - topX) * along;
            const spread = topHalf + (half - topHalf) * along;
            const mx = cx + (m.u * 2 - 1) * spread * 0.8 + Math.sin(s.age * 1.3 + m.phase) * 3;
            ctx.fillStyle = `rgba(255, 246, 220, ${0.55 * alpha * Math.sin(Math.PI * mv)})`;
            ctx.beginPath();
            ctx.arc(mx, my, 1 + 1.2 * depth(my, h), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [kind]);

  return <canvas ref={canvasRef} className={`${styles.canvas} ${kind === "puitsLumiere" ? styles.canvasFront : ""}`} aria-hidden />;
}
