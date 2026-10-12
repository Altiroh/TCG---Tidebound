import { seededRandom, seedFrom, type Point } from "@/features/match/spellFx";
import type { Silhouette } from "@/features/match/silhouette";

/**
 * CHOC PHYSIQUE — la poussière qui jaillit quand un coup porte (attaque de
 * combat, boulet de canon), dessinée image par image.
 *
 * Remplace (12/10/2026) des volutes gris clair en éventail depuis le centre
 * de la cible, presque invisibles sur une carte sombre et cachées sous la
 * plaque de dégâts. Ici la poussière s'échappe TOUT AUTOUR DE LA CARTE, le
 * long de ses bords — comme une carte qu'on plaque sur la table chasse la
 * poussière dessous : des volutes naissent sur le pourtour, filent vers
 * l'extérieur en ralentissant, enflent, s'élèvent un peu et se dissipent.
 * Quelques éclats sombres sont projetés depuis les bords et retombent.
 * Le dessin est DÉCOUPÉ hors de la carte : la poussière l'entoure, elle ne
 * voile jamais son illustration ni ses chiffres.
 *
 * Mélange NORMAL, pas additif : la poussière voile, elle n'éclaire pas.
 */

/** Durée de vie du nuage, du choc à sa dissipation complète. */
export const IMPACT_DUST_MS = 1100;

export interface DustRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  delay: number;
  life: number;
  tone: string;
  peak: number;
}

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  life: number;
}

export interface DustPlan {
  /** La carte (ou le Navire) touchée, en coordonnées viewport. */
  rect: DustRect;
  /** D'où vient le coup (centre de l'attaquant) — le bord frappé chasse un peu plus de poussière. */
  from?: Point;
  /** Un jeton est ovale : la poussière s'échappe de son ovale, pas d'un rectangle (`silhouette.ts`). */
  shape?: Silhouette;
}

/** Un point du pourtour de l'OVALE inscrit dans le rectangle, et sa normale sortante. */
export function ovalPoint(rect: DustRect, u: number): { point: Point; normal: Point } {
  const a = u * Math.PI * 2;
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  const point = { x: rect.left + rx + Math.cos(a) * rx, y: rect.top + ry + Math.sin(a) * ry };
  // Normale d'une ellipse : (cos/rx, sin/ry), normalisée.
  const nx = Math.cos(a) / rx;
  const ny = Math.sin(a) / ry;
  const length = Math.hypot(nx, ny) || 1;
  return { point, normal: { x: nx / length, y: ny / length } };
}

/**
 * Un point du POURTOUR du rectangle, à la fraction `u` (0 → 1) du périmètre,
 * avec la normale sortante de son bord.
 */
export function perimeterPoint(rect: DustRect, u: number): { point: Point; normal: Point } {
  const { left, top, width, height } = rect;
  const perimeter = 2 * (width + height);
  let d = (((u % 1) + 1) % 1) * perimeter;
  if (d < width) return { point: { x: left + d, y: top }, normal: { x: 0, y: -1 } };
  d -= width;
  if (d < height) return { point: { x: left + width, y: top + d }, normal: { x: 1, y: 0 } };
  d -= height;
  if (d < width) return { point: { x: left + width - d, y: top + height }, normal: { x: 0, y: 1 } };
  d -= width;
  return { point: { x: left, y: top + height - d }, normal: { x: -1, y: 0 } };
}

