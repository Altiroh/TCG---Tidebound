"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { centerOf, findElement, FloatingDamage, ImpactFlash, shake, SmokeBurst, type Point } from "@/features/match/AttackImpactLayer";
import { awakenCard } from "@/features/match/cardFx";
import { keywordLabel, THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";
import {
  AWAKE_LIFT_MS,
  BUFF_LAND_MS,
  HEAL_APPLY_MS,
  ORB_CHARGE_MS,
  REASON_COUNT_MS,
  REASON_FALL_MS,
  HEAL_TOTAL_MS,
  SHOT_FLIGHT_MS,
  type EffectBuff,
  type EffectReason,
  type EffectShot,
  type EffectVolley,
  type FxTarget,
  type SpellSource,
} from "@/features/match/effectPresentation";
import { playSpellCast } from "@/lib/sound";

/**
 * Mise en scène des EFFETS (`effectPresentation.ts`) — tout en coordonnées
 * VIEWPORT (`fixed inset-0`), mesuré sur les éléments du plateau au moment
 * du départ :
 *
 *   - réveil : la carte qui déclenche sa capacité se soulève, pulse et
 *     retombe (`awakenCard`, `cardFx.ts`) ;
 *   - sort : une ORBE se forme devant le lanceur (vers le centre du
 *     plateau), grossit en pulsant, puis s'éclate en COMÈTES — une par
 *     cible, toutes en même temps — qui filent en arc, la tête dans le sens
 *     du vol. Trois familles peintes : attaque (bleu), soin et renfort (or),
 *     malus (pourpre). À l'arrivée d'un sort d'attaque : flash, plaque de
 *     dégâts, tremblement. Le boulet du canon de Navire part sans orbe ;
 *   - soin : un voile lumineux descend sur la cible, scintille et s'efface ;
 *   - gain / perte : le chiffre (+1, −1…) surgit au-dessus de la carte, se montre,
 *     puis file se ranger sur la valeur qu’il modifie (Puissance,
 *     Résistance, ou la rangée des badges pour un mot-clé).
 *
 * Soin et renfort lancés par une carte (ou un Navire) attendent l'arrivée
 * de leur comète ; sans lanceur connu, ils se posent aussitôt.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function elementOf(target: FxTarget): HTMLElement | null {
  return findElement(target.kind, target.id);
}

function boxOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Points d'un arc (Bézier quadratique) de `from` à `to`, bombé vers le haut. */
function arc(from: Point, to: Point, steps = 12): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  // Bombé perpendiculairement au trajet, toujours du côté du haut de l'écran.
  let nx = -dy / distance;
  let ny = dx / distance;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = Math.min(140, distance * 0.28);
  const control = { x: (from.x + to.x) / 2 + nx * bulge, y: (from.y + to.y) / 2 + ny * bulge };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return { x: u * u * from.x + 2 * u * t * control.x + t * t * to.x, y: u * u * from.y + 2 * u * t * control.y + t * t * to.y };
  });
}

// ── Sorts : l'orbe, puis les comètes ─────────────────────────────────────

interface ShotGeometry {
  shot: EffectShot;
  from: Point;
  to: Point;
  /** Hauteur de la cible à l'écran : les effets suivent la taille du plateau. */
  size: number;
}

/** Famille d'un sort, d'après ce qu'il fait : chacune a sa comète et sa couleur d'orbe. */
export type SpellKind = "attack" | "heal" | "malus";

/**
 * Les comètes peintes (lot du 10/10/2026) : la TÊTE est à droite de l'image
 * (`head`, en fractions), la traînée part vers la gauche, le vol est
 * horizontal à quelques degrés près (`nativeDeg`). Elles sont tournées, à
 * chaque point de l'arc, selon la tangente du vol — la tête mène.
 */
