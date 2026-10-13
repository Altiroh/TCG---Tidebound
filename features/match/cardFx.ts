"use client";

import { playCardAwake, playCardFlip, playCardShattered, playGuardIntercept, playTokenDrop } from "@/lib/sound";
import { AWAKE_LIFT_MS, AWAKE_MS, BREAK_LEAD_MS, GUARD_SHOW_MS, ORB_CHARGE_MS } from "@/features/match/effectPresentation";
import { faceOf, silhouetteOf } from "@/features/match/silhouette";
import { drawAuraSparks, seedFrom, SPELL_PALETTES, type SpellKind } from "@/features/match/spellFx";

/**
 * Animations ponctuelles d'UNE carte du plateau (demande du 10/10/2026),
 * jouées sur l'élément réel de la carte — pas sur une copie — et
 * accompagnées de leur son :
 *
 *   - réveil : la carte qui déclenche sa capacité se soulève, pulse d'une
 *     lueur dorée, puis retombe (\`awakenCard\`) ;
 *   - jeton : il tombe d'au-dessus du plateau et provoque une onde
 *     (\`dropToken\`) ;
 *   - Structure révélée : elle se retourne face visible (\`flipCard\`) ;
 *   - Garde : quand une attaque vise à côté d'elle, la carte qui la porte
 *     se lève, son badge scintille, puis elle se repose (\`showGuard\`).
 *
 * Fonctions impératives, sans état React : le vrai plateau les appelle au
 * bon moment (\`useTableMotion\`, \`EffectFxLayer\`, \`AttackImpactLayer\`), le
 * labo de partie (\`FxLabPanel\`) les lance à la demande sur les cartes à
 * l'écran. Les éléments éphémères (onde, bouclier volant) vivent dans un
 * calque plein écran posé sur \`document.body\`, retirés à la fin de leur
 * animation.
 *
 * Mouvement réduit (\`prefers-reduced-motion\`) : rien ne bouge, le son reste
 * — réduire les animations n'est pas couper le son.
 */

function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Calque plein écran des éléments éphémères, créé au premier besoin. Jamais cliquable. */
export function fxLayer(): HTMLElement {
  let layer = document.querySelector<HTMLElement>("[data-card-fx-layer]");
  if (!layer) {
    layer = document.createElement("div");
    layer.dataset.cardFxLayer = "";
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "45", overflow: "hidden" });
    document.body.appendChild(layer);
  }
  return layer;
}

/** Un son qui part avec un geste DIFFÉRÉ : le minuteur, ou tout de suite s'il n'y a rien à attendre. */
function soundAt(delayMs: number, play: () => void) {
  if (delayMs > 0) window.setTimeout(play, delayMs);
  else play();
}

// ── Halo d'orbe ─────────────────────────────────────────────────────────

/**
 * HALO D'ORBE (13/10/2026) — « la même lueur qu'autour des orbes de sort, et
 * que ce soit voyant ». Une carte qui active son effet, qui attaque, ou que
 * l'effet touche, s'entoure de la lueur de l'orbe (`drawOrb`) : liseré presque
 * blanc, teinte principale, teinte profonde large — en ombres portées HORS du
 * cadre, sur un élément posé DANS la carte (il la suit quand elle bouge).
 * Seules son opacité et son échelle s'animent : le GPU les compose.
 *
 * `strike` : le feu de l'attaque (le même que le halo « peut attaquer »).
 */
export type AuraTone = SpellKind | "strike";

const STRIKE_PALETTE = { core: "255,247,237", main: "255,128,64", deep: "220,38,38", spark: "255,237,213" } as const;

function auraPalette(tone: AuraTone) {
  return tone === "strike" ? STRIKE_PALETTE : SPELL_PALETTES[tone];
}

/**
 * Échelle du halo : la hauteur de la carte dans SON repère (la scène est mise
 * à l'échelle avec elle), ramenée à une carte de plateau (~190 px).
 */
function auraUnit(h: number): number {
  return Math.max(0.6, Math.min(1.3, h / 190));
}

/**
 * Les ombres du halo. SERRÉ contre la carte (retour du 13/10/2026) : toute la
 * lumière tient dans l'espace entre deux cartes du plateau (~12 px), sans
 * empiéter sur la voisine — intense au bord, comme le cœur d'une orbe, puis
 * vite éteint.
 */
export function auraShadow(tone: AuraTone, h: number): string {
  const p = auraPalette(tone);
  const u = auraUnit(h);
  const px = (value: number) => `${(value * u).toFixed(1)}px`;
  return [
    `0 0 0 ${px(2)} rgba(${p.core},1)`,
    `0 0 ${px(3)} ${px(2.5)} rgba(${p.core},0.85)`,
    `0 0 ${px(6)} ${px(4)} rgba(${p.main},1)`,
    `0 0 ${px(12)} ${px(5)} rgba(${p.main},0.75)`,
    `0 0 ${px(16)} ${px(5)} rgba(${p.deep},0.6)`,
  ].join(", ");
}

