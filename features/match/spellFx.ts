/**
 * SORTS DESSINÉS — l'orbe qui se charge et la comète qui vole, peintes image
 * par image sur un canvas.
 *
 * Jusqu'au 12/10/2026, la comète était une illustration rigide (un PNG avec
 * sa traînée déjà courbée) qu'on faisait glisser et pivoter le long d'un arc
 * qui n'avait pas sa forme : « on voit juste un PNG envoyé ». Et l'orbe
 * n'était qu'un dégradé radial qui grossissait. Ici, rien n'est une image :
 *
 *   - la TRAÎNÉE est un ruban recalculé à chaque image sur la trajectoire
 *     réelle — elle épouse l'arc, s'affine vers la queue, puis se résorbe
 *     dans la cible à l'arrivée ;
 *   - la TÊTE est un cœur lumineux et son étoile d'éclat ;
 *   - des PARTICULES s'en détachent et vivent leur vie (éclats de glace pour
 *     l'attaque, étincelles d'or pour le soin, volutes pourpres pour le
 *     malus) ;
 *   - l'ORBE aspire en spirale des étincelles vers un cœur qui scintille,
 *     sous un anneau qui tourne, et s'embrase juste avant le départ.
 *
 * Tout est en mélange ADDITIF (`lighter`) : les lumières se cumulent comme de
 * la lumière, pas comme de la peinture. Aléa à graine fixe par effet : deux
 * comètes d'une même volée ne sont pas jumelles, mais une comète donnée se
 * dessine de façon stable d'une image à l'autre.
 */

export interface Point {
  x: number;
  y: number;
}

/** Famille d'un sort : chacune a sa lumière et ses particules. */
export type SpellKind = "attack" | "heal" | "malus";

interface Palette {
  /** Cœur, presque blanc. */
  core: string;
  /** Teinte principale, en `r,g,b`. */
  main: string;
  /** Teinte profonde, en `r,g,b` — la lueur large et le bout de la traînée. */
  deep: string;
  /** Particules claires, en `r,g,b`. */
  spark: string;
  particle: "shard" | "spark" | "wisp";
}

export const SPELL_PALETTES: Record<SpellKind, Palette> = {
  attack: { core: "255,255,255", main: "125,211,252", deep: "37,99,235", spark: "224,242,254", particle: "shard" },
  heal: { core: "255,251,235", main: "252,211,77", deep: "217,119,6", spark: "254,243,199", particle: "spark" },
  malus: { core: "253,244,255", main: "232,121,249", deep: "112,26,117", spark: "245,208,254", particle: "wisp" },
};

// ── Géométrie ───────────────────────────────────────────────────────────

/**
 * Point de contrôle de l'arc (Bézier quadratique) de `from` à `to`, bombé
 * perpendiculairement au trajet, toujours du côté du haut de l'écran.
 */
export function arcControl(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  let nx = -dy / distance;
  let ny = dx / distance;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = Math.min(140, distance * 0.28);
  return { x: (from.x + to.x) / 2 + nx * bulge, y: (from.y + to.y) / 2 + ny * bulge };
}

/** Point de l'arc à la fraction `t` (0 → départ, 1 → arrivée). */
export function arcPoint(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * control.x + t * t * to.x, y: u * u * from.y + 2 * u * t * control.y + t * t * to.y };
}

/** Tangente de l'arc à `t`, en radians. */
export function arcHeading(from: Point, control: Point, to: Point, t: number): number {
  const dx = 2 * (1 - t) * (control.x - from.x) + 2 * t * (to.x - control.x);
  const dy = 2 * (1 - t) * (control.y - from.y) + 2 * t * (to.y - control.y);
  return Math.atan2(dy, dx);
}

/**
 * TRAJECTOIRE d'une comète : un point et une direction pour chaque fraction
 * du vol.
 *
 *   - Vers une cible DEVANT le lanceur (en face, de l'autre côté de la
 *     table) : l'arc simple, bombé vers le haut (`arcControl`).
 *   - Vers une cible qui n'est PAS devant lui — un allié de la même rangée,
 *     ou lui-même : le tir part VERS L'AVANT, s'incurve et revient se poser
 *     sur l'allié, derrière (demande du 12/10/2026). Une courbe de Bézier
 *     cubique dont les deux points de contrôle sont portés en avant du
 *     lanceur et de la cible.
 */