const COMETS: Record<SpellKind, { src: string; head: { x: number; y: number }; nativeDeg: number; orb: string; glow: string }> = {
  attack: {
    src: "/assets/fx/sorts/sort-attaque.webp",
    head: { x: 0.85, y: 0.39 },
    nativeDeg: -4,
    orb: "radial-gradient(circle at 45% 42%, #ffffff 0%, #dbeafe 24%, #60a5fa 52%, rgba(37,99,235,0) 74%)",
    glow: "rgba(96,165,250,0.85)",
  },
  heal: {
    src: "/assets/fx/sorts/sort-soin.webp",
    head: { x: 0.85, y: 0.36 },
    nativeDeg: -6,
    orb: "radial-gradient(circle at 45% 42%, #ffffff 0%, #fef3c7 24%, #fbbf24 52%, rgba(217,119,6,0) 74%)",
    glow: "rgba(251,191,36,0.85)",
  },
  malus: {
    src: "/assets/fx/sorts/sort-malus.webp",
    head: { x: 0.87, y: 0.5 },
    nativeDeg: 0,
    orb: "radial-gradient(circle at 45% 42%, #ffffff 0%, #f5d0fe 22%, #a21caf 52%, rgba(88,28,135,0) 74%)",
    glow: "rgba(192,38,211,0.85)",
  },
};
const COMET_RATIO = 640 / 480;

/** Une comète de sort, du point de départ (l'orbe) à sa cible, le long d'un arc. */
export interface CometFlight {
  kind: SpellKind;
  from: Point;
  to: Point;
  size: number;
}

export function Comet({ flight }: { flight: CometFlight }) {
  const host = useRef<HTMLImageElement>(null);
  const { kind, from, to, size } = flight;
  const comet = COMETS[kind];
  const width = Math.max(120, Math.min(260, size * 1.5));
  const height = width / COMET_RATIO;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const points = arc(from, to, 16);
    const keyframes = points.map((point, i) => {
      const a = points[Math.max(0, i - 1)]!;
      const b = points[Math.min(points.length - 1, i + 1)]!;
      const heading = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return {
        transform: `translate(${point.x - from.x}px, ${point.y - from.y}px) rotate(${heading - comet.nativeDeg}deg) scale(${i === 0 ? 0.5 : 1})`,
        opacity: i === 0 ? 0 : i === points.length - 1 ? 0.6 : 1,
      };
    });
    const animation = el.animate(keyframes, { duration: SHOT_FLIGHT_MS, easing: "cubic-bezier(.45,.05,.75,.95)", fill: "forwards" });
    return () => animation.cancel();
  }, [from, to, comet.nativeDeg]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- comète peinte, animée à la main
    <img
      ref={host}
      src={comet.src}
      alt=""
      aria-hidden
      draggable={false}
      className="pointer-events-none absolute z-30 select-none"
      style={{
        // La TÊTE est posée sur le point de départ, et c'est autour d'elle que la comète pivote.
        left: from.x - comet.head.x * width,
        top: from.y - comet.head.y * height,
        width,
        height,
        opacity: 0,
        transformOrigin: `${comet.head.x * 100}% ${comet.head.y * 100}%`,
        mixBlendMode: "screen",
      }}
    />
  );
}

/** L'orbe qui se forme devant le lanceur : elle naît petite, grossit en pulsant, puis éclate en comètes. */
export function SpellOrb({ kind, point, size }: { kind: SpellKind; point: Point; size: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const comet = COMETS[kind];
  const diameter = Math.max(34, Math.min(80, size * 0.42));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const animation = el.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.15)", opacity: 0, filter: `drop-shadow(0 0 4px ${comet.glow})` },
        { offset: 0.35, transform: "translate(-50%, -50%) scale(0.85)", opacity: 1, filter: `drop-shadow(0 0 16px ${comet.glow})` },
        { offset: 0.6, transform: "translate(-50%, -50%) scale(0.75)", opacity: 1, filter: `drop-shadow(0 0 8px ${comet.glow})` },
        { offset: 0.88, transform: "translate(-50%, -50%) scale(1.1)", opacity: 1, filter: `drop-shadow(0 0 22px ${comet.glow})` },
        { transform: "translate(-50%, -50%) scale(1.25)", opacity: 0.2, filter: `drop-shadow(0 0 26px ${comet.glow})` },
      ],
      { duration: ORB_CHARGE_MS, easing: "ease-out", fill: "forwards" }
    );
    return () => animation.cancel();
  }, [comet.glow]);

  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute z-30"
      style={{ left: point.x, top: point.y, width: diameter, height: diameter, borderRadius: "9999px", background: comet.orb, opacity: 0, mixBlendMode: "screen" }}
    />
  );
}

