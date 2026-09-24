"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ATTACK_IMPACT_AT_MS, ATTACK_TIMINGS, ATTACK_TOTAL_MS, type AttackAnimation } from "@/features/match/useAttackPresentation";
import { playAttackImpact } from "@/lib/sound";

export interface Point {
  x: number;
  y: number;
}

export function centerOf(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Élément d'une unité de plateau ou d'un Navire ciblé — attributs `data-board-unit`/`data-ship-target` posés par `MatchBoard`/`OnlineBoard`. */
export function findElement(kind: "unit" | "ship", id: string): HTMLElement | null {
  const selector = kind === "unit" ? `[data-board-unit="${id}"]` : `[data-ship-target="${id}"]`;
  return document.querySelector<HTMLElement>(selector);
}

/** Léger tremblement + flash, joué au choc sur la cible (et sur l'attaquant en cas de riposte). */
export function shake(el: HTMLElement) {
  el.animate(
    [
      { transform: "translateX(0)", filter: "brightness(1)" },
      { transform: "translateX(-6px)", filter: "brightness(1.9)", offset: 0.15 },
      { transform: "translateX(5px)", filter: "brightness(1.5)", offset: 0.35 },
      { transform: "translateX(-3px)", offset: 0.55 },
      { transform: "translateX(2px)", offset: 0.75 },
      { transform: "translateX(0)", filter: "brightness(1)" },
    ],
    { duration: 320, easing: "ease-out" }
  );
}

/**
 * Anime la VRAIE carte attaquante (Web Animations API sur son conteneur de
 * plateau), sans passer par un rendu React à chaque frame : soulèvement →
 * prise d'élan à l'opposé de la cible → frappe → retour. Les distances sont
 * mesurées en coordonnées viewport puis ramenées dans le repère de
 * `BoardStage` (mis à l'échelle via `transform: scale`), où vit la carte.
 */
function animateAttacker(attackerEl: HTMLElement, targetRect: DOMRect): Animation {
  const attackerRect = attackerEl.getBoundingClientRect();
  const scale = attackerEl.offsetWidth ? attackerRect.width / attackerEl.offsetWidth : 1;
  const from = centerOf(attackerRect);
  const to = centerOf(targetRect);
  const dx = (to.x - from.x) / scale;
  const dy = (to.y - from.y) / scale;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  // S'arrête quand la carte "touche" sa cible (légère interpénétration), pas en plein centre.
  const contact = ((attackerRect.height + targetRect.height) / 2 / scale) * 0.7;
  const reach = Math.max(distance * 0.4, distance - contact);
  const windup = 26;
  const tilt = ux >= 0 ? -4 : 4;

  const t = ATTACK_TOTAL_MS;
  const liftAt = ATTACK_TIMINGS.lift / t;
  const windupAt = (ATTACK_TIMINGS.lift + ATTACK_TIMINGS.windup) / t;
  const impactAt = ATTACK_IMPACT_AT_MS / t;

  const previousZ = attackerEl.style.zIndex;
  const previousPosition = attackerEl.style.position;
  attackerEl.style.position = "relative";
  attackerEl.style.zIndex = "60";

  const animation = attackerEl.animate(
    [
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)", filter: "drop-shadow(0 0 0 rgba(0,0,0,0))", easing: "cubic-bezier(.2,.8,.3,1)" },
      { offset: liftAt, transform: "translate(0px, -10px) scale(1.08) rotate(0deg)", filter: "drop-shadow(0 16px 14px rgba(0,0,0,.55))", easing: "cubic-bezier(.4,0,.6,1)" },
      { offset: windupAt, transform: `translate(${-ux * windup}px, ${-uy * windup - 10}px) scale(1.1) rotate(${tilt}deg)`, filter: "drop-shadow(0 20px 16px rgba(0,0,0,.55))", easing: "cubic-bezier(.55,0,1,.45)" },
      { offset: impactAt, transform: `translate(${ux * reach}px, ${uy * reach}px) scale(1.04) rotate(0deg)`, filter: "drop-shadow(0 8px 8px rgba(0,0,0,.5))", easing: "cubic-bezier(.2,.8,.25,1)" },
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)", filter: "drop-shadow(0 0 0 rgba(0,0,0,0))" },
    ],
    { duration: t }
  );

  const restore = () => {
    attackerEl.style.zIndex = previousZ;
    attackerEl.style.position = previousPosition;
  };
  animation.onfinish = restore;
  animation.oncancel = restore;
  return animation;
}

