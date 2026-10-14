"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ATTACK_IMPACT_AT_MS, ATTACK_TIMINGS, ATTACK_TOTAL_MS, type AttackAnimation } from "@/features/match/useAttackPresentation";
import { activateQualifications } from "@/features/match/qualificationFx";
import { playAttackImpact, playCardAwake, playShipHit } from "@/lib/sound";
import { FxCanvas, reducedMotion } from "@/features/match/FxCanvas";
import { silhouetteOf, type Silhouette } from "@/features/match/silhouette";
import { orbAura } from "@/features/match/cardFx";
import {
  createDustPainter,
  createSicknessPainter,
  dustBounds,
  IMPACT_DUST_MS,
  SICKNESS_BUBBLES_MS,
  sicknessBounds,
  type DustPlan,
  type DustRect,
} from "@/features/match/impactFx";

export interface Point {
  x: number;
  y: number;
}

export function centerOf(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Élément d'une unité de plateau ou d'un Navire ciblé — attributs `data-board-unit`/`data-ship-target` posés par `MatchBoard`/`OnlineBoard`. */
export function findElement(kind: "unit" | "ship", id: string): HTMLElement | null {
  // Une carte posée à droite de l'écran pour être activée (`FocusedCard`) : c'est d'elle que l'effet part.
  if (kind === "unit") {
    return (
      document.querySelector<HTMLElement>(`[data-focus-card="${id}"]`) ??
      document.querySelector<HTMLElement>(`[data-board-unit="${id}"]`) ??
      // Un Équipement glissé derrière son porteur : l'effet part de la carte
      // du porteur, qui l'emporte avec elle quand elle se soulève.
      document.querySelector<HTMLElement>(`[data-equip-tuck="${id}"]`)?.closest<HTMLElement>("[data-board-unit]") ??
      null
    );
  }
  // Le Navire lui-même, son cadre (`data-ship-frame`), et non sa cellule, plus large : les effets en prennent la forme.
  const cell = document.querySelector<HTMLElement>(`[data-ship-target="${id}"]`);
  return cell?.querySelector<HTMLElement>("[data-ship-frame]") ?? cell;
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
 * TREMBLEMENT au choc d'un coup physique : court, léger, dans tous les sens
 * (quelques pixels et une fraction de degré), comme une carte qui encaisse
 * sur la table. Ajouté (`composite: "add"`) à la transformation de la
 * carte, sans l'écraser — il se cumule aussi au balancement rouge d'une
 * carte qui perd de la Résistance (`animate-card-impact`).
 */
export function tremble(el: HTMLElement) {
  if (reducedMotion()) return;
  el.animate(
    [
      { transform: "translate(0, 0) rotate(0deg)" },
      { transform: "translate(-3px, 1.5px) rotate(-0.8deg)", offset: 0.12 },
      { transform: "translate(3px, -1px) rotate(0.7deg)", offset: 0.26 },
      { transform: "translate(-2px, -1.5px) rotate(-0.5deg)", offset: 0.42 },
      { transform: "translate(1.5px, 1px) rotate(0.35deg)", offset: 0.6 },
      { transform: "translate(-0.8px, 0.5px) rotate(-0.15deg)", offset: 0.8 },
      { transform: "translate(0, 0) rotate(0deg)" },
    ],
    { duration: 340, easing: "ease-out", composite: "add" }
  );
}

/** Les bulles vertes de la maladie, qui éclatent sur l'unité MALADE (`impactFx.ts`). */
export function SicknessBubbles({ rect, shape }: { rect: DustRect; shape?: Silhouette }) {
  const [paint] = useState(() => createSicknessPainter(rect, shape));
  return <FxCanvas bounds={sicknessBounds(rect)} durationMs={SICKNESS_BUBBLES_MS} paint={paint} />;
}

/** La poussière qui s'échappe tout autour de la cible au choc (`impactFx.ts`). */
export function ImpactDust({ plan }: { plan: DustPlan }) {
  const [paint] = useState(() => createDustPainter(plan));
  return <FxCanvas bounds={dustBounds(plan)} durationMs={IMPACT_DUST_MS} paint={paint} />;
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

  // L'attaquant s'embrase du halo d'orbe, dans le feu de l'attaque : il le porte jusqu'à la frappe.
  orbAura(attackerEl, "strike", { durationMs: t, burst: false });
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
  tide: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(245,208,254,0.8) 30%, rgba(162,28,175,0.4) 55%, rgba(112,26,117,0) 74%)",
  sickness: "radial-gradient(circle, rgba(240,253,244,0.9) 0%, rgba(134,239,172,0.75) 30%, rgba(22,163,74,0.35) 55%, rgba(22,163,74,0) 74%)",
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

function SingleAttack({ attack }: { attack: AttackAnimation }) {
  const [geometry, setGeometry] = useState<{ from: Point; to: Point; size: number; rect: DOMRect; shape: Silhouette } | null>(null);
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
    setGeometry({ from: centerOf(attackerEl.getBoundingClientRect()), to: centerOf(targetRect), size: Math.min(targetRect.height, 220), rect: targetRect, shape: silhouetteOf(targetEl) });
    // Le coup part tout de suite, Garde ou non : une Garde se montre quand on attaque À CÔTÉ d'elle (`showGuard`).
    // Une spé. de déclaration (Rafale, Déluge, Contournement) s'active d'abord : l'attaquant part ensuite.
    const lead = attack.leadMs ?? 0;
    let attackerAnimation: Animation | null = null;
    const startTimer = setTimeout(() => {
      // La carte se soulève pour frapper : elle se réveille, à l'oreille aussi.
      playCardAwake();
      attackerAnimation = animateAttacker(attackerEl, targetRect);
    }, lead);
    // Les qualifications de cette attaque : leur glyphe à la déclaration, au choc ou après le retour (`qualificationFx.ts`).
    // Les spé. : à la déclaration sur l'attaquant ; les autres une fois l'attaque classique jouée, retour compris,
    // sur la carte qui les porte (l'attaquant, ou le défenseur pour sa riposte). Leurs sorts suivent (`EffectFxLayer`).
    // Une spé. à la fois (`qualificationCues`), jamais toutes ensemble.
    const cancelQualifications = (attack.qualificationCues ?? []).map((cue) => {
      const timer = setTimeout(() => {
        const el = findElement("unit", cue.sourceInstanceId);
        if (el) activateQualifications(el, [cue.qualification]);
      }, cue.atMs);
      return () => clearTimeout(timer);
    });

    const impactTimer = setTimeout(() => {
      setImpacted(true);
      playAttackImpact();
      // Attaque directe qui porte : le Navire encaisse, en plus du choc.
      if (!attack.defenderInstanceId && attack.amount > 0) playShipHit();
      // Une cible qui survit et perd de la Résistance joue déjà `animate-card-impact` (CardTile) au moment où
      // l'état réel s'affiche : on ne double le tremblement que pour un Navire, une cible détruite ou un coup à 0.
      const target = attack.defenderInstanceId ? findElement("unit", attack.defenderInstanceId) : findElement("ship", attack.defenderPlayerId!);
      if (target && (!attack.defenderInstanceId || attack.defenderDies || attack.amount === 0)) shake(target);
      // Et toujours, un coup physique fait trembler ce qu'il touche — légèrement.
      if (target) tremble(target);
    }, lead + ATTACK_IMPACT_AT_MS);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(impactTimer);
      cancelQualifications.forEach((cancel) => cancel());
      // Démontage (ou double montage du mode strict en dev) : ne jamais laisser une animation orpheline empilée.
      attackerAnimation?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un seul cycle d'animation par attaque, jamais rejoué.
  }, []);

  if (!geometry) return null;
  return (
    <>
      {impacted && (
        <>
          <ImpactFlash point={geometry.to} />
          <ImpactDust plan={{ rect: geometry.rect, from: geometry.from, shape: geometry.shape }} />
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