/**
 * Où se forme l'orbe : DEVANT le lanceur, c'est-à-dire décalée de sa
 * position vers le centre de l'écran (le milieu du plateau, entre les deux
 * camps), d'un peu plus d'une demi-hauteur de carte.
 */
export function orbPointFor(caster: DOMRect): Point {
  const center = centerOf(caster);
  const dx = window.innerWidth / 2 - center.x;
  const dy = window.innerHeight / 2 - center.y;
  const distance = Math.hypot(dx, dy) || 1;
  const reach = Math.min(distance * 0.6, caster.height * 0.65);
  return { x: center.x + (dx / distance) * reach, y: center.y + (dy / distance) * reach };
}

/** Le boulet du canon : fonte sombre, liseré de feu. */
const CANNON_LOOK = {
  background: "radial-gradient(circle at 35% 32%, #9ca3af 0%, #374151 38%, #111827 75%)",
  boxShadow: "0 0 10px 3px rgba(251,146,60,0.55), 0 3px 6px rgba(0,0,0,0.6)",
} as const;

/** Le boulet du canon et sa traînée : trois échos plus petits qui suivent le même arc avec un léger retard. */
function CannonBall({ geometry }: { geometry: ShotGeometry }) {
  const host = useRef<HTMLDivElement>(null);
  const { shot, from, to, size } = geometry;
  const orb = Math.max(18, Math.min(44, size * 0.22));

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const points = arc(from, to);
    const animations = Array.from(el.children).map((child, index) => {
      const lag = index * 34;
      const keyframes = points.map((point, i) => ({
        transform: `translate(${point.x - from.x}px, ${point.y - from.y}px) translate(-50%, -50%) scale(${i === 0 ? 0.4 : 1 - index * 0.2})`,
        opacity: i === 0 ? 0 : i === points.length - 1 ? 0.2 : 1 - index * 0.25,
      }));
      return (child as HTMLElement).animate(keyframes, {
        duration: SHOT_FLIGHT_MS - lag,
        delay: lag,
        easing: "cubic-bezier(.45,.05,.75,.95)",
        fill: "forwards",
      });
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [from, to]);

  const look = CANNON_LOOK;
  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute z-30" style={{ left: from.x, top: from.y }}>
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: orb,
            height: orb,
            borderRadius: "9999px",
            opacity: 0,
            background: look.background,
            boxShadow: index === 0 ? look.boxShadow : undefined,
            filter: index === 0 ? undefined : "blur(1.5px)",
          }}
        />
      ))}
    </div>
  );
}

function ShotImpact({ geometry }: { geometry: ShotGeometry }) {
  return (
    <>
      <ImpactFlash point={geometry.to} tint={geometry.shot.look} />
      {geometry.shot.look === "cannon" && <SmokeBurst point={geometry.to} size={geometry.size} puffs={6} />}
      <FloatingDamage point={geometry.to} amount={geometry.shot.amount} />
    </>
  );
}

// ── Voile de soin ───────────────────────────────────────────────────────

const SPARKS = 9;