/**
 * LA PLAQUE DE DÉGÂTS — trois planches de bois cloutées, pendues à leur
 * corde (`public/assets/ui/<couleur>-dammage.webp`), et le chiffre peint dessus.
 *
 * Le choix de la plaque dit la GRAVITÉ du coup avant même qu'on lise le
 * chiffre : un point de dégât (bleu), deux ou trois (jaune), davantage
 * (rouge). C'est la même information, donnée deux fois — la couleur se voit
 * du coin de l'œil, le chiffre se lit quand on regarde. Les fichiers sont
 * nommés par leur COULEUR : les anciens noms low/strong étaient inversés
 * (la plaque « low » était la rouge).
 */
const DAMAGE_PLATES = [
  { max: 1, src: "/assets/ui/blue-dammage.webp" },
  { max: 3, src: "/assets/ui/yellow-dammage.webp" },
  { max: Infinity, src: "/assets/ui/red-dammage.webp" },
] as const;

function plateFor(amount: number): string {
  // La dernière borne est `Infinity` : la recherche aboutit toujours.
  return (DAMAGE_PLATES.find((plate) => amount <= plate.max) ?? DAMAGE_PLATES[2]).src;
}

/**
 * Le chiffre est PEINT sur la planche : centré sur son champ de couleur,
 * qui occupe la moitié haute de la plaque (la corde en prend le quart du
 * haut, le décor de vagues le bas). Mesuré sur l'illustration rognée
 * (519 × 1222) : centre à 50 % / 53 %.
 */
const PLATE_TEXT_CENTER_Y = "53%";

