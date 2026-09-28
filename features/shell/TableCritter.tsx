"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/features/shell/TableCritter.module.css";

const ASSETS = "/assets/critters/bete";

/**
 * Pièces de la bête, relevées sur la planche d'origine (1774 × 887) : boîte
 * de chaque pièce (x, y, largeur, hauteur), articulation (jx, jy — le bout
 * de la patte qui entre sous la carapace) et décalage qui la RAMÈNE contre
 * le corps (`dx`, les pattes étaient écartées sur la planche) : l'articulation
 * tombe 40 px SOUS le bord de la carapace, mesuré à sa hauteur (le corps est
 * dessiné en biais, tête en bas à droite), et le corps la recouvre. `phase` :
 * marche en trépied — deux groupes de trois pattes qui alternent.
 */
const FRAME = { w: 1774, h: 887 };
const LEGS = [
  { id: "patte-gauche-1", x: 27, y: 18, w: 509, h: 331, jx: 535, jy: 206, dx: 134, phase: 0 },
  { id: "patte-gauche-2", x: 67, y: 316, w: 476, h: 336, jx: 542, jy: 457, dx: 142, phase: 1 },
  { id: "patte-gauche-3", x: 149, y: 583, w: 396, h: 285, jx: 544, jy: 722, dx: 366, phase: 0 },
  { id: "patte-droite-1", x: 1238, y: 18, w: 511, h: 300, jx: 1238, jy: 208, dx: -291, phase: 1 },
  { id: "patte-droite-2", x: 1232, y: 327, w: 501, h: 311, jx: 1232, jy: 457, dx: -179, phase: 0 },
  { id: "patte-droite-3", x: 1282, y: 578, w: 391, h: 281, jx: 1282, jy: 742, dx: -169, phase: 1 },
] as const;
const BODY = { x: 608, y: 88, w: 608, h: 780 };

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/** Vitesse de marche, en largeurs d'écran par seconde. */
const SPEED = 0.11;

function wait(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(resolve, ms);
    if (signal.cancelled) window.clearTimeout(id);
  });
}

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Un point juste hors de l'écran, sur le bord donné (0 haut, 1 droite, 2 bas, 3 gauche). */
function edgePoint(side: number, w: number, h: number, margin: number): [number, number] {
  if (side === 0) return [random(0.15, 0.85) * w, -margin];
  if (side === 1) return [w + margin, random(0.2, 0.85) * h];
  if (side === 2) return [random(0.15, 0.85) * w, h + margin];
  return [-margin, random(0.2, 0.85) * h];
}

/**
 * `behind` : elle passe SOUS les éléments de l'écran (cartes, feuilles),
 * sur la table seulement — l'appelant la pose avant eux, dans le même
 * contexte d'empilement.
 *
 * LA PETITE BÊTE des tables (menu, choix du mode, contre un bot — retour du
 * 28/09/2026) : de temps en temps, elle traverse l'écran d'un bord à
 * l'autre en trottinant (six pattes, marche en trépied), s'arrête parfois
 * en chemin pour regarder, puis repart. La toucher la fait détaler.
 *
 * Purement décorative : jamais dans le chemin d'un clic (seule la bête
 * elle-même est cliquable, le temps de son passage), et absente si le
 * joueur a demandé moins d'animations.
 */
export function TableCritter({ className, behind = false }: { className?: string; behind?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [walking, setWalking] = useState(false);
  const [visible, setVisible] = useState(false);
  const hurry = useRef(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const signal = { cancelled: false };
    let current: Animation | null = null;

    async function stroll() {
      const node = ref.current;
      if (!node) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const size = node.getBoundingClientRect().width || 120;
      const from = random(0, 4) | 0;
      const to = (from + 1 + ((random(0, 3) | 0) % 3)) % 4;
      const start = edgePoint(from, w, h, size);
      const end = edgePoint(to === from ? (from + 2) % 4 : to, w, h, size);
      // Une halte en chemin, une fois sur deux : elle s'arrête, regarde, repart.
      const pause = Math.random() < 0.5;
      const mid: [number, number] = [start[0] + (end[0] - start[0]) * random(0.35, 0.6), start[1] + (end[1] - start[1]) * random(0.35, 0.6)];
      const legs: [number, number][] = pause ? [start, mid, end] : [start, end];

      hurry.current = false;
      setVisible(true);
      for (let index = 0; index < legs.length - 1 && !signal.cancelled; index += 1) {
        const [x0, y0] = legs[index]!;
        const [x1, y1] = legs[index + 1]!;
        // La tête est en bas sur l'image : on la tourne vers où elle va.
        const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI - 90;
        const distance = Math.hypot(x1 - x0, y1 - y0);
        const place = (x: number, y: number) => `translate(${x - size / 2}px, ${y - size / 4}px) rotate(${angle}deg)`;
        setWalking(true);
        current = node.animate([{ transform: place(x0, y0) }, { transform: place(x1, y1) }], {
          duration: (distance / (w * SPEED)) * 1000,
          easing: index === 0 && pause ? "cubic-bezier(0.3, 0, 0.6, 1)" : "linear",
          fill: "forwards",
        });
        if (hurry.current) current.playbackRate = 3.5;
        await current.finished.catch(() => undefined);
        setWalking(false);
        if (index < legs.length - 2 && !hurry.current) await wait(random(1400, 3200), signal);
      }
      setVisible(false);
    }

    async function loop() {
      await wait(random(4000, 12000), signal);
      while (!signal.cancelled) {
        await stroll();
        await wait(random(18000, 42000), signal);
      }
    }
    void loop();
    return () => {
      signal.cancelled = true;
      current?.cancel();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.critter}${className ? ` ${className}` : ""}`}
      data-walking={walking || undefined}
      data-visible={visible || undefined}
      data-behind={behind || undefined}
      aria-hidden
      onPointerDown={() => {
        // Touchée : elle détale.
        hurry.current = true;
        setWalking(true);
        ref.current?.getAnimations().forEach((animation) => (animation.playbackRate = 3.5));
      }}
    >
      {LEGS.map((leg) => (
        // eslint-disable-next-line @next/next/no-img-element -- pièce détourée locale
        <img
          key={leg.id}
          className={styles.leg}
          data-phase={leg.phase}
          src={`${ASSETS}/${leg.id}.webp`}
          alt=""
          draggable={false}
          style={{
            left: pct(leg.x + leg.dx, FRAME.w),
            top: pct(leg.y, FRAME.h),
            width: pct(leg.w, FRAME.w),
            height: pct(leg.h, FRAME.h),
            transformOrigin: `${pct(leg.jx - leg.x, leg.w)} ${pct(leg.jy - leg.y, leg.h)}`,
          }}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- pièce détourée locale */}
      <img
        className={styles.body}
        src={`${ASSETS}/corps.webp`}
        alt=""
        draggable={false}
        style={{ left: pct(BODY.x, FRAME.w), top: pct(BODY.y, FRAME.h), width: pct(BODY.w, FRAME.w), height: pct(BODY.h, FRAME.h) }}
      />
    </div>
  );
}
