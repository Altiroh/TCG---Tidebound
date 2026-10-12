"use client";

import { QUALIFICATIONS, qualificationGlyphUrl, type QualificationId } from "@/game";
import { QUALIFICATION_FX, QUALIFICATION_SHOW_MS, TONES, type QualificationFx, type Tone } from "@/features/match/qualificationFxData";
import { findElement, shake, tremble } from "@/features/match/AttackImpactLayer";
import { fxLayer } from "@/features/match/cardFx";
import { playCardAwake, playMagicImpact, playShipHit } from "@/lib/sound";

/**
 * QUALIFICATIONS EN SCÈNE — quand une qualification joue
 * (`QUALIFICATION_TRIGGERED`), son glyphe (`public/assets/qualifications/`)
 * jaillit au-dessus de la carte ou du Navire concerné, grandit dans un halo
 * à sa couleur, se tient le temps qu'on le lise avec sa légende (« Brèche
 * +2 »), puis s'élève et s'efface.
 *
 * Le MOMENT suit ce que fait la qualification :
 *   - à la DÉCLARATION, sur l'attaquant qui se lève : ce qui rend l'attaque
 *     possible (Rafale pour la 2e attaque, Déluge, Contournement) ;
 *   - au CHOC : ce que le coup provoque (Coup de grâce et Entaille sur la
 *     cible, Éclaboussure sur chaque voisin et Salve sur chaque autre cible,
 *     qui tremblent ; Brèche et
 *     Ponction sur le Navire adverse, qui encaisse ; Sangsue sur le Navire du
 *     porteur, qui récupère) — décalés pour se lire l'un après l'autre ;
 *   - APRÈS le retour : Carnage, l'attaque de plus.
 *
 * Fonctions impératives, comme `cardFx.ts` : `AttackImpactLayer` les joue
 * pour une attaque de partie, le labo (`FxLabPanel`) à la demande.
 */

export { QUALIFICATION_FX, QUALIFICATION_SHOW_MS, qualificationFxFrom, type QualificationFx, type QualificationMoment } from "@/features/match/qualificationFxData";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** L'élément sur lequel le glyphe se pose. */
function anchorOf(fx: QualificationFx): HTMLElement | null {
  const spec = QUALIFICATION_FX[fx.qualification];
  if (spec.on === "source") return findElement("unit", fx.sourceInstanceId);
  if (fx.targetInstanceId) return findElement("unit", fx.targetInstanceId);
  if (fx.targetPlayerId) return findElement("ship", fx.targetPlayerId);
  return findElement("unit", fx.sourceInstanceId);
}

/**
 * Le glyphe jaillit au-dessus de `el` (au tiers haut d'une carte, au
 * centre d'un Navire), dans un halo à la couleur de la qualification, avec
 * sa légende. Sans glyphe livré : un disque sombre à l'initiale, comme le
 * médaillon du plateau.
 */