export function FloatingDamage({ point, amount }: { point: Point; amount: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    const plate = el?.firstElementChild as HTMLElement | null;
    if (!el || !plate) return undefined;

    const sobre = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // La plaque tient en l'air le temps qu'on la lise, puis s'élève et s'efface.
    const montee = el.animate(
      [
        { transform: "translate(-50%, -50%)", opacity: 1, offset: 0 },
        { transform: "translate(-50%, -50%)", opacity: 1, offset: 0.58 },
        { transform: "translate(-50%, calc(-50% - 58px))", opacity: 0, offset: 1 },
      ],
      { duration: 1150, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" }
    );

    // L'ARRIVÉE : la plaque tombe sur la cible, dépasse, et se balance au
    // bout de sa corde avant de se stabiliser. La rotation part du HAUT
    // (`transform-origin`), là où la corde la tient — un pivot au centre
    // donnerait une toupie, pas un pendule.
    const arrivee = sobre
      ? null
      : plate.animate(
          [
            { transform: "scale(0.45) rotate(-10deg)", offset: 0 },
            { transform: "scale(1.2) rotate(6deg)", offset: 0.26 },
            { transform: "scale(0.95) rotate(-4deg)", offset: 0.45 },
            { transform: "scale(1.06) rotate(2.5deg)", offset: 0.62 },
            { transform: "scale(0.99) rotate(-1.2deg)", offset: 0.8 },
            { transform: "scale(1) rotate(0deg)", offset: 1 },
          ],
          { duration: 640, easing: "cubic-bezier(.2,.9,.25,1)", fill: "forwards" }
        );

    return () => {
      montee.cancel();
      arrivee?.cancel();
    };
  }, []);

  if (amount <= 0) return null;
  const chiffres = String(amount).length;

  return (
    <div
      ref={host}
      aria-hidden
      className="pointer-events-none absolute z-40"
      style={{ left: point.x, top: point.y, transform: "translate(-50%, -50%)" }}
    >
      <div
        style={
          {
            position: "relative",
            /* Hauteur mesurée sur l'ÉCRAN, pas sur le plateau : la couche
               d'impact vit en coordonnées viewport, au-dessus de la scène
               mise à l'échelle. Nommée une fois — le chiffre se mesure
               dessus (un `font-size` en pourcentage suivrait la taille du
               texte hérité, pas la plaque). */
            "--plate-height": "clamp(58px, 11vh, 122px)",
            height: "var(--plate-height)",
            aspectRatio: "519 / 1222",
            transformOrigin: "top center",
            filter: "drop-shadow(0 6px 12px rgba(0, 0, 0, 0.55))",
          } as CSSProperties
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- couche d'animation : pas de mise en page à réserver, et `next/image` n'apporte rien sur une image de 21 Ko déjà à sa taille. */}
        <img src={plateFor(amount)} alt="" draggable={false} style={{ display: "block", height: "100%", width: "100%" }} />
        <span
          style={{
            position: "absolute",
            top: PLATE_TEXT_CENTER_Y,
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontFamily: "var(--font-card-title), Georgia, serif",
            /* Deux chiffres tiennent dans le même champ : la taille cède,
               pas la plaque. */
            fontSize: `calc(var(--plate-height) * ${chiffres > 1 ? 0.26 : 0.34})`,
            fontWeight: 700,
            lineHeight: 1,
            color: "#fff",
            /* Bordure du chiffre : quatre ombres dures font le contour, la
               cinquième le décolle de la planche. `-webkit-text-stroke`
               seul rongeait l'intérieur des chiffres. */
            textShadow:
              "1.5px 0 0 #2b1508, -1.5px 0 0 #2b1508, 0 1.5px 0 #2b1508, 0 -1.5px 0 #2b1508, 1px 1px 0 #2b1508, -1px 1px 0 #2b1508, 1px -1px 0 #2b1508, -1px -1px 0 #2b1508, 0 3px 7px rgba(0, 0, 0, 0.65)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {amount}
        </span>
      </div>
    </div>
  );
}

/** Teintes du flash de choc : blanc-rouge pour un coup, bleu-violet pour un effet, orangé pour un boulet. */
const FLASH_TINTS = {
  strike: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,241,214,0.7) 35%, rgba(239,68,68,0) 72%)",
  magic: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(165,243,252,0.75) 30%, rgba(167,139,250,0.35) 55%, rgba(129,140,248,0) 74%)",
  cannon: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(254,215,170,0.8) 30%, rgba(234,88,12,0.35) 55%, rgba(234,88,12,0) 74%)",
} as const;

export function ImpactFlash({ point, tint = "strike" }: { point: Point; tint?: keyof typeof FLASH_TINTS }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDone(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 rounded-full"
      style={{
        left: point.x,
        top: point.y,
        width: 110,
        height: 110,
        transform: `translate(-50%, -50%) scale(${done ? 1.3 : 0.3})`,
        opacity: done ? 0 : 0.95,
        background: FLASH_TINTS[tint],
        transition: "transform 320ms ease-out, opacity 380ms ease-in",
      }}
    />
  );
}

/**
 * Un peu de FUMÉE au point de choc : quelques volutes grises qui gonflent,
 * s'écartent en montant et se dissipent. `size` est la hauteur de la cible
 * à l'écran — la fumée suit la taille du plateau. Déterministe (pas de
 * hasard au rendu) : les volutes sont réparties en éventail.
 */
