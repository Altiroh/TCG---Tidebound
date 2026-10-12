"use client";

import { playCardAwake, playCardFlip, playCardShattered, playGuardIntercept, playTokenDrop } from "@/lib/sound";
import { AWAKE_LIFT_MS, AWAKE_MS, BREAK_LEAD_MS, GUARD_SHOW_MS, ORB_CHARGE_MS } from "@/features/match/effectPresentation";

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
function fxLayer(): HTMLElement {
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

// ── Réveil ──────────────────────────────────────────────────────────────

const AWAKE_GLOW = "rgba(253, 224, 71, 0.95)";

/**
 * La carte se soulève (\`AWAKE_LIFT_MS\`), sa lueur pulse deux fois, puis elle
 * retombe à sa place — \`AWAKE_MS\` en tout. C'est pendant qu'elle est
 * soulevée que l'orbe de son sort se forme, accrochée à son bord bas
 * (\`EffectFxLayer\`) : elle reste levée jusqu'au départ des comètes.
 */
export function awakenCard(el: HTMLElement, delayMs = 0): void {
  soundAt(delayMs, playCardAwake);
  if (reducedMotion()) return;
  const lifted = "translateY(-9%) scale(1.07)";
  el.animate(
    [
      { transform: "none", filter: "none" },
      { offset: AWAKE_LIFT_MS / AWAKE_MS, transform: lifted, filter: `brightness(1.12) drop-shadow(0 0 4px ${AWAKE_GLOW})` },
      { offset: 0.42, transform: lifted, filter: `brightness(1.25) drop-shadow(0 0 18px ${AWAKE_GLOW})` },
      { offset: 0.58, transform: lifted, filter: `brightness(1.1) drop-shadow(0 0 6px ${AWAKE_GLOW})` },
      { offset: (AWAKE_LIFT_MS + ORB_CHARGE_MS) / AWAKE_MS, transform: lifted, filter: `brightness(1.22) drop-shadow(0 0 16px ${AWAKE_GLOW})`, easing: "cubic-bezier(.5,0,.7,1)" },
      { transform: "none", filter: "none" },
    ],
    { duration: AWAKE_MS, delay: delayMs, easing: "cubic-bezier(.2,.8,.3,1)" }
  );
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
const GUARD_GOLD = "rgba(253,224,71,0.95)";

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
  if (reducedMotion()) return;

  const lifted = "translateY(-9%) scale(1.07)";
  const glow = (px: number) => `brightness(1.18) drop-shadow(0 0 ${px}px ${GUARD_GOLD})`;
  guard.animate(
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

  // Le scintillement se pose au badge s'il est affiché, sinon en haut au centre de la carte. Il vit dans le
  // calque plein écran — dans la carte, son halo était rogné au RECTANGLE de la tuile, ce qui dessinait un
  // cadre de carte autour d'un jeton ovale — et suit la carte qui se lève.
  const badge = guard.querySelector<HTMLImageElement>(`img[src*="/status/garde"]`);
  const cardBox = guard.getBoundingClientRect();
  const badgeBox = badge?.getBoundingClientRect();
  const visibleBadge = badgeBox && badgeBox.width > 0;
  const size = visibleBadge ? badgeBox.width : cardBox.width * 0.3;
  const center = visibleBadge
    ? { x: badgeBox.left + badgeBox.width / 2, y: badgeBox.top + badgeBox.height / 2 }
    : { x: cardBox.left + cardBox.width / 2, y: cardBox.top + cardBox.height * 0.2 };
  // Où ce point se trouve une fois la carte levée (`lifted`, autour de son centre).
  const cardCenter = { x: cardBox.left + cardBox.width / 2, y: cardBox.top + cardBox.height / 2 };
  const rise = {
    x: (center.x - cardCenter.x) * 0.07,
    y: (center.y - cardCenter.y) * 0.07 - cardBox.height * 0.09,
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
    background: "radial-gradient(circle, rgba(255,251,235,0.95) 0%, rgba(253,224,71,0.6) 22%, rgba(251,191,36,0.22) 48%, rgba(251,191,36,0) 70%)",
    mixBlendMode: "screen",
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
      border: `${Math.max(1.5, size * 0.06)}px solid rgba(253,230,138,0.95)`,
      boxShadow: "0 0 10px rgba(253,224,71,0.8)",
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

  // Éclats : de petites étoiles qui s'allument tour à tour autour du badge.
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
      filter: "drop-shadow(0 0 3px rgba(253,224,71,0.95))",
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

  // Le badge lui-même s'illumine et gonfle à chaque pulsation ; sans badge affiché, le bouclier apparaît le temps de se montrer.
  const icon = visibleBadge && badge ? badge : document.createElement("img");
  if (icon !== badge) {
    icon.src = GUARD_ICON_SRC;
    icon.alt = "";
    icon.draggable = false;
    Object.assign(icon.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain" });
    host.appendChild(icon);
  }
  icon.animate(
    [
      { transform: "scale(1)", filter: "none", opacity: visibleBadge ? 1 : 0 },
      { transform: "scale(1.35)", filter: `brightness(1.5) drop-shadow(0 0 8px ${GUARD_GOLD})`, opacity: 1, offset: 0.3 },
      { transform: "scale(1.1)", filter: `brightness(1.15) drop-shadow(0 0 4px ${GUARD_GOLD})`, opacity: 1, offset: 0.48 },
      { transform: "scale(1.38)", filter: `brightness(1.55) drop-shadow(0 0 10px ${GUARD_GOLD})`, opacity: 1, offset: 0.64 },
      { transform: "scale(1)", filter: "none", opacity: visibleBadge ? 1 : 0, offset: 0.84 },
      { transform: "scale(1)", filter: "none", opacity: visibleBadge ? 1 : 0 },
    ],
    { duration: GUARD_SHOW_MS, fill: visibleBadge ? "none" : "both" }
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
    mixBlendMode: "screen",
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
