"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { landeAsset, type LandeProp, type LandePropZone } from "@/features/match/landes/landeScenes";
import styles from "@/features/match/landes/Landes.module.css";

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Layout {
  width: number;
  height: number;
  opponent: Rect;
  center: Rect;
  player: Rect;
}

/** Place des rangées, en px du calque (proportions par défaut tant que le plateau n'est pas mesuré). */
function readLayout(host: HTMLElement): Layout {
  const box = host.getBoundingClientRect();
  const rect = (zone: string, fallback: Rect): Rect => {
    const el = host.ownerDocument.querySelector(`[data-zone="${zone}"]`);
    const r = el?.getBoundingClientRect();
    if (!r || r.width === 0) return fallback;
    return { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top };
  };
  const w = box.width;
  const h = box.height;
  return {
    width: w,
    height: h,
    opponent: rect("OpponentZone", { left: 0.01 * w, top: 0.14 * h, right: 0.9 * w, bottom: 0.36 * h }),
    center: rect("CenterZone", { left: 0.01 * w, top: 0.37 * h, right: 0.9 * w, bottom: 0.63 * h }),
    player: rect("PlayerZone", { left: 0.01 * w, top: 0.64 * h, right: 0.9 * w, bottom: 0.85 * h }),
  };
}

/**
 * Où et à quelle taille poser une pièce : son PIED (milieu du bord bas) et
 * sa hauteur, d'après la zone qu'elle habite. `null` : pas la place sur cet
 * écran (téléphone couché), la pièce n'est pas posée plutôt que d'écraser
 * le jeu.
 */
function placement(zone: LandePropZone, at: number, scale: number, l: Layout): { x: number; y: number; size: number } | null {
  const span = (r: Rect) => r.left + (r.right - r.left) * at;
  const seaH = l.center.bottom - l.center.top;
  const playerH = l.player.bottom - l.player.top;
  const opponentH = l.opponent.bottom - l.opponent.top;
  switch (zone) {
    case "sea": {
      if (seaH < 90) return null;
      return { x: span(l.center), y: l.center.bottom - seaH * 0.04, size: seaH * scale };
    }
    case "desk": {
      const deskH = l.height - l.player.bottom;
      if (deskH < 40) return null;
      const y = l.player.bottom + deskH * 0.9;
      // Le sommet ne mord sur la rangée que de son liseré.
      const size = Math.min(deskH * scale, y - (l.player.bottom - playerH * 0.08));
      return { x: span(l.player), y, size };
    }
    case "sky": {
      if (l.opponent.top < l.height * 0.12) return null;
      const y = l.opponent.top + opponentH * 0.06;
      return { x: span(l.opponent), y, size: l.opponent.top * scale };
    }
  }
}

/**
 * LE DÉCOR D'UNE LANDE EN PIÈCES POSÉES (Le Donjon de Ladalle) : des murs,
 * une arche, un étal, des latrines… en fausse 3D isométrique, posés autour
 * du plateau — jamais sur une carte.
 *
 * À l'arrivée, chaque pièce SORT DU SOL l'une après l'autre, dans un
 * grondement : elle monte en tremblant, soulève un nuage de poussière, puis
 * se pose avec son ombre. Ses lumières (lanterne, torche, fenêtre) portent
 * un halo qui vacille — un clic l'éteint ou la rallume, comme les lanternes
 * des écrans de menu. Les latrines exhalent une fumée verte.
 */
export function LandeProps({ cardId, props, layer }: { cardId: string; props: readonly LandeProp[]; layer: "back" | "front" }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const mine = props.filter((p) => p.layer === layer);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const read = () => setLayout(readLayout(host));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(host);
    // Les rangées se posent après la scène : on relit leur place un peu plus tard.
    const later = window.setTimeout(read, 600);
    return () => {
      observer.disconnect();
      window.clearTimeout(later);
    };
  }, []);

  return (
    <div ref={hostRef} className={styles.propsHost}>
      {layout &&
        mine.map((prop, index) => {
          const place = placement(prop.zone, prop.at, prop.scale, layout);
          if (!place) return null;
          return <PropPiece key={prop.file} cardId={cardId} prop={prop} place={place} order={index} />;
        })}
    </div>
  );
}

function PropPiece({ cardId, prop, place, order }: { cardId: string; prop: LandeProp; place: { x: number; y: number; size: number }; order: number }) {
  const [lit, setLit] = useState<boolean[]>(() => (prop.lights ?? []).map(() => true));
  const [puffs, setPuffs] = useState<number[]>(() => (prop.lights ?? []).map(() => 0));
  return (
    <div
      className={styles.prop}
      style={
        {
          left: place.x - place.size / 2,
          top: place.y - place.size,
          width: place.size,
          height: place.size,
          "--rise-delay": `${order * 260}ms`,
        } as CSSProperties
      }
    >
      {/* Ombre au sol et poussière soulevée : elles restent au pied. */}
      <span className={styles.propShadow} aria-hidden />
      <span className={styles.propDust} aria-hidden />
      <div className={styles.propRise}>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.propImg} src={landeAsset(cardId, prop.file)} alt="" draggable={false} />
        {(prop.lights ?? []).map((light, i) => (
          <button
            key={i}
            type="button"
            className={styles.propLight}
            data-lit={lit[i] ? "" : undefined}
            style={{ left: `${light.x * 100}%`, top: `${light.y * 100}%`, "--light-size": `${light.size ?? 0.34}` } as CSSProperties}
            aria-pressed={lit[i]}
            aria-label={lit[i] ? "Souffler la lumière" : "Rallumer la lumière"}
            onClick={() => {
              if (lit[i]) setPuffs((p) => p.map((v, k) => (k === i ? v + 1 : v)));
              setLit((l) => l.map((v, k) => (k === i ? !v : v)));
            }}
          >
            <span className={styles.propGlow} aria-hidden />
            <span className={styles.propDark} aria-hidden />
            {puffs[i]! > 0 && !lit[i] && <span key={puffs[i]} className={styles.propPuff} aria-hidden />}
          </button>
        ))}
        {prop.stench && (
          <span className={styles.propStench} style={{ left: `${prop.stench.x * 100}%`, top: `${prop.stench.y * 100}%` }} aria-hidden>
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className={styles.stenchWisp} style={{ "--k": k } as CSSProperties} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
