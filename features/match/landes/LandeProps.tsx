"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { landeAsset, type LandeProp, type LandePropZone } from "@/features/match/landes/landeScenes";
import { useLandeTuning, type LandeTuning } from "@/features/match/landes/landeTuning";
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
  player: Rect;
  /** Tout ce que l'interface occupe : une pièce n'en recouvre jamais rien. */
  obstacles: Rect[];
}

/**
 * Ce que le décor ne doit JAMAIS recouvrir : les deux rangées, la colonne
 * de droite, les cartes en main des deux côtés, tout élément marqué
 * `data-ui-obstacle` (piste et tuile de Marée, hublots de Lande et
 * d'effets, boutons du haut), et les objets du décor de la table.
 */
const OBSTACLES = [
  '[data-zone="OpponentZone"]',
  '[data-zone="PlayerZone"]',
  '[data-zone="SideRail"]',
  '[data-zone="PlayerHand"] [data-card-id]',
  "[data-opp-hand-index]",
  "[data-ui-obstacle]",
  "[data-live-audience]",
  // Les objets du DÉCOR de la table (lanternes, tonneau, barre…) : une pièce
  // posée dessus aurait l'air collée, pas posée sur le bureau.
  "[data-decor-obstacle]",
].join(", ");

function readLayout(host: HTMLElement): Layout {
  const box = host.getBoundingClientRect();
  const local = (r: DOMRect): Rect => ({ left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top });
  const doc = host.ownerDocument;
  const zone = (name: string, fallback: Rect): Rect => {
    const r = doc.querySelector(`[data-zone="${name}"]`)?.getBoundingClientRect();
    return r && r.width > 0 ? local(r) : fallback;
  };
  const w = box.width;
  const h = box.height;
  const obstacles = [...doc.querySelectorAll(OBSTACLES)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map(local);
  return {
    width: w,
    height: h,
    opponent: zone("OpponentZone", { left: 0.01 * w, top: 0.14 * h, right: 0.9 * w, bottom: 0.36 * h }),
    player: zone("PlayerZone", { left: 0.01 * w, top: 0.64 * h, right: 0.9 * w, bottom: 0.85 * h }),
    obstacles,
  };
}

/** Bande verticale d'une zone : là où le pied se pose, et la hauteur qu'elle offre. */
function band(zone: LandePropZone, l: Layout): { top: number; bottom: number } {
  switch (zone) {
    case "sky":
      return { top: 0, bottom: l.opponent.top };
    case "sea":
      return { top: l.opponent.bottom, bottom: l.player.top };
    case "desk":
      return { top: l.player.bottom, bottom: l.height };
  }
}

/**
 * Ce que la pièce occupe vraiment dans son carré d'image (les pièces
 * isométriques ont des marges transparentes).
 */
function footprint(x: number, y: number, size: number): Rect {
  return { left: x - size * 0.45, right: x + size * 0.45, top: y - size * 0.95, bottom: y };
}

const intersects = (a: Rect, b: Rect, pad = 6) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

/** Taille minimale d'une pièce : en dessous, elle n'est pas posée. */
const MIN_SIZE = 64;

/**
 * Place une pièce : la plus GRANDE possible dans sa bande, au plus près de
 * sa position voulue, sans toucher ni l'interface ni les pièces déjà
 * posées. `null` s'il n'y a pas la place.
 */
function place(prop: LandeProp, l: Layout, taken: Rect[], tuning: Pick<LandeTuning, "propScale" | "propMax" | "propFree">): { x: number; y: number; size: number } | null {
  const { top, bottom } = band(prop.zone, l);
  // Le pied à distance de la marge de sécurité (`intersects`) du bord de sa bande.
  const y = bottom - 8;
  const free = tuning.propFree === 1;
  const maxSize = (free ? tuning.propMax * prop.scale * tuning.propScale : Math.min((bottom - top - 16) * prop.scale * tuning.propScale, tuning.propMax)) / 0.95;
  const wanted = prop.at * l.width;
  const xs: number[] = [];
  for (let k = 0; k <= 60; k++) {
    const dx = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * l.width * 0.01;
    xs.push(wanted + dx);
  }
  for (let size = maxSize; size >= MIN_SIZE; size *= 0.92) {
    for (const x of xs) {
      const r = footprint(x, y, size);
      if (r.left < 2 || r.right > l.width - 2 || r.top < 2) continue;
      if ((!free && l.obstacles.some((o) => intersects(r, o))) || taken.some((t) => intersects(r, t, 2))) continue;
      return { x, y, size };
    }
  }
  return null;
}

/**
 * Les deux FEUX du sol du Donjon (`enclos-sol.webp` : le brasero en haut à
 * gauche, les bougies en bas à droite), en fractions de l'écran : chaque
 * pièce est éclairée du côté du plus proche, et son ombre part à l'opposé.
 */
const DECOR_LANTERNS = [
  { x: 0.1, y: 0.05 },
  { x: 0.97, y: 0.82 },
];

function lightingFor(x: number, y: number, l: Layout): { angle: number; strength: number; away: [number, number] } {
  let best = { dx: 0, dy: -1, d: Infinity };
  for (const lantern of DECOR_LANTERNS) {
    const dx = lantern.x * l.width - x;
    const dy = lantern.y * l.height - y;
    const d = Math.hypot(dx, dy);
    if (d < best.d) best = { dx, dy, d };
  }
  // Angle CSS (0° = vers le haut, 90° = vers la droite) pointant vers la lanterne.
  const angle = (Math.atan2(best.dx, -best.dy) * 180) / Math.PI;
  const strength = Math.max(0.35, Math.min(1, 1 - best.d / (Math.hypot(l.width, l.height) * 0.9)));
  return { angle, strength, away: [-best.dx / best.d, -best.dy / best.d] };
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
  const tuning = useLandeTuning();

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
        (() => {
          const taken: Rect[] = [];
          return mine.map((prop, index) => {
            const spot = place(prop, layout, taken, tuning);
            if (!spot) return null;
            taken.push(footprint(spot.x, spot.y, spot.size));
            // Face au CENTRE : les pièces sont peintes tournées vers la gauche ;
            // à gauche du plateau, on les retourne pour qu'elles regardent le jeu.
            const mirrored = spot.x < layout.width / 2;
            return <PropPiece key={prop.file} cardId={cardId} prop={prop} place={spot} order={index} mirrored={mirrored} light={lightingFor(spot.x, spot.y - spot.size / 2, layout)} />;
          });
        })()}
    </div>
  );
}