function HealVeil({ box, amount }: { box: Box; amount: number }) {
  const veil = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const animations: Animation[] = [];
    const t = HEAL_TOTAL_MS;
    const covered = HEAL_APPLY_MS / t;
    // Le voile tombe du haut comme un rideau de lumière, couvre la cible
    // (la Résistance remonte dessous), puis se dissout vers le haut.
    if (veil.current) {
      animations.push(
        veil.current.animate(
          [
            { clipPath: "inset(0 0 100% 0 round 10px)", opacity: 0.2, filter: "brightness(1)" },
            { clipPath: "inset(0 0 0% 0 round 10px)", opacity: 0.95, filter: "brightness(1.25)", offset: covered },
            { clipPath: "inset(0 0 0% 0 round 10px)", opacity: 0.75, filter: "brightness(1)", offset: 0.62 },
            { clipPath: "inset(0 0 0% 0 round 10px)", opacity: 0, filter: "brightness(1)" },
          ],
          { duration: t, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" }
        )
      );
    }
    // Étincelles qui montent à travers le voile.
    Array.from(sparks.current?.children ?? []).forEach((child, index) => {
      animations.push(
        (child as HTMLElement).animate(
          [
            { transform: "translateY(0) scale(0.4)", opacity: 0 },
            { transform: `translateY(${-box.height * 0.25}px) scale(1)`, opacity: 1, offset: 0.35 },
            { transform: `translateY(${-box.height * 0.6}px) scale(0.6)`, opacity: 0 },
          ],
          { duration: 780, delay: 160 + ((index * 53) % 320), easing: "ease-out", fill: "forwards" }
        )
      );
    });
    if (label.current) {
      animations.push(
        label.current.animate(
          [
            { transform: "translate(-50%, -30%) scale(0.5)", opacity: 0 },
            { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1, offset: 0.3 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.6 },
            { transform: "translate(-50%, -110%) scale(1)", opacity: 0 },
          ],
          { duration: t, delay: HEAL_APPLY_MS * 0.5, easing: "ease-out", fill: "forwards" }
        )
      );
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [box.height]);

  return (
    <div aria-hidden className="pointer-events-none absolute z-30" style={box}>
      <div
        ref={veil}
        style={{
          position: "absolute",
          inset: -4,
          borderRadius: 12,
          opacity: 0,
          background:
            "linear-gradient(180deg, rgba(236,253,245,0.85) 0%, rgba(167,243,208,0.55) 38%, rgba(110,231,183,0.35) 70%, rgba(52,211,153,0.15) 100%)",
          boxShadow: "0 0 22px 6px rgba(110,231,183,0.55), inset 0 0 18px rgba(255,255,255,0.7)",
          mixBlendMode: "screen",
        }}
      />
      <div ref={sparks} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: SPARKS }, (_, index) => (
          <span
            key={index}
            style={{
              position: "absolute",
              left: `${10 + ((index * 61) % 80)}%`,
              top: `${55 + ((index * 29) % 40)}%`,
              width: 6,
              height: 6,
              borderRadius: "9999px",
              opacity: 0,
              background: "radial-gradient(circle, #ffffff 0%, #bbf7d0 45%, rgba(74,222,128,0) 75%)",
            }}
          />
        ))}
      </div>
      <span
        ref={label}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          opacity: 0,
          fontFamily: "var(--font-card-title), Georgia, serif",
          fontSize: Math.max(18, Math.min(40, box.height * 0.22)),
          fontWeight: 700,
          color: "#ecfdf5",
          textShadow: "0 0 8px rgba(16,185,129,0.9), 0 2px 4px rgba(6,78,59,0.9)",
          whiteSpace: "nowrap",
        }}
      >
        +{amount}
      </span>
    </div>
  );
}

// ── Pastilles de gain ───────────────────────────────────────────────────

interface Chip {
  key: string;
  text: string;
  /** Couleur du chiffre (`CHIP_TONES`). */
  tone: "attack" | "health" | "keyword" | "loss";
  start: Point;
  end: Point;
  size: number;
}

