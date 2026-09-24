"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { centerOf, findElement, FloatingDamage, ImpactFlash, shake, SmokeBurst, type Point } from "@/features/match/AttackImpactLayer";
import { keywordLabel, THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";
import {
  BUFF_LAND_MS,
  HEAL_APPLY_MS,
  HEAL_TOTAL_MS,
  SHOT_FLIGHT_MS,
  type EffectBuff,
  type EffectShot,
  type EffectVolley,
  type FxTarget,
} from "@/features/match/effectPresentation";

/**
 * Mise en scène des EFFETS (`effectPresentation.ts`) — tout en coordonnées
 * VIEWPORT (`fixed inset-0`), mesuré sur les éléments du plateau au moment
 * du départ :
 *
 *   - projectile : une orbe (ou le boulet du canon) part du lanceur et file
 *     vers sa cible en arc ; toutes les cibles d'un même effet sont visées
 *     EN MÊME TEMPS. À l'arrivée : flash, plaque de dégâts, tremblement ;
 *   - soin : un voile lumineux descend sur la cible, scintille et s'efface ;
 *   - gain / perte : le chiffre (+1, −1…) surgit au-dessus de la carte, se montre,
 *     puis file se ranger sur la valeur qu’il modifie (Puissance,
 *     Résistance, ou la rangée des badges pour un mot-clé).
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

// ── Projectile ──────────────────────────────────────────────────────────

interface ShotGeometry {
  shot: EffectShot;
  from: Point;
  to: Point;
  /** Hauteur de la cible à l'écran : les effets suivent la taille du plateau. */
  size: number;
}

const ORB_LOOKS = {
  magic: {
    background: "radial-gradient(circle at 40% 38%, #ffffff 0%, #cffafe 22%, #67e8f9 42%, #a78bfa 70%, rgba(139,92,246,0) 100%)",
    boxShadow: "0 0 14px 5px rgba(125,211,252,0.75), 0 0 34px 12px rgba(167,139,250,0.45)",
  },
  cannon: {
    background: "radial-gradient(circle at 35% 32%, #9ca3af 0%, #374151 38%, #111827 75%)",
    boxShadow: "0 0 10px 3px rgba(251,146,60,0.55), 0 3px 6px rgba(0,0,0,0.6)",
  },
} as const;

/** L'orbe et sa traînée : trois échos plus petits qui suivent le même arc avec un léger retard. */
function Projectile({ geometry }: { geometry: ShotGeometry }) {
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

  const look = ORB_LOOKS[shot.look];
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

// ── Une volée ───────────────────────────────────────────────────────────

interface Launched {
  shots: ShotGeometry[];
  heals: Array<{ key: string; box: Box; amount: number }>;
  chips: Chip[];
}

function Volley({ volley }: { volley: EffectVolley }) {
  const [launched, setLaunched] = useState<Launched | null>(null);
  const [impacted, setImpacted] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    // Tout se mesure AU DÉPART : un lanceur tout juste posé a fini de glisser.
    timers.push(
      window.setTimeout(() => {
        const shots: ShotGeometry[] = [];
        for (const shot of volley.shots) {
          // Lanceur introuvable à l'écran (Structure cachée, carte déjà partie) : le Navire de son contrôleur.
          const fromEl = elementOf(shot.from) ?? findElement("ship", shot.originPlayerId);
          const toEl = elementOf(shot.to);
          if (!fromEl || !toEl) continue;
          const toRect = toEl.getBoundingClientRect();
          shots.push({ shot, from: centerOf(fromEl.getBoundingClientRect()), to: centerOf(toRect), size: Math.min(toRect.height, 220) });
        }
        const heals = volley.heals.flatMap((heal, index) => {
          const el = elementOf(heal.to);
          return el ? [{ key: `${heal.to.kind}-${heal.to.id}-${index}`, box: boxOf(el), amount: heal.amount }] : [];
        });
        const chips = volley.buffs.flatMap((buff, index) => chipsFor(buff).map((chip) => ({ ...chip, key: `${index}-${chip.key}` })));
        setLaunched({ shots, heals, chips });

        if (volley.shots.length > 0) {
          timers.push(
            window.setTimeout(() => {
              setImpacted(true);
              // Un Navire ne joue pas d'animation de choc à lui : on le secoue.
              // Une unité qui encaisse joue déjà `animate-card-impact` quand
              // l'état réel s'affiche, au même instant.
              for (const shot of volley.shots) {
                if (shot.to.kind !== "ship") continue;
                const el = elementOf(shot.to);
                if (el) shake(el);
              }
            }, SHOT_FLIGHT_MS)
          );
        }
      }, volley.delayMs)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une volée ne se joue qu'une fois.
  }, []);

  if (!launched) return null;
  return (
    <>
      {!impacted && launched.shots.map((geometry, index) => <Projectile key={`p${index}`} geometry={geometry} />)}
      {impacted && launched.shots.map((geometry, index) => <ShotImpact key={`i${index}`} geometry={geometry} />)}
      {launched.heals.map((heal) => (
        <HealVeil key={heal.key} box={heal.box} amount={heal.amount} />
      ))}
      {launched.chips.map((chip) => (
        <BuffChip key={chip.key} chip={chip} />
      ))}
    </>
  );
}

export function EffectFxLayer({ volleys }: { volleys: EffectVolley[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {volleys.map((volley) => (
        <Volley key={volley.id} volley={volley} />
      ))}
    </div>
  );
}