export function showQualification(el: HTMLElement, qualification: QualificationId, options: { caption?: string; tone?: Tone; delayMs?: number } = {}): void {
  const { delayMs = 0 } = options;
  const run = () => {
    if (reducedMotion() || !el.isConnected) return;
    const tone = TONES[options.tone ?? QUALIFICATION_FX[qualification].tone];
    const box = el.getBoundingClientRect();
    const ship = el.hasAttribute("data-ship-target");
    const size = Math.max(54, Math.min(110, (ship ? box.height * 0.55 : box.width * 0.62)));
    const cx = box.left + box.width / 2;
    const cy = ship ? box.top + box.height / 2 : box.top + box.height * 0.32;

    const host = document.createElement("div");
    host.dataset.qualificationFx = qualification;
    Object.assign(host.style, {
      position: "absolute",
      left: `${cx - size / 2}px`,
      top: `${cy - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      pointerEvents: "none",
    });

    const halo = document.createElement("span");
    Object.assign(halo.style, {
      position: "absolute",
      inset: `${-size * 0.45}px`,
      borderRadius: "50%",
      background: `radial-gradient(circle, rgba(${tone},0.75) 0%, rgba(${tone},0.32) 38%, rgba(${tone},0) 68%)`,
      mixBlendMode: "screen",
    });
    host.appendChild(halo);

    const glyph = document.createElement("img");
    glyph.src = qualificationGlyphUrl(qualification);
    glyph.alt = "";
    glyph.draggable = false;
    Object.assign(glyph.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      filter: `drop-shadow(0 0 ${size * 0.12}px rgba(${tone},0.9)) drop-shadow(0 4px 8px rgba(0,0,0,0.7))`,
    });
    // Glyphe pas encore livré : l'initiale dans un disque, jamais un trou.
    glyph.onerror = () => {
      const disc = document.createElement("span");
      Object.assign(disc.style, {
        position: "absolute",
        inset: "6%",
        borderRadius: "50%",
        border: `2px solid rgba(${tone},0.9)`,
        background: "rgba(15,23,42,0.92)",
        color: "#fef3c7",
        font: `700 ${Math.round(size * 0.42)}px var(--font-card-title, serif)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });
      disc.textContent = QUALIFICATIONS[qualification].name.charAt(0);
      glyph.replaceWith(disc);
    };
    host.appendChild(glyph);

    // Reflet qui balaie le médaillon une fois posé.
    const shine = document.createElement("span");
    Object.assign(shine.style, {
      position: "absolute",
      inset: "8%",
      borderRadius: "50%",
      overflow: "hidden",
      background: "linear-gradient(115deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 65%)",
      backgroundSize: "250% 100%",
      backgroundPosition: "130% 0",
      mixBlendMode: "screen",
    });
    host.appendChild(shine);

    const caption = options.caption ?? QUALIFICATIONS[qualification].name;
    const label = document.createElement("span");
    label.textContent = caption;
    Object.assign(label.style, {
      position: "absolute",
      left: "50%",
      top: "100%",
      marginTop: `${size * 0.08}px`,
      transform: "translateX(-50%)",
      whiteSpace: "nowrap",
      padding: "2px 9px",
      borderRadius: "9999px",
      background: "rgba(2,6,23,0.82)",
      border: `1px solid rgba(${tone},0.7)`,
      color: "#fff",
      font: `700 ${Math.round(Math.max(12, size * 0.18))}px var(--font-card-title, serif)`,
      letterSpacing: "0.02em",
      boxShadow: `0 0 10px rgba(${tone},0.45)`,
    });
    host.appendChild(label);

    fxLayer().appendChild(host);
    const D = QUALIFICATION_SHOW_MS;
    const pop = host.animate(
      [
        { transform: "translateY(10px) scale(0.3)", opacity: 0, easing: "cubic-bezier(.2,1.4,.4,1)" },
        { offset: 0.18, transform: "translateY(0) scale(1.14)", opacity: 1 },
        { offset: 0.28, transform: "translateY(0) scale(1)", opacity: 1 },
        { offset: 0.78, transform: "translateY(-4px) scale(1)", opacity: 1, easing: "cubic-bezier(.5,0,.8,.6)" },
        { transform: "translateY(-34px) scale(0.92)", opacity: 0 },
      ],
      { duration: D, fill: "both" }
    );
    halo.animate(
      [
        { transform: "scale(0.4)", opacity: 0 },
        { offset: 0.2, transform: "scale(1.15)", opacity: 1 },
        { offset: 0.45, transform: "scale(0.95)", opacity: 0.7 },
        { offset: 0.62, transform: "scale(1.08)", opacity: 0.9 },
        { transform: "scale(1.3)", opacity: 0 },
      ],
      { duration: D, fill: "both" }
    );
    shine.animate([{ backgroundPosition: "130% 0" }, { offset: 0.3, backgroundPosition: "130% 0" }, { offset: 0.58, backgroundPosition: "-30% 0" }, { backgroundPosition: "-30% 0" }], {
      duration: D,
      fill: "both",
    });
    pop.onfinish = () => host.remove();
    pop.oncancel = () => host.remove();
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}

/**
 * Joue la qualification à son moment : `impactAtMs` et `afterMs` sont
 * comptés depuis le départ de l'attaque. Ce qu'elle touche réagit aussi :
 * le voisin éclaboussé tremble, le Navire qui encaisse la Brèche secoue.
 */
export function playQualificationFx(fx: QualificationFx, timing: { impactAtMs: number; afterMs: number }, index = 0): () => void {
  const spec = QUALIFICATION_FX[fx.qualification];
  const at = (spec.moment === "declare" ? 0 : spec.moment === "impact" ? timing.impactAtMs : timing.afterMs) + spec.offsetMs + index * 70;
  // Le minuteur est rendu à l'appelant : une attaque démontée (ou le double montage du mode strict) ne laisse rien derrière elle.
  const timer = window.setTimeout(() => {
    const el = anchorOf(fx);
    if (!el) return;
    showQualification(el, fx.qualification, { caption: spec.caption(fx.amount) });
    if (spec.moment === "declare") playCardAwake();
    else playMagicImpact();
    if (fx.qualification === "eclaboussure" || fx.qualification === "coup-de-grace" || fx.qualification === "salve") {
      shake(el);
      tremble(el);
    }
    if (fx.qualification === "breche") {
      playShipHit();
      shake(el);
    }
  }, at);
  return () => window.clearTimeout(timer);
}