export interface AuraOptions {
  delayMs?: number;
  durationMs: number;
  /** Étincelles aspirées vers la carte, comme vers le cœur d'une orbe (pas pour une carte qui se déplace). */
  sparks?: boolean;
  /** Éclat : le halo surgit d'un coup puis s'éteint (une cible touchée), au lieu de monter puis de pulser. */
  burst?: boolean;
  /** La carte se soulève pendant le halo (`awakenCard`) : ses flammes entourent la carte levée. */
  lifted?: boolean;
}

/** Le halo en `drop-shadow` : il suit le contour réel de l'image (jeton ovale, arche d'un Navire). */
function auraFilter(tone: AuraTone, h: number): string {
  const p = auraPalette(tone);
  const u = auraUnit(h);
  const px = (value: number) => `${(value * u).toFixed(1)}px`;
  return [
    `drop-shadow(0 0 ${px(1.5)} rgba(${p.core},1))`,
    `drop-shadow(0 0 ${px(3)} rgba(${p.core},0.9))`,
    `drop-shadow(0 0 ${px(6)} rgba(${p.main},1))`,
    `drop-shadow(0 0 ${px(10)} rgba(${p.deep},0.85))`,
  ].join(" ");
}

/**
 * Pose le halo d'orbe sur l'unité `el`, le temps de `durationMs`. Il ÉPOUSE
 * sa forme (13/10/2026, « pas de séparation vide ») :
 *   - une carte : le halo s'accroche à sa FACE (`faceOf`), coins arrondis
 *     hérités — seules son opacité et son échelle s'animent ;
 *   - un jeton (cadre ovale) et un Navire (arche) : la lueur suit le contour
 *     de leur image (`drop-shadow`), jamais le rectangle autour.
 */
export function orbAura(el: HTMLElement, tone: AuraTone, { delayMs = 0, durationMs, sparks = false, burst = false, lifted = false }: AuraOptions): void {
  if (reducedMotion()) return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0) return;
  const shape = silhouetteOf(el);
  const face = faceOf(el);
  const height = face.offsetHeight || rect.height;
  if (shape !== "card") {
    const lit = auraFilter(tone, height);
    face.animate(
      burst
        ? [{ filter: "none" }, { filter: lit, offset: 0.15 }, { filter: lit, offset: 0.45 }, { filter: "none" }]
        : [{ filter: "none" }, { filter: lit, offset: 0.25 }, { filter: lit, offset: 0.8 }, { filter: "none" }],
      { duration: durationMs, delay: delayMs, easing: "ease-out" }
    );
    if (sparks) auraSparks(face, face.getBoundingClientRect(), auraPalette(tone), delayMs, durationMs);
    return;
  }
  // Le liseré VACILLE un peu (13/10/2026) : deux couches du même halo, à peine
  // décalées, scintillent à des rythmes différents — la ligne tremble sans
  // cesser d'être une ligne. Seules opacité et position bougent : composité.
  const envelope = burst
    ? [0, 1, 0.85, 0]
    : [0, 0.9, 1, 0.8, 1, 0];
  const at = burst ? [0, 0.12, 0.4, 1] : [0, 0.2, 0.45, 0.65, 0.82, 1];
  const layers: Array<{ flicker: number[]; drift: [number, number][] }> = [
    { flicker: [1, 0.78, 1, 0.86, 0.95, 1], drift: [[0, 0], [0.6, -0.5], [-0.3, 0.4], [0.4, 0.3], [-0.5, -0.4], [0, 0]] },
    { flicker: [0.55, 0.85, 0.5, 0.8, 0.6, 0.55], drift: [[0, 0], [-0.5, 0.4], [0.5, -0.3], [-0.4, -0.4], [0.3, 0.5], [0, 0]] },
  ];
  if (getComputedStyle(face).position === "static") face.style.position = "relative";
  for (const layer of layers) {
    const halo = document.createElement("span");
    halo.setAttribute("aria-hidden", "true");
    Object.assign(halo.style, {
      position: "absolute",
      inset: "0",
      zIndex: "3",
      borderRadius: getComputedStyle(face).borderRadius || "var(--card-radius, 10px)",
      // Dans le repère de la carte : la scène est mise à l'échelle (`BoardStage`), les ombres le sont avec elle.
      boxShadow: auraShadow(tone, height),
      pointerEvents: "none",
      opacity: "0",
      willChange: "opacity, transform",
    });
    face.appendChild(halo);
    // L'enveloppe (apparition, extinction) multipliée par le scintillement propre à la couche.
    const steps = 12;
    const keyframes = Array.from({ length: steps + 1 }, (_, i) => {
      const k = i / steps;
      const level = sample(at, envelope, k) * layer.flicker[i % layer.flicker.length]!;
      const [dx, dy] = layer.drift[i % layer.drift.length]!;
      return { offset: k, opacity: level, transform: `translate(${(dx * auraUnit(height)).toFixed(2)}px, ${(dy * auraUnit(height)).toFixed(2)}px)` };
    });
    const animation = halo.animate(keyframes, { duration: durationMs, delay: delayMs, easing: "ease-in-out", fill: "both" });
    animation.onfinish = () => halo.remove();
    animation.oncancel = () => halo.remove();
  }
  if (sparks) auraSparks(face, lifted ? liftedRect(face.getBoundingClientRect()) : face.getBoundingClientRect(), auraPalette(tone), delayMs, durationMs);
}