/**
 * Couleur du chiffre — les MÊMES que celles des caractéristiques sur la
 * carte (`statColorClass`, `CardTile`) : un gain vert, une perte rouge. Pas
 * de pastille ni de cadre : c'est le chiffre lui-même qui surgit, puis va
 * se fondre dans celui de la carte.
 */
const CHIP_TONES = {
  attack: "#6ee7b7",
  health: "#6ee7b7",
  keyword: "#c4b5fd",
  loss: "#fb7185",
} as const;

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/** Pastilles d'un gain : leur point de départ (au-dessus de la carte) et leur place d'arrivée. */
function chipsFor(buff: EffectBuff): Chip[] {
  const card = findElement("unit", buff.targetInstanceId);
  if (!card) return [];
  const box = card.getBoundingClientRect();
  const size = Math.max(22, Math.min(46, box.height * 0.2));
  const statCenter = (stat: "attack" | "resistance") => {
    const el = card.querySelector<HTMLElement>(`[data-stat="${stat}"]`);
    return el ? centerOf(el.getBoundingClientRect()) : { x: box.left + box.width / 2, y: box.bottom - box.height * 0.1 };
  };

  const entries: Array<Omit<Chip, "start" | "size">> = [];
  if (buff.attack !== 0) {
    entries.push({ key: "attack", text: signed(buff.attack), tone: buff.loss || buff.attack < 0 ? "loss" : "attack", end: statCenter("attack") });
  }
  if (buff.health !== 0) {
    entries.push({ key: "health", text: signed(buff.health), tone: buff.loss || buff.health < 0 ? "loss" : "health", end: statCenter("resistance") });
  }
  for (const keyword of buff.keywords) {
    // Les badges de mot-clé flottent au-dessus de la carte (`CardTile`).
    entries.push({ key: `kw-${keyword}`, text: keywordLabel(keyword), tone: "keyword", end: { x: box.left + box.width / 2, y: box.top - 4 } });
  }
  // Rangées côte à côte au-dessus de la carte, centrées.
  const gap = size * 1.8;
  return entries.map((entry, index) => ({
    ...entry,
    size,
    start: { x: box.left + box.width / 2 + (index - (entries.length - 1) / 2) * gap, y: box.top - size * 1.1 },
  }));
}

function BuffChip({ chip }: { chip: Chip }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const dx = chip.end.x - chip.start.x;
    const dy = chip.end.y - chip.start.y;
    // Surgit (léger dépassement), reste lisible un instant, puis file à sa place en rétrécissant.
    const animation = el.animate(
      [
        { transform: "translate(-50%, -50%) translateY(14px) scale(0.2)", opacity: 0, easing: "cubic-bezier(.2,1.6,.4,1)" },
        { transform: "translate(-50%, -50%) translateY(0) scale(1.3)", opacity: 1, offset: 0.2 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.32 },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.55, easing: "cubic-bezier(.55,0,.8,.4)" },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0.9, offset: 0.97 },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: BUFF_LAND_MS, fill: "forwards" }
    );
    return () => animation.cancel();
  }, [chip]);

  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute z-40"
      style={{
        left: chip.start.x,
        top: chip.start.y,
        opacity: 0,
        color: CHIP_TONES[chip.tone],
        fontFamily: "var(--font-card-title), Georgia, serif",
        // Un mot-clé est plus long qu'un chiffre : il se lit plus petit.
        fontSize: chip.size * (chip.tone === "keyword" ? 0.55 : 0.85),
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
        textShadow: THICK_TEXT_OUTLINE,
      }}
    >
      {chip.text}
    </span>
  );
}

// ── Raison qui s'abat sur la jauge ──────────────────────────────────────