export interface Trajectory {
  at(t: number): Point;
  heading(t: number): number;
  /** Points qui enveloppent la courbe (extrémités et contrôles) — pour dimensionner le canvas. */
  hull: Point[];
}

/** Une cible plus loin que ça dans le sens du tir est « devant » : l'arc simple suffit. */
const AHEAD_THRESHOLD_PX = 60;

/**
 * `forward` : sens « devant » du lanceur, à la verticale (+1 vers le bas de
 * l'écran, −1 vers le haut) — vers l'autre camp.
 */
export function trajectoryFor(from: Point, to: Point, forward: number): Trajectory {
  const ahead = (to.y - from.y) * forward > AHEAD_THRESHOLD_PX;
  if (ahead || forward === 0) {
    const control = arcControl(from, to);
    return { at: (t) => arcPoint(from, control, to, t), heading: (t) => arcHeading(from, control, to, t), hull: [from, to, control] };
  }
  // Boomerang : loin devant au départ, puis retombée sur la cible depuis l'avant.
  const dx = to.x - from.x;
  const reach = Math.max(150, Math.min(260, Math.abs(dx) * 0.55 + 130));
  // Sur soi-même, ou presque : la boucle s'ouvre sur le côté pour rester lisible.
  const side = Math.abs(dx) < 40 ? reach : 0;
  const c1 = { x: from.x + dx * 0.1 - side, y: from.y + forward * reach };
  const c2 = { x: to.x - dx * 0.1 + side, y: to.y + forward * reach };
  const at = (t: number): Point => {
    const u = 1 - t;
    return {
      x: u ** 3 * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * to.x,
      y: u ** 3 * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * to.y,
    };
  };
  const heading = (t: number) => {
    const u = 1 - t;
    const x = 3 * u * u * (c1.x - from.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (to.x - c2.x);
    const y = 3 * u * u * (c1.y - from.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (to.y - c2.y);
    return Math.atan2(y, x);
  };
  return { at, heading, hull: [from, to, c1, c2] };
}

/**
 * Courbe d'accélération CSS `cubic-bezier(x1, y1, x2, y2)` en fonction —
 * pour que la comète dessinée garde exactement le rythme de vol des autres
 * projectiles (boulet de canon : `cubic-bezier(.45,.05,.75,.95)`).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Dichotomie sur x : monotone pour 0 ≤ x1, x2 ≤ 1.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (bez(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return bez(y1, y2, (lo + hi) / 2);
  };
}

export const FLIGHT_EASING = cubicBezier(0.45, 0.05, 0.75, 0.95);

/** Aléa déterministe (mulberry32) : un effet donné se dessine de façon stable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine tirée d'une géométrie : deux comètes vers deux cibles ne se ressemblent pas. */
export function seedFrom(...values: number[]): number {
  return values.reduce((hash, value) => Math.imul(hash ^ Math.round(value * 10), 2654435761) >>> 0, 2166136261);
}

// ── Pinceaux ────────────────────────────────────────────────────────────

function glow(ctx: CanvasRenderingContext2D, at: Point, radius: number, rgb: string, alpha: number, coreRgb?: string) {
  if (radius <= 0 || alpha <= 0) return;
  const gradient = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
  gradient.addColorStop(0, `rgba(${coreRgb ?? rgb},${alpha})`);
  gradient.addColorStop(coreRgb ? 0.18 : 0.35, `rgba(${rgb},${alpha * 0.75})`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Étoile d'éclat : deux traits lumineux croisés, effilés aux pointes. */
function flare(ctx: CanvasRenderingContext2D, at: Point, length: number, angle: number, rgb: string, alpha: number) {
  if (alpha <= 0) return;
  for (const [offset, scale] of [
    [0, 1],
    [Math.PI / 2, 0.6],
  ] as const) {
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(angle + offset);
    const gradient = ctx.createLinearGradient(-length * scale, 0, length * scale, 0);
    gradient.addColorStop(0, `rgba(${rgb},0)`);
    gradient.addColorStop(0.5, `rgba(${rgb},${alpha})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-length * scale, 0);
    ctx.quadraticCurveTo(0, -length * 0.07, length * scale, 0);
    ctx.quadraticCurveTo(0, length * 0.07, -length * scale, 0);
    ctx.fill();
    ctx.restore();
  }
}

/** Éclat de glace : un losange étiré, liseré clair. */
function shard(ctx: CanvasRenderingContext2D, at: Point, size: number, angle: number, palette: Palette, alpha: number) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(0, size * 0.32);
  ctx.lineTo(-size * 0.7, 0);
  ctx.lineTo(0, -size * 0.32);
  ctx.closePath();
  ctx.fillStyle = `rgba(${palette.main},${alpha * 0.55})`;
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, size * 0.08);
  ctx.strokeStyle = `rgba(${palette.spark},${alpha})`;
  ctx.stroke();
  ctx.restore();
}

// ── Particules ──────────────────────────────────────────────────────────

interface Particle {
  born: number;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle, now: number, palette: Palette) {
  const age = (now - particle.born) / particle.life;
  if (age < 0 || age >= 1) return;
  const seconds = (now - particle.born) / 1000;
  // Freinées par l'air : elles ralentissent en s'éloignant.
  const drag = (1 - Math.exp(-3 * seconds)) / 3;
  const at = { x: particle.x + particle.vx * drag, y: particle.y + particle.vy * drag + (palette.particle === "spark" ? 30 * seconds * seconds : 0) };
  const fade = (1 - age) ** 1.4;
  const angle = particle.angle + particle.spin * seconds;
  if (palette.particle === "shard") {
    shard(ctx, at, particle.size * (1 - age * 0.4), angle, palette, fade);
    glow(ctx, at, particle.size * 1.4, palette.main, fade * 0.25);
  } else if (palette.particle === "spark") {
    glow(ctx, at, particle.size * 1.6, palette.main, fade * 0.55, palette.core);
    if (particle.size > 3.2) flare(ctx, at, particle.size * 2.4, angle, palette.spark, fade * 0.8);
  } else {
    // Volute : une fumée lumineuse qui enfle en se dissipant.
    glow(ctx, at, particle.size * (1 + age * 1.6), palette.deep, fade * 0.35);
    glow(ctx, at, particle.size * 0.5, palette.main, fade * 0.45);
  }
}

// ── L'orbe ──────────────────────────────────────────────────────────────

/**
 * L'orbe en charge, à la fraction `t` de sa charge (0 → 1). `diameter` : sa
 * taille à pleine charge. Dessinée centrée sur `at`.
 */
export function drawOrb(ctx: CanvasRenderingContext2D, at: Point, diameter: number, t: number, kind: SpellKind, seed: number) {
  const palette = SPELL_PALETTES[kind];
  const random = seededRandom(seed);
  const radius = diameter / 2;
  const charge = 1 - (1 - Math.min(1, t)) ** 2;
  const surge = t > 0.8 ? (t - 0.8) / 0.2 : 0;
  ctx.globalCompositeOperation = "lighter";

  // Les étincelles aspirées : chacune part de loin, tourne en spirale, et se fond dans le cœur.
  const STREAKS = 26;
  for (let i = 0; i < STREAKS; i += 1) {
    const start = random() * 0.62;
    const travel = 0.26 + random() * 0.14;
    const angle = random() * Math.PI * 2;
    const reach = radius * (1.7 + random() * 1.1);
    const local = (t - start) / travel;
    if (local <= 0 || local >= 1) continue;
    const position = (e: number) => {
      const r = reach * (1 - e) ** 1.6;
      const a = angle + e * 1.9;
      return { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
    };
    const head = position(local);
    const tail = position(Math.max(0, local - 0.18));
    const alpha = Math.sin(local * Math.PI) * 0.95;
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gradient.addColorStop(0, `rgba(${palette.main},0)`);
    gradient.addColorStop(1, `rgba(${palette.spark},${alpha})`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(1, radius * 0.05);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    glow(ctx, head, radius * 0.09, palette.spark, alpha);
  }

  // L'anneau qui se resserre en tournant : trois arcs, comme un sceau.
  const ringRadius = radius * (1.15 - 0.3 * charge);
  ctx.lineWidth = Math.max(1, radius * 0.045);
  for (let i = 0; i < 3; i += 1) {
    const from = t * 5.5 + (i * Math.PI * 2) / 3;
    ctx.strokeStyle = `rgba(${palette.main},${0.55 * charge * (1 - surge * 0.6)})`;
    ctx.beginPath();
    ctx.arc(at.x, at.y, ringRadius, from, from + 1.15);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${palette.deep},${0.35 * charge})`;
  ctx.lineWidth = Math.max(1, radius * 0.02);
  ctx.beginPath();
  ctx.arc(at.x, at.y, ringRadius * 1.12, -t * 3, -t * 3 + Math.PI * 1.4);
  ctx.stroke();

  // Éclats en orbite (attaque) : la glace se rassemble autour du cœur.
  if (palette.particle === "shard") {
    for (let i = 0; i < 4; i += 1) {
      const a = t * 7 + (i * Math.PI) / 2;
      const r = radius * (0.75 - 0.25 * charge);
      shard(ctx, { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, radius * 0.2, a + Math.PI / 2, palette, 0.8 * charge);
    }
  }

  // Le cœur : il grossit, scintille, et s'embrase avant de partir.
  const flicker = 1 + Math.sin(t * 47) * 0.06 + Math.sin(t * 83 + 1.3) * 0.04;
  const core = radius * (0.16 + 0.26 * charge + 0.18 * surge) * flicker;
  glow(ctx, at, core * 3.4, palette.deep, 0.5 * charge + 0.3 * surge);
  glow(ctx, at, core * 1.8, palette.main, 0.85, palette.core);
  glow(ctx, at, core * 0.7, palette.core, 1);
  flare(ctx, at, core * (2.2 + 2.5 * surge), t * 2, palette.spark, 0.5 * charge + 0.5 * surge);
  ctx.globalCompositeOperation = "source-over";
}

// ── Le halo d'une carte ─────────────────────────────────────────────────

/**
 * Les étincelles du HALO D'ORBE d'une carte (`orbAura`, `cardFx.ts`), à la
 * fraction `t` de sa durée : comme celles qu'aspire l'orbe en charge, elles
 * partent d'un peu plus loin et filent se fondre dans le BORD de la carte ;
 * aux coins, un éclat d'étoile scintille. Rien ne se dessine sur la carte ni
 * sur ses voisines (`avoid`).
 */
export function drawAuraSparks(
  ctx: CanvasRenderingContext2D,
  rect: { left: number; top: number; width: number; height: number },
  t: number,
  palette: { core: string; main: string; deep: string; spark: string },
  seed: number,
  /** Les cartes voisines : les étincelles ne se dessinent pas dessus. */
  avoid: ReadonlyArray<{ left: number; top: number; width: number; height: number }> = []
) {
  const random = seededRandom(seed);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const scale = rect.height / 100;
  const life = Math.sin(Math.min(1, t) * Math.PI);
  const margin = 40 * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.left - margin, rect.top - margin, rect.width + margin * 2, rect.height + margin * 2);
  ctx.rect(rect.left, rect.top, rect.width, rect.height);
  for (const other of avoid) ctx.rect(other.left, other.top, other.width, other.height);
  ctx.clip("evenodd");
  ctx.globalCompositeOperation = "lighter";

  const STREAKS = 22;
  for (let i = 0; i < STREAKS; i += 1) {
    const start = random() * 0.7;
    const travel = 0.22 + random() * 0.12;
    const angle = random() * Math.PI * 2;
    const local = (t - start) / travel;
    if (local <= 0 || local >= 1) continue;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const toEdge = Math.min(rect.width / 2 / Math.max(0.001, Math.abs(dx)), rect.height / 2 / Math.max(0.001, Math.abs(dy)));
    // Elles naissent près du bord : pas sur la carte voisine.
    const reach = toEdge + rect.height * (0.08 + random() * 0.1);
    const position = (e: number) => {
      const r = reach - (reach - toEdge) * e ** 1.4;
      const a = angle + (1 - e) * 0.5;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    };
    const head = position(local);
    const tail = position(Math.max(0, local - 0.22));
    const alpha = Math.sin(local * Math.PI);
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gradient.addColorStop(0, `rgba(${palette.main},0)`);
    gradient.addColorStop(1, `rgba(${palette.spark},${alpha})`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(1, 1.6 * scale);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    glow(ctx, head, 3.2 * scale, palette.spark, alpha);
  }

  // Les quatre coins : un éclat d'étoile qui tourne et scintille.
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.left + rect.width, y: rect.top },
    { x: rect.left + rect.width, y: rect.top + rect.height },
    { x: rect.left, y: rect.top + rect.height },
  ];
  corners.forEach((corner, index) => {
    const twinkle = 0.6 + 0.4 * Math.sin(t * 14 + index * 1.7);
    glow(ctx, corner, 5 * scale, palette.main, 0.55 * life * twinkle, palette.core);
    flare(ctx, corner, 8 * scale * twinkle, t * 3 + index, palette.spark, 0.8 * life * twinkle);
  });
  ctx.restore();
}

// ── La comète ───────────────────────────────────────────────────────────

/** Le ruban se résorbe dans la cible pendant ce temps après l'arrivée, et les particules finissent leur vie. */
export const COMET_LINGER_MS = 420;

export interface CometPlan {
  from: Point;
  to: Point;
  /** Sens « devant » du lanceur (+1 vers le bas de l'écran, −1 vers le haut, 0 : inconnu → arc simple). */
  forward: number;
  /** Hauteur de la cible à l'écran : la comète suit la taille du plateau. */
  size: number;
  kind: SpellKind;
  flightMs: number;
}

/**
 * Un dessinateur de comète : à appeler à chaque image avec le temps écoulé
 * depuis le départ. Garde ses particules entre deux appels.
 */
export function createCometPainter(plan: CometPlan): (ctx: CanvasRenderingContext2D, elapsed: number) => void {
  const { from, to, size, kind, flightMs } = plan;
  const palette = SPELL_PALETTES[kind];
  const path = trajectoryFor(from, to, plan.forward);
  const random = seededRandom(seedFrom(from.x, from.y, to.x, to.y));
  const scale = Math.max(0.7, Math.min(1.6, size / 140));
  const particles: Particle[] = [];
  /** Instant (en temps de vol) jusqu'où les particules ont été émises. */
  let emittedUntil = 0;
  const EMIT_EVERY_MS = kind === "malus" ? 14 : 9;
  const TAIL_MS = 150;

  const progressAt = (ms: number) => FLIGHT_EASING(Math.max(0, Math.min(1, ms / flightMs)));
  const pointAt = (ms: number) => path.at(progressAt(ms));

  function emit(until: number) {
    for (let at = emittedUntil + EMIT_EVERY_MS; at <= until; at += EMIT_EVERY_MS) {
      const p = progressAt(at);
      const origin = path.at(p);
      const heading = path.heading(p);
      // Elles se détachent vers l'arrière, en éventail.
      const spread = (random() - 0.5) * (kind === "malus" ? 1.6 : 1.1);
      const speed = (kind === "malus" ? 40 : 90 + random() * 120) * scale;
      const backward = heading + Math.PI + spread;
      particles.push({
        born: at,
        life: (kind === "malus" ? 420 : 260) + random() * 260,
        x: origin.x + (random() - 0.5) * 8 * scale,
        y: origin.y + (random() - 0.5) * 8 * scale,
        vx: Math.cos(backward) * speed,
        vy: Math.sin(backward) * speed,
        size: (kind === "malus" ? 7 + random() * 7 : kind === "attack" ? 3.5 + random() * 5.5 : 1.8 + random() * 3.2) * scale,
        spin: (random() - 0.5) * 9,
        angle: heading + (random() - 0.5) * 0.8,
      });
    }
    emittedUntil = Math.max(emittedUntil, Math.floor(until / EMIT_EVERY_MS) * EMIT_EVERY_MS);
  }

  return (ctx, elapsed) => {
    ctx.globalCompositeOperation = "lighter";
    const flight = Math.min(elapsed, flightMs);
    if (elapsed <= flightMs) emit(flight);

    // L'éclat du départ : un anneau qui s'ouvre là où l'orbe a éclaté.
    if (elapsed < 200) {
      const k = elapsed / 200;
      glow(ctx, from, 46 * scale * (0.6 + k), palette.main, (1 - k) * 0.8, palette.core);
      ctx.strokeStyle = `rgba(${palette.spark},${(1 - k) * 0.7})`;
      ctx.lineWidth = 2.5 * scale * (1 - k);
      ctx.beginPath();
      ctx.arc(from.x, from.y, 18 * scale + 60 * scale * k, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const particle of particles) drawParticle(ctx, particle, elapsed, palette);

    // Le ruban : la trajectoire des `TAIL_MS` dernières millisecondes, trois passes de lumière.
    // Après l'arrivée, sa queue continue d'avancer : il se résorbe dans la cible.
    const SAMPLES = 18;
    const tail: Point[] = [];
    for (let i = 0; i <= SAMPLES; i += 1) tail.push(pointAt(Math.max(0, elapsed - (TAIL_MS * i) / SAMPLES)));
    const landedFor = Math.max(0, elapsed - flightMs);
    const fade = 1 - Math.min(1, landedFor / (COMET_LINGER_MS * 0.5));
    if (fade > 0) {
      for (const [width, rgb, alpha] of [
        [26, palette.deep, 0.22],
        [13, palette.main, 0.5],
        [4.5, palette.core, 0.9],
      ] as const) {
        for (let i = 0; i < SAMPLES; i += 1) {
          const a = tail[i]!;
          const b = tail[i + 1]!;
          if (a.x === b.x && a.y === b.y) continue;
          const taper = (1 - i / SAMPLES) ** 1.3;
          ctx.strokeStyle = `rgba(${rgb},${alpha * taper * fade})`;
          ctx.lineWidth = Math.max(0.5, width * scale * taper);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // La tête : cœur, lueur, et son étoile d'éclat qui tourne.
    if (elapsed <= flightMs) {
      const head = tail[0]!;
      const heading = path.heading(progressAt(flight));
      const pulse = 1 + Math.sin(elapsed / 28) * 0.08;
      glow(ctx, head, 34 * scale * pulse, palette.deep, 0.55);
      glow(ctx, head, 17 * scale * pulse, palette.main, 0.9, palette.core);
      glow(ctx, head, 6 * scale, palette.core, 1);
      flare(ctx, head, 30 * scale, heading + elapsed / 90, palette.spark, 0.85);
      if (kind === "attack") {
        // Les pointes de glace de la tête, tournées vers l'avant.
        for (let i = -1; i <= 1; i += 1) shard(ctx, head, 15 * scale, heading + i * 0.55, palette, 0.75);
      }
    }

    // L'arrivée : une gerbe qui s'ouvre sur la cible.
    if (landedFor > 0 && landedFor < 260) {
      const k = landedFor / 260;
      glow(ctx, to, 52 * scale * (0.5 + k), palette.main, (1 - k) * 0.75, palette.core);
      ctx.strokeStyle = `rgba(${palette.spark},${(1 - k) * 0.6})`;
      ctx.lineWidth = 2 * scale * (1 - k);
      ctx.beginPath();
      ctx.arc(to.x, to.y, 12 * scale + 50 * scale * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  };
}

/** Rectangle à couvrir pour une comète : l'arc entier, plus de quoi laisser vivre lueurs et particules. */
export function cometBounds(plan: CometPlan): { left: number; top: number; width: number; height: number } {
  const hull = trajectoryFor(plan.from, plan.to, plan.forward).hull;
  const margin = 110 * Math.max(0.7, Math.min(1.6, plan.size / 140));
  const xs = hull.map((point) => point.x);
  const ys = hull.map((point) => point.y);
  const left = Math.min(...xs) - margin;
  const top = Math.min(...ys) - margin;
  return { left, top, width: Math.max(...xs) + margin - left, height: Math.max(...ys) + margin - top };
}