export function createDustPainter(plan: DustPlan): (ctx: CanvasRenderingContext2D, elapsed: number) => void {
  const { rect } = plan;
  const oval = plan.shape === "oval";
  const edge = (u: number) => (oval ? ovalPoint(rect, u) : perimeterPoint(rect, u));
  const random = seededRandom(seedFrom(rect.left, rect.top, rect.width, rect.height));
  const scale = Math.max(0.6, Math.min(1.6, Math.min(rect.height, 220) / 140));
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const hit = plan.from ? { x: plan.from.x - center.x, y: plan.from.y - center.y } : null;
  const hitLength = hit ? Math.hypot(hit.x, hit.y) || 1 : 1;

  /** Le bord frappé souffle plus fort ; l'autre côté, moins. */
  const push = (normal: Point) => (hit ? 1 + 0.45 * ((normal.x * hit.x + normal.y * hit.y) / hitLength) : 1);

  const PUFFS = 34;
  const puffs: Puff[] = Array.from({ length: PUFFS }, (_, index) => {
    // Répartis régulièrement sur le pourtour, avec un peu de jeu : pas de trou, pas de motif.
    const { point, normal } = edge((index + random() * 0.8) / PUFFS);
    const strength = push(normal);
    const speed = (38 + random() * 46) * scale * strength;
    // Légèrement en biais le long du bord, pour que les volutes ne partent pas en rayons.
    const slide = (random() - 0.5) * 0.9;
    const warm = random() < 0.7;
    return {
      x: point.x + normal.x * 3 * scale,
      y: point.y + normal.y * 3 * scale,
      vx: (normal.x + -normal.y * slide) * speed,
      vy: (normal.y + normal.x * slide) * speed,
      radius: (11 + random() * 12) * scale,
      delay: random() * 60,
      life: 640 + random() * 380,
      // Poussière de bois et de sel : gris chaud, quelques volutes plus sombres pour qu'elle se lise sur la table.
      tone: warm ? "218,208,192" : "128,118,108",
      peak: (warm ? 0.6 + random() * 0.2 : 0.34 + random() * 0.14) * Math.min(1.25, strength),
    };
  });

  const debris: Debris[] = Array.from({ length: 12 }, () => {
    const { point, normal } = edge(random());
    const speed = (120 + random() * 150) * scale * push(normal);
    return {
      x: point.x,
      y: point.y,
      vx: normal.x * speed + (random() - 0.5) * 60 * scale,
      vy: normal.y * speed - (50 + random() * 60) * scale,
      size: (1.4 + random() * 2.2) * scale,
      spin: (random() - 0.5) * 20,
      life: 360 + random() * 220,
    };
  });

  /** Tout, sauf la carte (un peu rentrée, pour que la poussière lèche son bord). */
  const inset = 4 * scale;
  const outside = new Path2D();
  outside.rect(rect.left - 400, rect.top - 400, rect.width + 800, rect.height + 800);
  if (oval) outside.ellipse(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width / 2 - inset, rect.height / 2 - inset, 0, 0, Math.PI * 2);
  else outside.rect(rect.left + inset, rect.top + inset, rect.width - inset * 2, rect.height - inset * 2);

  return (ctx, elapsed) => {
    ctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.clip(outside, "evenodd");

    // Les volutes : elles s'échappent des bords, ralentissent, enflent, s'élèvent un peu, puis se dissipent.
    for (const puff of puffs) {
      const local = elapsed - puff.delay;
      if (local <= 0 || local >= puff.life) continue;
      const k = local / puff.life;
      const seconds = local / 1000;
      const drag = (1 - Math.exp(-4.5 * seconds)) / 4.5;
      const x = puff.x + puff.vx * drag;
      const y = puff.y + puff.vy * drag - 22 * scale * seconds;
      const radius = puff.radius * (0.4 + 1.3 * Math.sqrt(k));
      const alpha = puff.peak * (k < 0.12 ? k / 0.12 : (1 - (k - 0.12) / 0.88) ** 1.6);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${puff.tone},${alpha})`);
      gradient.addColorStop(0.55, `rgba(${puff.tone},${alpha * 0.55})`);
      gradient.addColorStop(1, `rgba(${puff.tone},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Les éclats : chassés des bords, ils retombent et s'éteignent.
    for (const piece of debris) {
      if (elapsed >= piece.life) continue;
      const seconds = elapsed / 1000;
      const k = elapsed / piece.life;
      const x = piece.x + piece.vx * seconds * (1 - k * 0.35);
      const y = piece.y + piece.vy * seconds + 480 * scale * seconds * seconds;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(piece.spin * seconds);
      ctx.fillStyle = `rgba(58,44,34,${0.85 * (1 - k)})`;
      ctx.fillRect(-piece.size, -piece.size * 0.45, piece.size * 2, piece.size * 0.9);
      ctx.restore();
    }
    ctx.restore();
  };
}

/** Rectangle à couvrir pour un nuage : la carte, plus de quoi laisser la poussière s'étaler. */
export function dustBounds(plan: DustPlan): DustRect {
  const margin = 110 * Math.max(0.6, Math.min(1.6, Math.min(plan.rect.height, 220) / 140));
  return { left: plan.rect.left - margin, top: plan.rect.top - margin, width: plan.rect.width + margin * 2, height: plan.rect.height + margin * 2 };
}

// ── Maladie : les bulles vertes ─────────────────────────────────────────

/**
 * MALADE (Houle) : en début de tour, la maladie ronge l'unité — des bulles
 * vertes montent de la carte, enflent en tremblotant et ÉCLATENT (anneau
 * qui s'ouvre, gouttelettes), et c'est sur ces éclats que l'unité encaisse
 * son dégât (demande du 12/10/2026). Dessinées SUR la carte et juste
 * au-dessus : c'est elle qui est malade.
 */
export const SICKNESS_BUBBLES_MS = 950;

interface Bubble {
  x: number;
  y: number;
  rise: number;
  wobble: number;
  phase: number;
  radius: number;
  delay: number;
  life: number;
}

export function createSicknessPainter(rect: DustRect, shape: Silhouette = "card"): (ctx: CanvasRenderingContext2D, elapsed: number) => void {
  const random = seededRandom(seedFrom(rect.left, rect.top, rect.width, 7));
  const scale = Math.max(0.6, Math.min(1.6, Math.min(rect.height, 220) / 140));
  const bubbles: Bubble[] = Array.from({ length: 16 }, () => ({
    x: rect.left + rect.width * (0.12 + random() * 0.76),
    y: rect.top + rect.height * (0.35 + random() * 0.55),
    rise: (40 + random() * 70) * scale,
    wobble: (3 + random() * 5) * scale,
    phase: random() * Math.PI * 2,
    radius: (5 + random() * 9) * scale,
    // Les dernières éclatent autour de l'impact (≈ 400 ms) : le dégât tombe avec elles.
    delay: random() * 380,
    life: 300 + random() * 280,
  }));

  return (ctx, elapsed) => {
    // Une lueur maladive voile la carte, le temps des bulles.
    const veil = Math.sin(Math.min(1, elapsed / SICKNESS_BUBBLES_MS) * Math.PI) * 0.28;
    if (veil > 0) {
      ctx.fillStyle = `rgba(74,222,128,${veil})`;
      ctx.globalCompositeOperation = "soft-light";
      // La forme de l'unité : un jeton ovale n'a pas de coins à teinter.
      if (shape === "oval") {
        ctx.beginPath();
        ctx.ellipse(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    for (const bubble of bubbles) {
      const local = elapsed - bubble.delay;
      if (local <= 0) continue;
      const k = local / bubble.life;
      const seconds = local / 1000;
      const x = bubble.x + Math.sin(bubble.phase + seconds * 14) * bubble.wobble;
      const y = bubble.y - bubble.rise * seconds;
      if (k < 1) {
        // La bulle : verte, translucide, un reflet clair ; elle enfle avant d'éclater.
        const r = bubble.radius * (0.35 + 0.75 * k);
        const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
        body.addColorStop(0, "rgba(220,252,231,0.85)");
        body.addColorStop(0.35, "rgba(134,239,172,0.45)");
        body.addColorStop(0.85, "rgba(22,163,74,0.35)");
        body.addColorStop(1, "rgba(22,163,74,0.05)");
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(187,247,208,0.9)";
        ctx.lineWidth = Math.max(0.8, r * 0.12);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(x - r * 0.38, y - r * 0.38, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // L'éclat : un anneau qui s'ouvre et quelques gouttelettes.
      const popK = (local - bubble.life) / 260;
      if (popK >= 1) continue;
      const r = bubble.radius * (1.1 + popK * 1.2);
      ctx.strokeStyle = `rgba(187,247,208,${0.9 * (1 - popK)})`;
      ctx.lineWidth = Math.max(0.6, bubble.radius * 0.16 * (1 - popK));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 5; i += 1) {
        const a = bubble.phase + (i / 5) * Math.PI * 2;
        const d = r * (1 + popK * 0.8);
        ctx.fillStyle = `rgba(74,222,128,${0.85 * (1 - popK)})`;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d + popK * 6 * scale, Math.max(0.8, bubble.radius * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
}

/** Rectangle à couvrir pour les bulles : la carte, et de quoi les laisser monter. */
export function sicknessBounds(rect: DustRect): DustRect {
  const margin = 50 * Math.max(0.6, Math.min(1.6, Math.min(rect.height, 220) / 140));
  return { left: rect.left - margin, top: rect.top - margin * 2, width: rect.width + margin * 2, height: rect.height + margin * 3 };
}