/** Où sera la carte une fois soulevée par son réveil (`translateY(-9%) scale(1.07)` autour de son centre). */
function liftedRect(rect: DOMRect): DOMRect {
  const width = rect.width * 1.07;
  const height = rect.height * 1.07;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2 - rect.height * 0.09;
  return new DOMRect(cx - width / 2, cy - height / 2, width, height);
}

/** Valeur, à la fraction `k`, d'une courbe donnée par ses points (`at`, `values`), interpolée linéairement. */
function sample(at: readonly number[], values: readonly number[], k: number): number {
  for (let i = 1; i < at.length; i += 1) {
    if (k <= at[i]!) {
      const span = at[i]! - at[i - 1]!;
      const f = span > 0 ? (k - at[i - 1]!) / span : 1;
      return values[i - 1]! + (values[i]! - values[i - 1]!) * f;
    }
  }
  return values[values.length - 1]!;
}

/** Les étincelles aspirées par la carte : un canvas éphémère du calque d'effets, autour d'elle. */
function auraSparks(self: HTMLElement, rect: DOMRect, palette: { core: string; main: string; deep: string; spark: string }, delayMs: number, durationMs: number): void {
  const reach = rect.height * 0.25;
  const bounds = { left: rect.left - reach, top: rect.top - reach, width: rect.width + reach * 2, height: rect.height + reach * 2 };
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(bounds.width * dpr);
  canvas.height = Math.ceil(bounds.height * dpr);
  Object.assign(canvas.style, { position: "absolute", left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, pointerEvents: "none" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const seed = seedFrom(rect.left, rect.top, rect.height);
  // Les autres cartes du plateau qui touchent la zone des flammes : elles restent nettes.
  const avoid = Array.from(document.querySelectorAll<HTMLElement>("[data-board-unit] > button"))
    .filter((node) => node !== self)
    .map((node) => node.getBoundingClientRect())
    .filter(
      (other) =>
        other.right > bounds.left && other.left < bounds.left + bounds.width && other.bottom > bounds.top && other.top < bounds.top + bounds.height
    );
  window.setTimeout(() => {
    fxLayer().appendChild(canvas);
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (elapsed >= durationMs) {
        canvas.remove();
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, -bounds.left * dpr, -bounds.top * dpr);
      drawAuraSparks(ctx, rect, elapsed / durationMs, palette, seed, avoid);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delayMs);
}

// ── Réveil ──────────────────────────────────────────────────────────────

/**
 * La carte se soulève (\`AWAKE_LIFT_MS\`), le halo d'orbe de son effet
 * l'entoure et pulse, puis elle retombe à sa place — \`AWAKE_MS\` en tout.
 * C'est pendant qu'elle est soulevée que l'orbe de son sort se forme,
 * accrochée à son bord bas (\`EffectFxLayer\`) : elle reste levée jusqu'au
 * départ des comètes. Sans ton (capacité sans effet visible), l'or du réveil.
 */
export function awakenCard(el: HTMLElement, delayMs = 0, tone?: "attack" | "heal" | "malus"): void {
  soundAt(delayMs, playCardAwake);
  if (reducedMotion()) return;
  const lifted = "translateY(-9%) scale(1.07)";
  el.animate(
    [
      { transform: "none", filter: "none" },
      { offset: AWAKE_LIFT_MS / AWAKE_MS, transform: lifted, filter: "brightness(1.15)" },
      { offset: 0.42, transform: lifted, filter: "brightness(1.3)" },
      { offset: 0.58, transform: lifted, filter: "brightness(1.12)" },
      { offset: (AWAKE_LIFT_MS + ORB_CHARGE_MS) / AWAKE_MS, transform: lifted, filter: "brightness(1.25)", easing: "cubic-bezier(.5,0,.7,1)" },
      { transform: "none", filter: "none" },
    ],
    { duration: AWAKE_MS, delay: delayMs, easing: "cubic-bezier(.2,.8,.3,1)" }
  );
  orbAura(el, tone ?? "heal", { delayMs, durationMs: AWAKE_MS + 200, sparks: true, lifted: true });
}

// ── Jeton qui tombe ─────────────────────────────────────────────────────

/** Chute du jeton, de son apparition au-dessus de la case jusqu'à la fin de son tassement. */
export const TOKEN_DROP_MS = 520;
/** Instant de la chute où le jeton touche le plateau : l'onde part, le son claque. */
const TOKEN_LANDS_AT = 0.62;

/**
 * Le jeton apparaît au-dessus de sa case, plus grand et transparent, TOMBE,
 * se tasse un instant à l'impact et provoque une onde qui s'élargit sous
 * lui. Jusqu'à son départ (\`delayMs\` : la carte qui l'invoque atterrit
 * d'abord), il reste invisible (\`fill: backwards\`).
 */
export function dropToken(el: HTMLElement, delayMs = 0): void {
  const landsAt = delayMs + TOKEN_DROP_MS * TOKEN_LANDS_AT;
  soundAt(landsAt, playTokenDrop);
  if (reducedMotion()) return;
  el.animate(
    [
      { transform: "translateY(-75%) scale(1.22)", opacity: 0, easing: "cubic-bezier(.55,0,.9,.45)" },
      { offset: 0.2, opacity: 1 },
      { offset: TOKEN_LANDS_AT, transform: "translateY(0) scale(1)", opacity: 1, easing: "cubic-bezier(.3,.6,.4,1)" },
      { offset: 0.76, transform: "translateY(2%) scale(1.05, 0.93)" },
      { transform: "none", opacity: 1 },
    ],
    { duration: TOKEN_DROP_MS, delay: delayMs, fill: "backwards" }
  );
  window.setTimeout(() => ripple(el.getBoundingClientRect()), landsAt);
}

/** Onde à l'impact : deux anneaux d'eau aplatis qui s'élargissent sous la carte et s'éteignent. */
function ripple(box: DOMRect): void {
  const layer = fxLayer();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height * 0.62;
  [0, 140].forEach((lag, index) => {
    const ring = document.createElement("span");
    const w = box.width * 0.9;
    Object.assign(ring.style, {
      position: "absolute",
      left: `${cx - w / 2}px`,
      top: `${cy - (w * 0.42) / 2}px`,
      width: `${w}px`,
      height: `${w * 0.42}px`,
      borderRadius: "50%",
      border: `${index === 0 ? 3 : 2}px solid rgba(186, 230, 253, 0.85)`,
      boxShadow: "0 0 12px rgba(125, 211, 252, 0.55), inset 0 0 10px rgba(125, 211, 252, 0.35)",
      opacity: "0",
    });
    layer.appendChild(ring);
    const animation = ring.animate(
      [
        { transform: "scale(0.55)", opacity: 0.95 },
        { transform: "scale(2.3)", opacity: 0 },
      ],
      { duration: 760, delay: lag, easing: "cubic-bezier(.15,.7,.35,1)", fill: "both" }
    );
    animation.onfinish = () => ring.remove();
    animation.oncancel = () => ring.remove();
  });
}

// ── Structure révélée ───────────────────────────────────────────────────

export const FLIP_MS = 560;

/**
 * La carte se retourne face visible : elle part de la tranche (90°), se
 * soulève un peu en pivotant, dépasse à peine et se pose. Simple, comme
 * demandé — l'effet qu'elle déclenche éventuellement se joue ensuite (son
 * réveil, \`EffectFxLayer\`).
 */
export function flipCard(el: HTMLElement, delayMs = 0): void {
  soundAt(delayMs, playCardFlip);
  if (reducedMotion()) return;
  el.animate(
    [
      { transform: "perspective(900px) rotateY(90deg) scale(1.08)", filter: "brightness(0.6)" },
      { offset: 0.65, transform: "perspective(900px) rotateY(-10deg) scale(1.05)", filter: "brightness(1.15)" },
      { transform: "perspective(900px) rotateY(0deg) scale(1)", filter: "none" },
    ],
    { duration: FLIP_MS, delay: delayMs, easing: "cubic-bezier(.25,.8,.35,1)", fill: "backwards" }
  );
}

// ── Garde ───────────────────────────────────────────────────────────────

const GUARD_ICON_SRC = "/assets/status/garde.webp";

/**
 * La Garde SE MONTRE sur la carte \`guard\` : elle se lève, son badge de
 * Garde scintille (halo qui pulse deux fois, anneaux qui s'ouvrent, éclats
 * qui étincellent), puis elle se repose — \`GUARD_SHOW_MS\` en tout.
 *
 * Jouée quand une attaque vise À CÔTÉ d'elle — le Navire adverse, ou une
 * autre unité — et que la Garde la refuse (décision du 12/10/2026) : c'est
 * la réponse de la table à un geste interdit, l'attaque n'est pas envoyée et
 * l'attaquant reste prêt à viser la Garde. Attaquer la Garde elle-même ne
 * la montre pas : le coup part, simplement.
 */
export function showGuard(guard: HTMLElement): void {
  window.setTimeout(playGuardIntercept, GUARD_SHOW_MS * 0.18);
  showBadges(guard, [{ iconSrc: GUARD_ICON_SRC, badgeSelector: `img[src*="/status/garde"]`, color: "253,224,71" }]);
}

/** Un médaillon qui s'active sur sa carte : son icône, où le trouver sur la carte, et sa couleur (« r,g,b »). */
export interface BadgeActivation {
  iconSrc: string;
  /** Sélecteur du médaillon affiché sur la carte ; introuvable ou caché, l'icône apparaît le temps de se montrer. */
  badgeSelector: string;
  color: string;
}

/**
 * La carte se LÈVE, ses médaillons (`badges`) scintillent — halo, deux
 * anneaux, éclats —, puis elle se repose : `GUARD_SHOW_MS` en tout. C'est
 * la Garde qui s'interpose (`showGuard`), et une QUALIFICATION qui s'active
 * (`activateQualifications`, `qualificationFx.ts`). Un médaillon qui n'est
 * pas affiché sur la carte apparaît en haut, le temps de se montrer.
 */
export function showBadges(card: HTMLElement, badges: readonly BadgeActivation[]): void {
  if (reducedMotion() || badges.length === 0) return;

  const glowColor = `rgba(${badges[0]!.color},0.95)`;
  const lifted = "translateY(-9%) scale(1.07)";
  const glow = (px: number) => `brightness(1.18) drop-shadow(0 0 ${px}px ${glowColor})`;
  card.animate(
    [
      { transform: "none", filter: "none", easing: "cubic-bezier(.2,.8,.3,1)" },
      { offset: 0.16, transform: lifted, filter: glow(6) },
      { offset: 0.34, transform: lifted, filter: glow(18) },
      { offset: 0.48, transform: lifted, filter: glow(7) },
      { offset: 0.62, transform: lifted, filter: glow(18) },
      { offset: 0.8, transform: lifted, filter: glow(6), easing: "cubic-bezier(.5,0,.7,1)" },
      { transform: "none", filter: "none" },
    ],
    { duration: GUARD_SHOW_MS }
  );

  // Le scintillement vit dans le calque plein écran — dans la carte, son halo était rogné au RECTANGLE de la
  // tuile, ce qui dessinait un cadre de carte autour d'un jeton ovale — et suit la carte qui se lève.
  const cardBox = card.getBoundingClientRect();
  const cardCenter = { x: cardBox.left + cardBox.width / 2, y: cardBox.top + cardBox.height / 2 };
  const hidden = badges.filter((b) => {
    const box = card.querySelector<HTMLElement>(b.badgeSelector)?.getBoundingClientRect();
    return !box || box.width <= 0;
  });
  badges.forEach((activation) => {
    const badge = card.querySelector<HTMLElement>(activation.badgeSelector);
    const badgeBox = badge?.getBoundingClientRect();
    const visibleBadge = Boolean(badgeBox && badgeBox.width > 0);
    // Les icônes sans médaillon affiché se rangent côte à côte en haut de la carte.
    const slot = hidden.indexOf(activation);
    const size = visibleBadge ? badgeBox!.width : cardBox.width * (hidden.length > 1 ? 0.26 : 0.3);
    const center = visibleBadge
      ? { x: badgeBox!.left + badgeBox!.width / 2, y: badgeBox!.top + badgeBox!.height / 2 }
      : // Comme un médaillon du plateau : à cheval sur le haut de la carte, au-dessus d'elle.
        { x: cardBox.left + cardBox.width / 2 + (slot - (hidden.length - 1) / 2) * size * 1.1, y: cardBox.top - size * 0.15 };
    showBadgeShimmer({ center, size, cardCenter, cardHeight: cardBox.height, color: activation.color, icon: visibleBadge ? badge! : null, iconSrc: activation.iconSrc });
  });
}

function showBadgeShimmer(o: {
  center: { x: number; y: number };
  size: number;
  cardCenter: { x: number; y: number };
  cardHeight: number;
  color: string;
  icon: HTMLElement | null;
  iconSrc: string;
}): void {
  const { center, size, color } = o;
  const rgba = (a: number) => `rgba(${color},${a})`;
  // Où ce point se trouve une fois la carte levée (`lifted`, autour de son centre).
  const rise = {
    x: (center.x - o.cardCenter.x) * 0.07,
    y: (center.y - o.cardCenter.y) * 0.07 - o.cardHeight * 0.09,
  };

  const host = document.createElement("span");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute",
    left: `${center.x - size / 2}px`,
    top: `${center.y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    pointerEvents: "none",
  });
  const up = `translate(${rise.x}px, ${rise.y}px) scale(1.07)`;
  host.animate(
    [
      { transform: "none", easing: "cubic-bezier(.2,.8,.3,1)" },
      { offset: 0.16, transform: up },
      { offset: 0.8, transform: up, easing: "cubic-bezier(.5,0,.7,1)" },
      { transform: "none" },
    ],
    { duration: GUARD_SHOW_MS, fill: "both" }
  );

  const halo = document.createElement("span");
  Object.assign(halo.style, {
    position: "absolute",
    inset: "-90%",
    borderRadius: "50%",
    background: `radial-gradient(circle, rgba(255,251,235,0.95) 0%, ${rgba(0.6)} 22%, ${rgba(0.22)} 48%, ${rgba(0)} 70%)`,
    opacity: "0",
  });
  host.appendChild(halo);
  halo.animate(
    [
      { opacity: 0, transform: "scale(0.5)", offset: 0 },
      { opacity: 0.2, transform: "scale(0.7)", offset: 0.18 },
      { opacity: 1, transform: "scale(1.05)", offset: 0.3 },
      { opacity: 0.45, transform: "scale(0.85)", offset: 0.52 },
      { opacity: 1, transform: "scale(1.12)", offset: 0.64 },
      { opacity: 0, transform: "scale(0.9)", offset: 0.82 },
      { opacity: 0, offset: 1 },
    ],
    { duration: GUARD_SHOW_MS, fill: "both" }
  );

  // Deux anneaux qui s'ouvrent, un par pulsation.
  for (const at of [0.3, 0.64]) {
    const ring = document.createElement("span");
    Object.assign(ring.style, {
      position: "absolute",
      inset: "0",
      borderRadius: "50%",
      border: `${Math.max(1.5, size * 0.06)}px solid ${rgba(0.95)}`,
      boxShadow: `0 0 10px ${rgba(0.8)}`,
      opacity: "0",
    });
    host.appendChild(ring);
    ring.animate(
      [
        { opacity: 0, transform: "scale(0.7)", offset: 0 },
        { opacity: 0, transform: "scale(0.7)", offset: at },
        { opacity: 1, transform: "scale(1)", offset: Math.min(1, at + 0.03) },
        { opacity: 0, transform: "scale(2.3)", offset: Math.min(1, at + 0.22) },
        { opacity: 0, transform: "scale(2.3)", offset: 1 },
      ],
      { duration: GUARD_SHOW_MS, fill: "both", easing: "ease-out" }
    );
  }

  // Éclats : de petites étoiles qui s'allument tour à tour autour du médaillon.
  const STARS = 6;
  for (let i = 0; i < STARS; i += 1) {
    const angle = (i / STARS) * Math.PI * 2 + 0.4;
    const distance = size * (0.78 + (i % 2) * 0.22);
    const star = document.createElement("span");
    const starSize = size * (0.34 + (i % 3) * 0.08);
    Object.assign(star.style, {
      position: "absolute",
      left: `${size / 2 + Math.cos(angle) * distance - starSize / 2}px`,
      top: `${size / 2 + Math.sin(angle) * distance - starSize / 2}px`,
      width: `${starSize}px`,
      height: `${starSize}px`,
      background:
        "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,251,235,1) 50%, rgba(255,255,255,0) 100%) center / 100% 14% no-repeat, " +
        "linear-gradient(0deg, rgba(255,255,255,0) 0%, rgba(255,251,235,1) 50%, rgba(255,255,255,0) 100%) center / 14% 100% no-repeat",
      filter: `drop-shadow(0 0 3px ${rgba(0.95)})`,
      opacity: "0",
    });
    host.appendChild(star);
    const start = 0.26 + (i / STARS) * 0.4;
    star.animate(
      [
        { opacity: 0, transform: "scale(0.2) rotate(0deg)", offset: 0 },
        { opacity: 0, transform: "scale(0.2) rotate(0deg)", offset: start },
        { opacity: 1, transform: "scale(1) rotate(45deg)", offset: start + 0.07 },
        { opacity: 0, transform: "scale(0.3) rotate(90deg)", offset: start + 0.16 },
        { opacity: 0, transform: "scale(0.3) rotate(90deg)", offset: 1 },
      ],
      { duration: GUARD_SHOW_MS, fill: "both" }
    );
  }

  // Le médaillon lui-même s'illumine et gonfle à chaque pulsation ; sans médaillon affiché, l'icône apparaît le temps de se montrer.
  const visible = o.icon !== null;
  let icon: HTMLElement;
  if (o.icon) icon = o.icon;
  else {
    const img = document.createElement("img");
    img.src = o.iconSrc;
    img.alt = "";
    img.draggable = false;
    // Glyphe pas encore livré : le halo et les éclats se montrent seuls, jamais une image cassée.
    img.onerror = () => {
      img.style.visibility = "hidden";
    };
    Object.assign(img.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain" });
    host.appendChild(img);
    icon = img;
  }
  icon.animate(
    [
      { transform: "scale(1)", filter: "none", opacity: visible ? 1 : 0 },
      { transform: "scale(1.35)", filter: `brightness(1.5) drop-shadow(0 0 8px ${rgba(0.95)})`, opacity: 1, offset: 0.3 },
      { transform: "scale(1.1)", filter: `brightness(1.15) drop-shadow(0 0 4px ${rgba(0.95)})`, opacity: 1, offset: 0.48 },
      { transform: "scale(1.38)", filter: `brightness(1.55) drop-shadow(0 0 10px ${rgba(0.95)})`, opacity: 1, offset: 0.64 },
      { transform: "scale(1)", filter: "none", opacity: visible ? 1 : 0, offset: 0.84 },
      { transform: "scale(1)", filter: "none", opacity: visible ? 1 : 0 },
    ],
    { duration: GUARD_SHOW_MS, fill: visible ? "none" : "both" }
  );

  fxLayer().appendChild(host);
  window.setTimeout(() => host.remove(), GUARD_SHOW_MS + 50);
}

// ── Bris d'un Objet ─────────────────────────────────────────────────────

/** Lueur du Bris, selon l'effet de l'Objet : dégâts (bleu), soin ou renfort (or), malus (pourpre). */
const BREAK_TONES = { attack: "125,211,252", heal: "252,211,77", malus: "232,121,249" } as const;

/**
 * Objets dont le Bris vient d'être mis en scène ici : le plateau ne les fait
 * pas éclater une seconde fois quand l'état réel les range au Cimetière
 * (`useTableMotion`). Réclamé une fois, oublié ensuite.
 */
const shownBreaks = new Set<string>();

/** Le Bris de cet Objet a-t-il déjà été joué (sans le réclamer) ? Son bruit d'éclats aussi est déjà parti. */
export function hasShownBreak(instanceId: string): boolean {
  return shownBreaks.has(instanceId);
}

/** `true` (une seule fois) si le Bris de cet Objet a déjà été joué par `breakObject`. */
export function consumeShownBreak(instanceId: string): boolean {
  return shownBreaks.delete(instanceId);
}

/** Éclats : des pointes qui partent d'un point d'impact un peu au-dessus du centre. */
const BREAK_IMPACT = [50, 42] as const;
const BREAK_RIM: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [34, 0], [68, 0], [100, 0], [100, 30], [100, 64], [100, 100], [66, 100], [32, 100], [0, 100], [0, 66], [0, 30],
];

/**
 * BRIS D'UN OBJET (demande du 12/10/2026) : une copie de la carte quitte sa
 * place (`from`), vient se tenir au-dessus de son Cimetière (`to`), s'y
 * illumine de la couleur de son effet en pulsant, se fissure — et, à
 * `shatterAtMs`, éclate : ses éclats sautent puis tombent dans le
 * Cimetière. L'original est masqué le temps du geste.
 *
 * `face` : l'élément à recopier — la carte sur le plateau, ou la carte du
 * dessus du Cimetière pour un Objet brisé depuis la main.
 */
export function breakObject(
  instanceId: string,
  face: HTMLElement,
  from: DOMRect,
  to: DOMRect,
  tone: keyof typeof BREAK_TONES,
  shatterAtMs: number,
  shatterMs: number
): void {
  shownBreaks.add(instanceId);
  window.setTimeout(() => shownBreaks.delete(instanceId), shatterAtMs + shatterMs + 4000);
  window.setTimeout(playCardShattered, shatterAtMs);
  if (reducedMotion()) return;

  const rgb = BREAK_TONES[tone];
  const layer = fxLayer();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    pointerEvents: "none",
    transformOrigin: "0 0",
  });

  /** Une copie inerte de la carte : ni identifiant de plateau, ni geste. */
  const copy = () => {
    const clone = face.cloneNode(true) as HTMLElement;
    for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("[data-board-unit],[data-card-id],[data-drop]"))]) {
      node.removeAttribute("data-board-unit");
      node.removeAttribute("data-card-id");
      node.removeAttribute("data-drop");
    }
    Object.assign(clone.style, { position: "absolute", inset: "0", width: "100%", height: "100%", margin: "0", transform: "none", animation: "none" });
    return clone;
  };

  const shards = BREAK_RIM.map((point, index) => {
    const next = BREAK_RIM[(index + 1) % BREAK_RIM.length]!;
    const shard = document.createElement("div");
    Object.assign(shard.style, {
      position: "absolute",
      inset: "0",
      clipPath: `polygon(${BREAK_IMPACT[0]}% ${BREAK_IMPACT[1]}%, ${point[0]}% ${point[1]}%, ${next[0]}% ${next[1]}%)`,
      willChange: "transform, opacity",
    });
    shard.appendChild(copy());
    host.appendChild(shard);
    return { shard, cx: (BREAK_IMPACT[0] + point[0] + next[0]) / 3, cy: (BREAK_IMPACT[1] + point[1] + next[1]) / 3 };
  });

  // Fissures : elles s'allument juste avant que la carte n'éclate.
  const svgNs = "http://www.w3.org/2000/svg";
  const cracks = document.createElementNS(svgNs, "svg");
  cracks.setAttribute("viewBox", "0 0 100 100");
  cracks.setAttribute("preserveAspectRatio", "none");
  Object.assign(cracks.style, { position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible", opacity: "0" });
  for (const [x, y] of BREAK_RIM) {
    const line = document.createElementNS(svgNs, "line");
    line.setAttribute("x1", String(BREAK_IMPACT[0]));
    line.setAttribute("y1", String(BREAK_IMPACT[1]));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", `rgb(${rgb})`);
    line.setAttribute("stroke-width", "1.4");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.style.filter = `drop-shadow(0 0 3px rgb(${rgb}))`;
    cracks.appendChild(line);
  }
  // La lumière de l'effet qui envahit la carte : elle pulse, s'embrase à l'éclatement, et s'éteint avec lui.
  const light = document.createElement("div");
  Object.assign(light.style, {
    position: "absolute",
    inset: "0",
    borderRadius: face.dataset.token !== undefined ? "50%" : "8%",
    background: `radial-gradient(circle at ${BREAK_IMPACT[0]}% ${BREAK_IMPACT[1]}%, rgba(255,255,255,0.95) 0%, rgba(${rgb},0.75) 30%, rgba(${rgb},0.25) 70%, rgba(${rgb},0) 100%)`,
    opacity: "0",
  });
  host.appendChild(cracks);
  host.insertBefore(light, cracks);
  layer.appendChild(host);

  const hiddenBefore = face.style.visibility;
  face.style.visibility = "hidden";

  // Au-dessus du Cimetière, un peu plus grande que la pile, comme soulevée.
  const scale = Math.max(0.6, Math.min(1.6, (to.height * 1.18) / from.height));
  const tx = to.left + to.width / 2 - (from.left + (from.width * scale) / 2);
  const ty = to.top + to.height / 2 - (from.top + (from.height * scale) / 2) - to.height * 0.12;
  const total = shatterAtMs + shatterMs;
  const at = (ms: number) => Math.min(1, Math.max(0, ms / total));
  const hover = `translate(${tx}px, ${ty}px) scale(${scale})`;
  const glow = (px: number, alpha: number) =>
    `brightness(${1 + alpha * 0.35}) drop-shadow(0 0 ${Math.round(px / 3)}px rgba(255,255,255,${alpha * 0.8})) drop-shadow(0 0 ${px}px rgba(${rgb},${alpha}))`;

  host.animate(
    [
      { transform: "translate(0, 0) scale(1)", filter: "none", easing: "cubic-bezier(.3,.7,.3,1)" },
      { offset: at(BREAK_LEAD_MS), transform: hover, filter: glow(14, 0.8) },
      { offset: at(BREAK_LEAD_MS + (shatterAtMs - BREAK_LEAD_MS) * 0.4), transform: hover, filter: glow(34, 1) },
      { offset: at(BREAK_LEAD_MS + (shatterAtMs - BREAK_LEAD_MS) * 0.7), transform: hover, filter: glow(18, 0.85) },
      { offset: at(shatterAtMs), transform: hover, filter: glow(42, 1) },
      { transform: hover, filter: glow(12, 0.5) },
    ],
    { duration: total, fill: "both" }
  );
  light.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0.35, offset: at(BREAK_LEAD_MS) },
      { opacity: 0.8, offset: at(BREAK_LEAD_MS + (shatterAtMs - BREAK_LEAD_MS) * 0.4) },
      { opacity: 0.45, offset: at(BREAK_LEAD_MS + (shatterAtMs - BREAK_LEAD_MS) * 0.7) },
      { opacity: 1, offset: at(shatterAtMs) },
      { opacity: 0, offset: at(shatterAtMs + 90) },
      { opacity: 0 },
    ],
    { duration: total, fill: "both" }
  );
  cracks.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: at(shatterAtMs - 140) },
      { opacity: 1, offset: at(shatterAtMs - 30) },
      { opacity: 0, offset: at(shatterAtMs + 60) },
      { opacity: 0 },
    ],
    { duration: total, fill: "both" }
  );

  // Les éclats sautent depuis le point d'impact, puis tombent dans la pile en s'éteignant.
  const fallX = (to.left + to.width / 2 - (from.left + tx)) / scale;
  const fallY = (to.top + to.height * 0.6 - (from.top + ty)) / scale;
  shards.forEach(({ shard, cx, cy }, index) => {
    const ox = ((cx - BREAK_IMPACT[0]) / 100) * from.width;
    const oy = ((cy - BREAK_IMPACT[1]) / 100) * from.height;
    const norm = Math.hypot(ox, oy) || 1;
    const burst = from.width * 0.22;
    const spin = (index % 2 === 0 ? 1 : -1) * (14 + ((index * 7) % 16));
    const ex = fallX - (cx / 100) * from.width;
    const ey = fallY - (cy / 100) * from.height;
    shard.style.transformOrigin = `${cx}% ${cy}%`;
    shard.animate(
      [
        { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, offset: 0 },
        { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, offset: at(shatterAtMs), easing: "cubic-bezier(.1,.8,.3,1)" },
        { transform: `translate(${(ox / norm) * burst}px, ${(oy / norm) * burst}px) rotate(${spin}deg) scale(0.95)`, opacity: 1, offset: at(shatterAtMs + shatterMs * 0.32), easing: "cubic-bezier(.55,0,.7,.4)" },
        { transform: `translate(${ex}px, ${ey}px) rotate(${spin * 3}deg) scale(0.25)`, opacity: 0 },
      ],
      { duration: total, fill: "both" }
    );
  });

  window.setTimeout(() => {
    host.remove();
    if (face.isConnected) face.style.visibility = hiddenBefore;
  }, total + 30);
}