export function SmokeBurst({ point, size, puffs = 7 }: { point: Point; size: number; puffs?: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const animations = Array.from(el.children).map((child, index) => {
      // Éventail vers le haut : de -160° à -20°, alterné pour ne pas tourner en rond.
      const angle = ((-160 + (140 * index) / Math.max(1, puffs - 1)) * Math.PI) / 180;
      const reach = size * (0.28 + ((index * 37) % 5) * 0.05);
      const dx = Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach - size * 0.12;
      return (child as HTMLElement).animate(
        [
          { transform: "translate(-50%, -50%) scale(0.25)", opacity: 0 },
          { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.35}px)) scale(0.8)`, opacity: 0.75, offset: 0.2 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.6)`, opacity: 0 },
        ],
        { duration: 820 + index * 40, delay: index * 18, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }
      );
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [puffs, size]);

  const puff = size * 0.3;
  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute z-30" style={{ left: point.x, top: point.y }}>
      {Array.from({ length: puffs }, (_, index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: puff,
            height: puff,
            borderRadius: "9999px",
            opacity: 0,
            background: "radial-gradient(circle, rgba(226,232,240,0.85) 0%, rgba(148,163,184,0.55) 45%, rgba(100,116,139,0) 72%)",
            filter: "blur(2px)",
          }}
        />
      ))}
    </div>
  );
}

function SingleAttack({ attack }: { attack: AttackAnimation }) {
  const [geometry, setGeometry] = useState<{ from: Point; to: Point; size: number } | null>(null);
  const [impacted, setImpacted] = useState(false);

  // `useLayoutEffect` : l'état affiché est encore celui d'avant l'attaque (`useAttackPresentation`), attaquant et cible sont en place.
  useLayoutEffect(() => {
    const attackerEl = findElement("unit", attack.attackerInstanceId);
    const targetEl = attack.defenderInstanceId
      ? findElement("unit", attack.defenderInstanceId)
      : attack.defenderPlayerId
        ? findElement("ship", attack.defenderPlayerId)
        : null;
    if (!attackerEl || !targetEl) return undefined;

    const targetRect = targetEl.getBoundingClientRect();
    setGeometry({ from: centerOf(attackerEl.getBoundingClientRect()), to: centerOf(targetRect), size: Math.min(targetRect.height, 220) });
    const attackerAnimation = animateAttacker(attackerEl, targetRect);

    const impactTimer = setTimeout(() => {
      setImpacted(true);
      playAttackImpact();
      // Une cible qui survit et perd de la Résistance joue déjà `animate-card-impact` (CardTile) au moment où
      // l'état réel s'affiche : on ne double le tremblement que pour un Navire, une cible détruite ou un coup à 0.
      const target = attack.defenderInstanceId ? findElement("unit", attack.defenderInstanceId) : findElement("ship", attack.defenderPlayerId!);
      if (target && (!attack.defenderInstanceId || attack.defenderDies || attack.amount === 0)) shake(target);
    }, ATTACK_IMPACT_AT_MS);
    return () => {
      clearTimeout(impactTimer);
      // Démontage (ou double montage du mode strict en dev) : ne jamais laisser une animation orpheline empilée.
      attackerAnimation.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un seul cycle d'animation par attaque, jamais rejoué.
  }, []);

  if (!geometry) return null;
  return (
    <>
      {impacted && (
        <>
          <ImpactFlash point={geometry.to} />
          <SmokeBurst point={geometry.to} size={geometry.size} />
          <FloatingDamage point={geometry.to} amount={attack.amount} />
          {attack.retaliation !== undefined && <FloatingDamage point={geometry.from} amount={attack.retaliation} />}
        </>
      )}
    </>
  );
}

/**
 * Mise en scène d'une attaque (`useAttackPresentation`) :
 * mouvement de la vraie carte attaquante (soulèvement, élan, frappe, retour),
 * puis au choc un flash, un peu de fumée, un léger tremblement, le son et
 * la plaque de dégâts — riposte comprise en combat mutuel. Coordonnées VIEWPORT
 * directes (`fixed inset-0`), mesurées sur les éléments du plateau.
 */
export function AttackImpactLayer({ attacks }: { attacks: AttackAnimation[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {attacks.map((attack) => (
        <SingleAttack key={attack.id} attack={attack} />
      ))}
    </div>
  );
}