function PropPiece({
  cardId,
  prop,
  place,
  order,
  mirrored,
  light,
}: {
  cardId: string;
  prop: LandeProp;
  place: { x: number; y: number; size: number };
  order: number;
  mirrored: boolean;
  light: { angle: number; strength: number; away: [number, number] };
}) {
  const src = landeAsset(cardId, prop.file);
  // Dans le repère retourné, la lumière vient de l'autre côté.
  const angle = mirrored ? -light.angle : light.angle;
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
          "--shadow-x": `${(light.away[0] * 14).toFixed(1)}%`,
          "--shadow-skew": `${(light.away[0] * -26).toFixed(1)}deg`,
        } as CSSProperties
      }
    >
      {/* Ombre au sol et poussière soulevée : elles restent au pied. */}
      <span className={styles.propShadow} aria-hidden />
      <span className={styles.propDust} aria-hidden />
      <div className={styles.propRise}>
      {/* Tournée vers le jeu (miroir à gauche) et légèrement pivotée en perspective. */}
      <div className={styles.propTurn} data-mirrored={mirrored ? "" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.propImg} src={src} alt="" draggable={false} />
        {/* Éclairage de la scène : le côté tourné vers la lanterne du décor la plus proche se réchauffe, l'autre s'assombrit. Masqué par la pièce elle-même. */}
        <span
          className={styles.propShade}
          aria-hidden
          style={
            {
              WebkitMaskImage: `url(${src})`,
              maskImage: `url(${src})`,
              background: `linear-gradient(${angle.toFixed(0)}deg, rgba(8, 6, 14, ${(0.55 * light.strength).toFixed(2)}) 0%, rgba(8, 6, 14, 0) 45%, rgba(255, 196, 120, ${(0.42 * light.strength).toFixed(2)}) 100%)`,
            } as CSSProperties
          }
        />
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
    </div>
  );
}