/** Jauge de Raison d'un Navire (`data-reason-gauge`, `TableShip`). */
export function reasonGaugeOf(playerId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-reason-gauge="${playerId}"]`);
}

/** Où flotte un chiffre de Raison : au-dessus du médaillon, centré. */
export function reasonAnchor(gauge: HTMLElement): { x: number; y: number; size: number } {
  const r = gauge.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top - r.height * 0.55, size: Math.max(20, Math.min(40, r.height * 0.75)) };
}

function signedReason(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/**
 * Le prix d'une carte (ou un gain de Raison) : le chiffre flotte au-dessus
 * de la jauge — là même où l'aperçu du glisser l'affichait —, se décompte
 * s'il a été payé moins que son coût imprimé (Assemblage : −8 … −2), puis
 * s'abat sur la jauge, qui encaisse. La Raison affichée ne change qu'à
 * l'impact (`patchedDisplay`).
 */
function ReasonDrop({ entry }: { entry: EffectReason }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; size: number; fall: number } | null>(null);
  const [shown, setShown] = useState(entry.printed !== undefined ? -entry.printed : entry.amount);

  useLayoutEffect(() => {
    const gauge = reasonGaugeOf(entry.playerId);
    if (!gauge) return;
    const a = reasonAnchor(gauge);
    const r = gauge.getBoundingClientRect();
    setAnchor({ ...a, fall: r.top + r.height / 2 - a.y });
  }, [entry.playerId]);

  // Un chiffre qui attend son tour (`delayMs`) reste invisible jusque-là.
  const [visible, setVisible] = useState(!entry.delayMs);
  useEffect(() => {
    if (!entry.delayMs) return undefined;
    const id = window.setTimeout(() => setVisible(true), entry.delayMs);
    return () => window.clearTimeout(id);
  }, [entry.delayMs]);

  useEffect(() => {
    if (!anchor || !visible) return undefined;
    const el = ref.current;
    const timers: number[] = [];
    const animations: Animation[] = [];
    const countMs = entry.printed !== undefined ? REASON_COUNT_MS : 0;

    // Décompte : du coût imprimé au prix payé, un cran à la fois, chaque cran marqué d'un sursaut.
    if (entry.printed !== undefined) {
      const from = entry.printed;
      const to = -entry.amount;
      const steps = Math.max(1, from - to);
      for (let i = 1; i <= steps; i++) {
        timers.push(
          window.setTimeout(() => {
            setShown(-(from - i));
            el?.animate([{ transform: "translate(-50%, -50%) scale(1.25)" }, { transform: "translate(-50%, -50%) scale(1)" }], { duration: 160, easing: "ease-out" });
          }, 120 + ((countMs - 160) * i) / steps)
        );
      }
    }

    // La chute : le chiffre s'abat sur la jauge, qui encaisse (éclair, léger enfoncement).
    timers.push(
      window.setTimeout(() => {
        if (el) {
          animations.push(
            el.animate(
              [
                { transform: "translate(-50%, -50%) translateY(0) scale(1)", opacity: 1 },
                { transform: "translate(-50%, -50%) translateY(-10px) scale(1.12)", opacity: 1, offset: 0.25, easing: "cubic-bezier(.6,0,.9,.4)" },
                { transform: `translate(-50%, -50%) translateY(${anchor.fall}px) scale(0.7)`, opacity: 0.95, offset: 0.9 },
                { transform: `translate(-50%, -50%) translateY(${anchor.fall}px) scale(0.5)`, opacity: 0 },
              ],
              { duration: REASON_FALL_MS, fill: "forwards" }
            )
          );
        }
        timers.push(
          window.setTimeout(() => {
            reasonGaugeOf(entry.playerId)?.animate(
              [
                { transform: "scale(1)", filter: "brightness(1)" },
                { transform: "scale(0.9)", filter: entry.amount < 0 ? "brightness(1.7) drop-shadow(0 0 8px rgba(251,113,133,.9))" : "brightness(1.7) drop-shadow(0 0 8px rgba(110,231,183,.9))" },
                { transform: "scale(1)", filter: "brightness(1)" },
              ],
              { duration: 320, easing: "ease-out" }
            );
          }, REASON_FALL_MS * 0.9)
        );
      }, countMs)
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      animations.forEach((animation) => animation.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule chute par paiement.
  }, [anchor, visible]);

  if (!anchor || !visible) return null;
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute z-40"
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: "translate(-50%, -50%)",
        color: entry.amount < 0 ? CHIP_TONES.loss : CHIP_TONES.health,
        fontFamily: "var(--font-card-title), Georgia, serif",
        fontSize: anchor.size,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
        textShadow: THICK_TEXT_OUTLINE,
      }}
    >
      {signedReason(shown)}
    </span>
  );
}

// ── Une volée ───────────────────────────────────────────────────────────

/** Une orbe en charge devant un lanceur. */
interface Orb {
  key: string;
  kind: SpellKind;
  point: Point;
  size: number;
}

interface Launched {
  orbs: Orb[];
  /** Comètes d'attaque (avec leur impact) et boulets de canon. */
  shots: Array<ShotGeometry & { kind: SpellKind; start: Point }>;
  /** Comètes sans impact de dégâts : soin, renfort, malus — l'effet se pose à leur arrivée. */
  comets: Array<CometFlight & { key: string }>;
  heals: Array<{ key: string; box: Box; amount: number; sourced: boolean }>;
  chips: Array<Chip & { sourced: boolean }>;
}

function sourceKey(source: SpellSource): string {
  return `${source.from.kind}-${source.from.id}`;
}

function Volley({ volley }: { volley: EffectVolley }) {
  const [launched, setLaunched] = useState<Launched | null>(null);
  /** Phase de la volée : l'orbe se charge, les comètes volent, puis tout a touché. */
  const [phase, setPhase] = useState<"charge" | "flight" | "landed">("charge");

  useEffect(() => {
    const timers: number[] = [];
    // Tout se mesure AU DÉPART : un lanceur tout juste posé a fini de glisser.
    timers.push(
      window.setTimeout(() => {
        // Les cartes qui déclenchent leur capacité se réveillent : elles se soulèvent, pulsent, retombent.
        for (const id of volley.awakens) {
          const el = findElement("unit", id);
          if (el) awakenCard(el);
        }

        /** Élément d'un lanceur : sa carte, ou — introuvable (Structure cachée, carte partie) — le Navire de son contrôleur. */
        const casterEl = (source: SpellSource) => elementOf(source.from) ?? findElement("ship", source.originPlayerId);
        const orbs = new Map<string, Orb>();
        const orbFor = (source: SpellSource, kind: SpellKind): Point | null => {
          const key = sourceKey(source);
          const known = orbs.get(key);
          if (known) return known.point;
          const el = casterEl(source);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const orb = { key, kind, point: orbPointFor(rect), size: Math.min(rect.height, 220) };
          orbs.set(key, orb);
          return orb.point;
        };

        const shots: Launched["shots"] = [];
        for (const shot of volley.shots) {
          const toEl = elementOf(shot.to);
          if (!toEl) continue;
          const toRect = toEl.getBoundingClientRect();
          const size = Math.min(toRect.height, 220);
          if (shot.look === "magic") {
            const start = orbFor(shot, "attack");
            if (start) shots.push({ shot, kind: "attack", from: start, start, to: centerOf(toRect), size });
          } else {
            const fromEl = casterEl(shot);
            if (fromEl) {
              const from = centerOf(fromEl.getBoundingClientRect());
              shots.push({ shot, kind: "attack", from, start: from, to: centerOf(toRect), size });
            }
          }
        }

        const comets: Launched["comets"] = [];
        const heals = volley.heals.flatMap((heal, index) => {
          const el = elementOf(heal.to);
          if (!el) return [];
          const box = boxOf(el);
          const start = heal.source ? orbFor(heal.source, "heal") : null;
          if (start) comets.push({ key: `h${index}`, kind: "heal", from: start, to: centerOf(el.getBoundingClientRect()), size: Math.min(box.height, 220) });
          return [{ key: `${heal.to.kind}-${heal.to.id}-${index}`, box, amount: heal.amount, sourced: Boolean(start) }];
        });
        const chips = volley.buffs.flatMap((buff, index) => {
          const kind: SpellKind = buff.loss ? "malus" : "heal";
          const start = buff.source ? orbFor(buff.source, kind) : null;
          const target = findElement("unit", buff.targetInstanceId);
          if (start && target) {
            const rect = target.getBoundingClientRect();
            comets.push({ key: `b${index}`, kind, from: start, to: centerOf(rect), size: Math.min(rect.height, 220) });
          }
          return chipsFor(buff).map((chip) => ({ ...chip, key: `${index}-${chip.key}`, sourced: Boolean(start) }));
        });

        setLaunched({ orbs: [...orbs.values()], shots, comets, heals, chips });
        if (orbs.size > 0) {
          // L'orbe se forme pendant que le lanceur est soulevé : le son du sort part avec elle.
          timers.push(window.setTimeout(playSpellCast, volley.awakens.length > 0 ? AWAKE_LIFT_MS : 0));
        }

        // Les comètes quittent leur orbe ; le boulet du canon, lui, est parti tout de suite.
        timers.push(window.setTimeout(() => setPhase("flight"), volley.castMs));
        timers.push(
          window.setTimeout(() => {
            setPhase("landed");
            // Un Navire ne joue pas d'animation de choc à lui : on le secoue.
            // Une unité qui encaisse joue déjà `animate-card-impact` quand
            // l'état réel s'affiche, au même instant.
            for (const shot of volley.shots) {
              if (shot.to.kind !== "ship") continue;
              const el = elementOf(shot.to);
              if (el) shake(el);
            }
          }, volley.castMs + SHOT_FLIGHT_MS)
        );
      }, volley.delayMs)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une volée ne se joue qu'une fois.
  }, []);

  if (!launched) return null;
  const charging = phase === "charge" && volley.castMs > 0;
  const landed = phase === "landed";
  return (
    <>
      {charging &&
        launched.orbs.map((orb) => (
          // L'orbe attend que le lanceur soit soulevé pour naître.
          <DelayedMount key={orb.key} delayMs={volley.awakens.length > 0 ? AWAKE_LIFT_MS : 0}>
            <SpellOrb kind={orb.kind} point={orb.point} size={orb.size} />
          </DelayedMount>
        ))}
      {launched.shots.map((geometry, index) =>
        // Le boulet vole dès le départ ; une comète d'attaque après la charge de son orbe.
        geometry.shot.look === "cannon"
          ? !landed && <CannonBall key={`p${index}`} geometry={geometry} />
          : phase === "flight" && <Comet key={`p${index}`} flight={geometry} />
      )}
      {phase === "flight" && launched.comets.map((comet) => <Comet key={comet.key} flight={comet} />)}
      {landed && launched.shots.map((geometry, index) => <ShotImpact key={`i${index}`} geometry={geometry} />)}
      {launched.heals.map((heal) =>
        !heal.sourced || landed ? <HealVeil key={heal.key} box={heal.box} amount={heal.amount} /> : null
      )}
      {launched.chips.map((chip) => (!chip.sourced || landed ? <BuffChip key={chip.key} chip={chip} /> : null))}
    </>
  );
}

/** Monte ses enfants après `delayMs` (l'orbe naît quand le lanceur est soulevé). */
function DelayedMount({ delayMs, children }: { delayMs: number; children: React.ReactNode }) {
  const [shown, setShown] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return undefined;
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
  return shown ? <>{children}</> : null;
}

export function EffectFxLayer({ volleys }: { volleys: EffectVolley[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {volleys.map((volley) => (
        <Volley key={volley.id} volley={volley} />
      ))}
      {/* Le prix se paie à la pose : il n'attend pas le délai d'arrivée de la volée. */}
      {volleys.flatMap((volley) => volley.reason.map((entry, index) => <ReasonDrop key={`${volley.id}-r${index}`} entry={entry} />))}
    </div>
  );
}
