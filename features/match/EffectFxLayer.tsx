"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { centerOf, findElement, FloatingDamage, ImpactDust, ImpactExplosion, ImpactFlash, shake, SicknessBubbles, tremble, type Point } from "@/features/match/AttackImpactLayer";
import { IMPACT_SCALE, impactTier, screenQuake, type ImpactTier } from "@/features/match/impactTier";
import { FxCanvas } from "@/features/match/FxCanvas";
import { faceOf, silhouetteMask, silhouetteOf, type Silhouette } from "@/features/match/silhouette";
import { awakenCard, breakObject, orbAura } from "@/features/match/cardFx";
import { keywordLabel, THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";
import {
  AWAKE_LIFT_MS,
  BREAK_SHATTER_MS,
  breakShatterAtMs,
  BUFF_LAND_MS,
  GLOW_LAND_MS,
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
import { arcControl, arcPoint, COMET_LINGER_MS, cometBounds, createCometPainter, drawOrb, seedFrom, type SpellKind } from "@/features/match/spellFx";

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

/** Points d'un arc (Bézier quadratique) de `from` à `to`, bombé vers le haut — le même que celui des comètes. */
function arc(from: Point, to: Point, steps = 12): Point[] {
  const control = arcControl(from, to);
  return Array.from({ length: steps + 1 }, (_, i) => arcPoint(from, control, to, i / steps));
}

// ── Sorts : l'orbe, puis les comètes ─────────────────────────────────────

interface ShotGeometry {
  shot: EffectShot;
  from: Point;
  to: Point;
  /** Hauteur de la cible à l'écran : les effets suivent la taille du plateau. */
  size: number;
  /** La cible, mesurée au départ : la poussière d'un boulet s'échappe tout autour. */
  rect?: DOMRect;
  /** Sa silhouette : un jeton est ovale (`silhouette.ts`). */
  shape?: Silhouette;
}

/**
 * Orbe et comète sont DESSINÉES image par image (`spellFx.ts`) : la traînée
 * suit la vraie trajectoire au lieu d'une illustration rigide qu'on faisait
 * glisser, et l'orbe aspire sa lumière au lieu d'être un simple dégradé.
 */
export type { SpellKind };

/** Une comète de sort, du point de départ (l'orbe) à sa cible, le long d'un arc. */
export interface CometFlight {
  kind: SpellKind;
  from: Point;
  to: Point;
  size: number;
  /** Sens « devant » du lanceur (`forwardOf`) : une cible qui n'y est pas reçoit le tir en boomerang. */
  forward: number;
}

export function Comet({ flight }: { flight: CometFlight }) {
  const [plan] = useState(() => ({ ...flight, flightMs: SHOT_FLIGHT_MS }));
  const [paint] = useState(() => createCometPainter(plan));
  // Le ruban se résorbe dans la cible et les particules finissent leur vie après l'arrivée.
  return <FxCanvas bounds={cometBounds(plan)} durationMs={SHOT_FLIGHT_MS + COMET_LINGER_MS} paint={paint} />;
}

/** L'orbe qui se forme devant le lanceur : elle aspire sa lumière, scintille, s'embrase, puis éclate en comètes. */
export function SpellOrb({ kind, point, size }: { kind: SpellKind; point: Point; size: number }) {
  const diameter = Math.max(40, Math.min(96, size * 0.5));
  const reach = diameter * 1.6;
  const [seed] = useState(() => seedFrom(point.x, point.y, size));
  return (
    <FxCanvas
      bounds={{ left: point.x - reach, top: point.y - reach, width: reach * 2, height: reach * 2 }}
      durationMs={ORB_CHARGE_MS}
      paint={(ctx, elapsed) => drawOrb(ctx, point, diameter, elapsed / ORB_CHARGE_MS, kind, seed)}
    />
  );
}

/**
 * Sens « devant » d'un lanceur, à la verticale : vers l'autre camp, c'est-à-
 * dire vers le milieu de la table (+1 : vers le bas de l'écran, −1 : vers le
 * haut).
 */
export function forwardOf(caster: DOMRect): number {
  return caster.top + caster.height / 2 < window.innerHeight / 2 ? 1 : -1;
}

/**
 * Où se forme l'orbe : au BORD de la carte tourné vers la table, en son
 * centre — le bas d'une carte d'en face, le haut d'une carte de son propre
 * camp : le tir part devant, jamais à travers la carte. Visé là où le bord
 * sera une fois la carte SOULEVÉE par son réveil (`awakenCard` :
 * `translateY(-9%) scale(1.07)` autour de son centre) — la mesure se fait
 * avant le soulèvement, et l'orbe doit naître accrochée à la carte levée.
 */
export function orbPointFor(caster: DOMRect): Point {
  const x = caster.left + caster.width / 2;
  return forwardOf(caster) > 0
    ? { x, y: caster.bottom - caster.height * (AWAKE_LIFT_Y - AWAKE_LIFT_GROW / 2) }
    : { x, y: caster.top - caster.height * (AWAKE_LIFT_Y + AWAKE_LIFT_GROW / 2) };
}

/** Réveil d'une carte (cf. `awakenCard`) : montée et grossissement, en fraction de sa hauteur. */
const AWAKE_LIFT_Y = 0.09;
const AWAKE_LIFT_GROW = 0.07;

/** Le boulet du canon : fonte sombre, liseré de feu. */
const CANNON_LOOK = {
  background: "radial-gradient(circle at 35% 32%, #9ca3af 0%, #374151 38%, #111827 75%)",
  boxShadow: "0 0 10px 3px rgba(251,146,60,0.55), 0 3px 6px rgba(0,0,0,0.6)",
} as const;

/** Le boulet du canon et sa traînée : trois échos plus petits qui suivent le même arc avec un léger retard. */
function CannonBall({ geometry }: { geometry: ShotGeometry }) {
  const host = useRef<HTMLDivElement>(null);
  const { shot, from, to, size } = geometry;
  // Plafond assez haut pour qu'un boulet LOURD (`PROJECTILE_SCALE`) reste plus gros.
  const orb = Math.max(18, Math.min(80, size * 0.22));

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

/** Taille du projectile selon le palier du coup (`impactTier`) : le choc, lui, suit `IMPACT_SCALE`. */
const PROJECTILE_SCALE = { light: 1, heavy: 1.35, massive: 1.8 } as const;

function ShotImpact({ geometry }: { geometry: ShotGeometry }) {
  const tint = geometry.shot.look === "glow" ? "magic" : geometry.shot.look === "drain" ? "tide" : geometry.shot.look;
  // Un malus ne blesse pas : il garde son éclat ordinaire.
  const tier = geometry.shot.look === "drain" ? "light" : impactTier(geometry.shot.amount);
  return (
    <>
      <ImpactFlash point={geometry.to} tint={tint} tier={tier} />
      {tier === "massive" && <ImpactExplosion point={geometry.to} tint={tint} />}
      {geometry.shot.look === "cannon" && geometry.rect && <ImpactDust plan={{ rect: geometry.rect, from: geometry.from, shape: geometry.shape }} />}
      {/* Un malus ne blesse pas : pas de plaque de dégâts (la Raison perdue tombe sur sa jauge). */}
      {geometry.shot.look !== "drain" && <FloatingDamage point={geometry.to} amount={geometry.shot.amount} />}
    </>
  );
}

// ── Voile de soin ───────────────────────────────────────────────────────

const SPARKS = 9;

function HealVeil({ box, amount, shape = "card", mask = null }: { box: Box; amount: number; shape?: Silhouette; mask?: Record<string, string> | null }) {
  // Un jeton est ovale : le rideau de lumière épouse son ovale, pas le rectangle d'une carte.
  // Un Navire : le rideau est découpé à la forme de son cadre (`mask`), arche comprise.
  const round = shape === "oval" ? "50%" : shape === "ship" ? "0px" : "10px";
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
            { clipPath: `inset(0 0 100% 0 round ${round})`, opacity: 0.2, filter: "brightness(1)" },
            { clipPath: `inset(0 0 0% 0 round ${round})`, opacity: 0.95, filter: "brightness(1.25)", offset: covered },
            { clipPath: `inset(0 0 0% 0 round ${round})`, opacity: 0.75, filter: "brightness(1)", offset: 0.62 },
            { clipPath: `inset(0 0 0% 0 round ${round})`, opacity: 0, filter: "brightness(1)" },
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
          inset: 0,
          borderRadius: shape === "oval" ? "50%" : mask ? 0 : 10,
          ...(mask ?? {}),
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
  /** Sens « devant » du lanceur : ses comètes vers un allié partent en boomerang. */
  forward: number;
}

interface Launched {
  orbs: Orb[];
  /** Comètes d'attaque (avec leur impact) et boulets de canon. */
  shots: Array<ShotGeometry & { kind: SpellKind; start: Point; forward: number }>;
  /* `kind` : la famille de la comète — `attack` pour un sort, `malus` (pourpre) pour l'orbe de la Marée. */
  /** Comètes sans impact de dégâts : soin, renfort, malus — l'effet se pose à leur arrivée. */
  comets: Array<CometFlight & { key: string }>;
  heals: Array<{ key: string; box: Box; amount: number; at: Landing; shape: Silhouette; mask: Record<string, string> | null }>;
  chips: Array<Chip & { at: Landing }>;
  /** Cartes touchées sans dégâts (détruites, renvoyées, un état) : un éclair là où le sort arrive. */
  touches: Array<{ key: string; point: Point; tint: "magic" | "tide"; at: Landing; target: FxTarget; tone: SpellKind; chip?: Chip }>;
}

/** Quand un effet se pose : tout de suite (sans lanceur), à la lueur de sa carte (effet activé), ou à l'arrivée de sa comète (sort lancé). */
type Landing = "now" | "glow" | "landed";

function sourceKey(source: SpellSource): string {
  return `${source.from.kind}-${source.from.id}`;
}

function Volley({ volley }: { volley: EffectVolley }) {
  const [launched, setLaunched] = useState<Launched | null>(null);
  /** Phase de la volée : l'orbe se charge, les comètes volent, puis tout a touché. */
  const [phase, setPhase] = useState<"charge" | "flight" | "landed">("charge");
  /** Les effets ACTIVÉS (sans projectile) ont touché : au plus fort de la lueur de leur carte. */
  const [glowed, setGlowed] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    // Tout se mesure AU DÉPART : un lanceur tout juste posé a fini de glisser.
    timers.push(
      window.setTimeout(() => {
        // Les cartes qui déclenchent leur capacité se réveillent : elles se soulèvent, pulsent, retombent.
        for (const id of volley.awakens) {
          const el = findElement("unit", id);
          if (el) awakenCard(el, 0, volley.awakenTones?.[id]);
        }

        // Objets brisés : chacun quitte sa place pour se tenir au-dessus de son Cimetière, s'y illumine, puis éclate
        // au départ de son sort — qui part de LÀ (`breakRects`).
        const breakRects = new Map<string, DOMRect>();
        for (const broken of volley.breaks ?? []) {
          const ship = findElement("ship", broken.ownerId)?.getBoundingClientRect();
          const piles = Array.from(document.querySelectorAll<HTMLElement>("[data-graveyard]"));
          const pile = ship
            ? piles.sort((a, b) => Math.abs(centerOf(a.getBoundingClientRect()).y - (ship.top + ship.height / 2)) - Math.abs(centerOf(b.getBoundingClientRect()).y - (ship.top + ship.height / 2)))[0]
            : piles[0];
          if (!pile) continue;
          // Un Objet joué n'est jamais posé : il est déjà sur la pile du Cimetière.
          const face = pile.querySelector<HTMLElement>("[data-graveyard-top] > *");
          const to = pile.getBoundingClientRect();
          const from = face?.getBoundingClientRect();
          if (!face || !from || from.width === 0) continue;
          breakObject(broken.instanceId, face, from, to, broken.tone, breakShatterAtMs(volley), BREAK_SHATTER_MS);
          // Là où elle se tient : au-dessus de la pile, un peu plus grande qu'elle.
          const height = to.height * 1.18;
          const width = from.width * (height / from.height);
          const cx = to.left + to.width / 2;
          const cy = to.top + to.height / 2 - to.height * 0.12;
          breakRects.set(broken.instanceId, new DOMRect(cx - width / 2, cy - height / 2, width, height));
        }

        /** Élément d'un lanceur : sa carte, ou — introuvable (Structure cachée, carte partie) — le Navire de son contrôleur. */
        const casterEl = (source: SpellSource) => elementOf(source.from) ?? findElement("ship", source.originPlayerId);
        const orbs = new Map<string, Orb>();
        const orbFor = (source: SpellSource, kind: SpellKind): Orb | null => {
          const key = sourceKey(source);
          const known = orbs.get(key);
          if (known) return known;
          const brokenAt = source.from.kind === "unit" ? breakRects.get(source.from.id) : undefined;
          const el = brokenAt ? null : casterEl(source);
          if (!brokenAt && !el) return null;
          const rect = brokenAt ?? el!.getBoundingClientRect();
          const orb = { key, kind, point: orbPointFor(rect), size: Math.min(rect.height, 220), forward: forwardOf(rect) };
          orbs.set(key, orb);
          return orb;
        };

        const shots: Launched["shots"] = [];
        for (const shot of volley.shots) {
          const toEl = elementOf(shot.to);
          if (!toEl) continue;
          const toRect = toEl.getBoundingClientRect();
          // Un projectile qui porte plus de dégâts est plus GROS (`impactTier` : 4-5, puis 6+).
          const size = Math.min(toRect.height, 220) * PROJECTILE_SCALE[impactTier(shot.amount)];
          if (shot.look === "magic" || shot.look === "drain") {
            const kind: SpellKind = shot.look === "drain" ? "malus" : "attack";
            const orb = orbFor(shot, kind);
            if (orb) shots.push({ shot, kind, from: orb.point, start: orb.point, to: centerOf(toRect), size, forward: orb.forward });
          } else if (shot.look === "tide") {
            // La Marée frappe : une orbe pourpre se forme sur sa piste, et ses comètes partent vers chaque cible.
            const track = document.querySelector<HTMLElement>("[data-tide-track]");
            if (!track) continue;
            const trackRect = track.getBoundingClientRect();
            let orb = orbs.get("tide");
            if (!orb) {
              orb = { key: "tide", kind: "malus", point: centerOf(trackRect), size: Math.min(trackRect.height * 1.4, 160), forward: 0 };
              orbs.set("tide", orb);
            }
            const to = centerOf(toRect);
            // Toujours « devant » l'orbe : l'arc simple, vers le haut ou vers le bas de la table.
            shots.push({ shot, kind: "malus", from: orb.point, start: orb.point, to, size, forward: Math.sign(to.y - orb.point.y) || 1 });
          } else if (shot.look === "glow") {
            // Effet ACTIVÉ par un permanent : pas de projectile, la carte s'illumine et le coup tombe sur sa cible.
            const at = centerOf(toRect);
            shots.push({ shot, kind: "attack", from: at, start: at, to: at, size, forward: 0, rect: toRect, shape: silhouetteOf(toEl) });
          } else if (shot.look === "sickness") {
            // La maladie : pas de projectile, des bulles qui éclatent sur l'unité elle-même.
            const at = centerOf(toRect);
            shots.push({ shot, kind: "malus", from: at, start: at, to: at, size, forward: 0, rect: toRect, shape: silhouetteOf(toEl) });
          } else {
            const fromEl = casterEl(shot);
            if (fromEl) {
              const from = centerOf(fromEl.getBoundingClientRect());
              shots.push({ shot, kind: "attack", from, start: from, to: centerOf(toRect), size, forward: 0, rect: toRect, shape: silhouetteOf(toEl) });
            }
          }
        }

        const comets: Launched["comets"] = [];
        const heals = volley.heals.flatMap((heal, index) => {
          const el = elementOf(heal.to);
          if (!el) return [];
          // Sur la face de la carte, pas sur son enveloppe de plateau : le voile la recouvre au bord près.
          const box = boxOf(faceOf(el));
          // Un sort lancé part de son orbe ; un effet activé se pose au plus fort de la lueur de sa carte.
          const start = heal.source && !heal.source.glow ? orbFor(heal.source, "heal") : null;
          if (start) {
            comets.push({ key: `h${index}`, kind: "heal", from: start.point, to: centerOf(el.getBoundingClientRect()), size: Math.min(box.height, 220), forward: start.forward });
          }
          const at: Landing = heal.source?.glow ? "glow" : start ? "landed" : "now";
          return [{ key: `${heal.to.kind}-${heal.to.id}-${index}`, box, amount: heal.amount, at, shape: silhouetteOf(el), mask: silhouetteMask(el) }];
        });
        const chips = volley.buffs.flatMap((buff, index) => {
          const kind: SpellKind = buff.loss ? "malus" : "heal";
          const start = buff.source && !buff.source.glow ? orbFor(buff.source, kind) : null;
          const target = findElement("unit", buff.targetInstanceId);
          if (start && target) {
            const rect = target.getBoundingClientRect();
            comets.push({ key: `b${index}`, kind, from: start.point, to: centerOf(rect), size: Math.min(rect.height, 220), forward: start.forward });
          }
          const at: Landing = buff.source?.glow ? "glow" : start ? "landed" : "now";
          return chipsFor(buff).map((chip) => ({ ...chip, key: `${index}-${chip.key}`, at }));
        });

        // Destruction, état, renvoi : la comète du sort (ou le halo d'un effet activé) jusqu'à la carte touchée.
        const touches = (volley.touches ?? []).flatMap((touch, index) => {
          const el = elementOf(touch.to);
          if (!el) return [];
          const rect = el.getBoundingClientRect();
          const start = touch.source.glow ? null : orbFor(touch.source, touch.tone);
          if (start) comets.push({ key: `t${index}`, kind: touch.tone, from: start.point, to: centerOf(rect), size: Math.min(rect.height, 220), forward: start.forward });
          const at: Landing = touch.source.glow ? "glow" : start ? "landed" : "now";
          // Armure gagnée : le chiffre surgit au-dessus du Navire, puis se range sur lui.
          const size = Math.max(22, Math.min(46, rect.height * 0.2));
          const chip: Chip | undefined =
            touch.kind === "armor" && touch.amount
              ? { key: `armor${index}`, text: `+${touch.amount} Armure`, tone: "keyword", size, start: { x: rect.left + rect.width / 2, y: rect.top - size * 0.6 }, end: centerOf(rect) }
              : undefined;
          return [{ key: `t${index}`, point: centerOf(rect), tint: touch.tone === "malus" ? ("tide" as const) : ("magic" as const), at, target: touch.to, tone: touch.tone, chip }];
        });

        setLaunched({ orbs: [...orbs.values()], shots, comets, heals, chips, touches });
        // La carte touchée s'embrase du halo de l'effet à l'impact.
        const auraAt = (at: Landing) => (at === "glow" ? GLOW_LAND_MS : at === "landed" ? volley.castMs + SHOT_FLIGHT_MS : 0);
        for (const touch of touches) {
          timers.push(
            window.setTimeout(() => {
              const el = elementOf(touch.target);
              if (el) orbAura(el, touch.tone, { durationMs: 700, burst: true });
            }, auraAt(touch.at))
          );
        }
        if (orbs.size > 0) {
          // L'orbe se forme pendant que le lanceur est soulevé : le son du sort part avec elle.
          timers.push(window.setTimeout(playSpellCast, volley.awakens.length > 0 ? AWAKE_LIFT_MS : 0));
        }

        // Un effet activé touche au plus fort de la lueur de sa carte.
        timers.push(
          window.setTimeout(() => {
            setGlowed(true);
            for (const shot of volley.shots) {
              if (shot.look !== "glow") continue;
              const el = elementOf(shot.to);
              if (!el) continue;
              // Sans projectile, c'est le halo d'orbe qui relie l'effet à sa cible : il éclate sur elle.
              orbAura(el, "attack", { durationMs: 750, burst: true });
              if (shot.to.kind === "ship") shake(el);
            }
            for (const heal of volley.heals) {
              const el = heal.source?.glow ? elementOf(heal.to) : null;
              if (el) orbAura(el, "heal", { durationMs: 750, burst: true });
            }
            for (const buff of volley.buffs) {
              const el = buff.source?.glow ? findElement("unit", buff.targetInstanceId) : null;
              if (el) orbAura(el, buff.loss ? "malus" : "heal", { durationMs: 750, burst: true });
            }
          }, GLOW_LAND_MS)
        );
        // Les comètes quittent leur orbe ; le boulet du canon, lui, est parti tout de suite.
        timers.push(window.setTimeout(() => setPhase("flight"), volley.castMs));
        timers.push(
          window.setTimeout(() => {
            setPhase("landed");
            // Un Navire ne joue pas d'animation de choc à lui : on le secoue.
            // Une unité qui encaisse joue déjà `animate-card-impact` quand
            // l'état réel s'affiche, au même instant.
            // L'écran tremble une fois, selon le coup le plus fort de la volée (4+ : un projectile lourd se sent).
            const strongest = volley.shots.reduce<ImpactTier>((best, shot) => {
              const tier = shot.look === "drain" ? "light" : impactTier(shot.amount);
              return IMPACT_SCALE[tier] > IMPACT_SCALE[best] ? tier : best;
            }, "light");
            if (strongest !== "light") screenQuake(strongest);
            for (const shot of volley.shots) {
              const el = elementOf(shot.to);
              if (!el) continue;
              const tier = shot.look === "drain" ? "light" : impactTier(shot.amount);
              // Un boulet est un coup physique : ce qu'il touche tremble, comme au combat — selon sa force.
              // Un sort lourd (4+) fait trembler sa cible lui aussi.
              if (shot.look === "cannon" || tier !== "light") tremble(el, tier);
              // La comète d'un sort éclate en halo d'orbe sur sa cible.
              if (shot.look === "magic" || shot.look === "drain") orbAura(el, shot.look === "drain" ? "malus" : "attack", { durationMs: 650, burst: true });
              if (shot.to.kind !== "ship" && tier !== "massive") continue;
              shake(el, tier);
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
          // L'orbe naît quand son lanceur est prêt : soulevé, ou arrivé au-dessus de son Cimetière s'il se brise.
          <DelayedMount key={orb.key} delayMs={Math.max(0, volley.castMs - ORB_CHARGE_MS)}>
            <SpellOrb kind={orb.kind} point={orb.point} size={orb.size} />
          </DelayedMount>
        ))}
      {launched.shots.map((geometry, index) =>
        // Le boulet vole dès le départ ; une comète d'attaque après la charge de son orbe.
        geometry.shot.look === "cannon"
          ? !landed && <CannonBall key={`p${index}`} geometry={geometry} />
          : geometry.shot.look === "sickness"
            ? // Les bulles montent pendant le « vol » ; le dégât tombe sur leurs éclats.
              phase !== "charge" && geometry.rect && <SicknessBubbles key={`p${index}`} rect={geometry.rect} shape={geometry.shape} />
            : geometry.shot.look === "glow"
              ? null
              : phase !== "charge" && <Comet key={`p${index}`} flight={geometry} />
      )}
      {phase !== "charge" && launched.comets.map((comet) => <Comet key={comet.key} flight={comet} />)}
      {launched.shots.map((geometry, index) =>
        (geometry.shot.look === "glow" ? glowed : landed) ? <ShotImpact key={`i${index}`} geometry={geometry} /> : null
      )}
      {launched.heals.map((heal) =>
        heal.at === "now" || (heal.at === "glow" ? glowed : landed) ? <HealVeil key={heal.key} box={heal.box} amount={heal.amount} shape={heal.shape} mask={heal.mask} /> : null
      )}
      {launched.chips.map((chip) => (chip.at === "now" || (chip.at === "glow" ? glowed : landed) ? <BuffChip key={chip.key} chip={chip} /> : null))}
      {launched.touches.map((touch) =>
        touch.at === "now" || (touch.at === "glow" ? glowed : landed) ? (
          <span key={touch.key}>
            <ImpactFlash point={touch.point} tint={touch.tint} />
            {touch.chip && <BuffChip chip={touch.chip} />}
          </span>
        ) : null
      )}
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
