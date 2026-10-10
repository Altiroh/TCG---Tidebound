"use client";

import { playCardAwake, playCardFlip, playGuardIntercept, playTokenDrop } from "@/lib/sound";
import { AWAKE_LIFT_MS, AWAKE_MS, GUARD_REVEAL_MS } from "@/features/match/effectPresentation";

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
 *   - Garde : le bouclier quitte son badge, vient au centre de l'écran,
 *     pulse, puis regagne sa carte (\`revealGuard\`).
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
 * soulevée que l'orbe de son sort se forme (\`EffectFxLayer\`).
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
      { offset: 0.74, transform: lifted, filter: `brightness(1.22) drop-shadow(0 0 16px ${AWAKE_GLOW})`, easing: "cubic-bezier(.5,0,.7,1)" },
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

const GUARD_AT_CENTER = 0.3;
const GUARD_LEAVES_CENTER = 0.72;
const GUARD_ICON_SRC = "/assets/status/garde.webp";

/**
 * Animation de Garde sur la carte \`defender\` : son badge de Garde (s'il est
 * affiché) s'en détache, file au centre de l'écran en grandissant, pulse
 * d'une lueur d'activation, puis revient se poser sur le badge, qui
 * réapparaît. Sans badge visible, le bouclier part du haut de la carte.
 * Rendue \`GUARD_REVEAL_MS\` : l'attaque attend la fin pour frapper.
 */
export function revealGuard(defender: HTMLElement): number {
  const badge = defender.querySelector<HTMLImageElement>(`img[src*="/status/garde"]`);
  window.setTimeout(playGuardIntercept, GUARD_REVEAL_MS * GUARD_AT_CENTER * 0.7);
  if (reducedMotion()) return GUARD_REVEAL_MS;

  const card = defender.getBoundingClientRect();
  const fromBox = badge?.getBoundingClientRect();
  const start = fromBox && fromBox.width > 0
    ? { x: fromBox.left + fromBox.width / 2, y: fromBox.top + fromBox.height / 2, size: fromBox.width }
    : { x: card.left + card.width / 2, y: card.top, size: Math.max(24, card.width * 0.22) };
  const big = Math.min(180, Math.max(110, window.innerHeight * 0.22));
  const scale = big / start.size;
  const dx = window.innerWidth / 2 - start.x;
  const dy = window.innerHeight / 2 - start.y;

  const layer = fxLayer();
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "absolute",
    left: `${start.x - start.size / 2}px`,
    top: `${start.y - start.size / 2}px`,
    width: `${start.size}px`,
    height: `${start.size}px`,
  });
  const halo = document.createElement("span");
  Object.assign(halo.style, {
    position: "absolute",
    inset: "-35%",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(253,230,138,0.55) 0%, rgba(251,191,36,0.25) 45%, rgba(251,191,36,0) 70%)",
    opacity: "0",
  });
  const icon = document.createElement("img");
  icon.src = badge?.currentSrc || badge?.src || GUARD_ICON_SRC;
  icon.alt = "";
  icon.draggable = false;
  Object.assign(icon.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "contain" });
  host.append(halo, icon);
  layer.appendChild(host);
  if (badge) badge.style.visibility = "hidden";

  const atCenter = `translate(${dx}px, ${dy}px) scale(${scale})`;
  const flight = host.animate(
    [
      { transform: "translate(0, 0) scale(1)", easing: "cubic-bezier(.3,.7,.3,1)" },
      { offset: GUARD_AT_CENTER, transform: atCenter },
      { offset: GUARD_LEAVES_CENTER, transform: atCenter, easing: "cubic-bezier(.5,0,.6,1)" },
      { transform: "translate(0, 0) scale(1)" },
    ],
    { duration: GUARD_REVEAL_MS, fill: "both" }
  );
  // Lueur d'activation : deux pulsations pendant que le bouclier tient le centre.
  const glow = "drop-shadow(0 0 14px rgba(253,224,71,0.95)) brightness(1.25)";
  icon.animate(
    [
      { filter: "none", offset: 0 },
      { filter: "none", offset: GUARD_AT_CENTER },
      { filter: glow, offset: 0.42 },
      { filter: "brightness(1.05)", offset: 0.53 },
      { filter: glow, offset: 0.63 },
      { filter: "none", offset: GUARD_LEAVES_CENTER },
      { filter: "none" },
    ],
    { duration: GUARD_REVEAL_MS, fill: "both" }
  );
  halo.animate(
    [
      { opacity: 0, transform: "scale(0.6)", offset: 0 },
      { opacity: 0, transform: "scale(0.6)", offset: GUARD_AT_CENTER },
      { opacity: 1, transform: "scale(1.1)", offset: 0.42 },
      { opacity: 0.45, transform: "scale(0.95)", offset: 0.53 },
      { opacity: 1, transform: "scale(1.15)", offset: 0.63 },
      { opacity: 0, transform: "scale(0.8)", offset: GUARD_LEAVES_CENTER },
      { opacity: 0 },
    ],
    { duration: GUARD_REVEAL_MS, fill: "both" }
  );
  const done = () => {
    host.remove();
    if (badge) badge.style.visibility = "";
  };
  flight.onfinish = done;
  flight.oncancel = done;
  return GUARD_REVEAL_MS;
}
