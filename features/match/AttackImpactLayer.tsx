"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { ATTACK_IMPACT_AT_MS, ATTACK_TIMINGS, ATTACK_TOTAL_MS, type AttackAnimation } from "@/features/match/useAttackPresentation";
import { playRandomAttackSound } from "@/lib/sound";

interface Point {
  x: number;
  y: number;
}

function centerOf(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Élément d'une unité de plateau ou d'un Navire ciblé — attributs `data-board-unit`/`data-ship-target` posés par `MatchBoard`/`OnlineBoard`. */
function findElement(kind: "unit" | "ship", id: string): HTMLElement | null {
  const selector = kind === "unit" ? `[data-board-unit="${id}"]` : `[data-ship-target="${id}"]`;
  return document.querySelector<HTMLElement>(selector);
}

/** Léger tremblement + flash, joué au choc sur la cible (et sur l'attaquant en cas de riposte). */
function shake(el: HTMLElement) {
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

function FloatingDamage({ point, amount }: { point: Point; amount: number }) {
  const [risen, setRisen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRisen(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (amount <= 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-40 text-4xl font-black text-rose-400 [text-shadow:0_2px_6px_rgba(0,0,0,0.9),0_0_10px_rgba(244,63,94,0.6)]"
      style={{
        left: point.x,
        top: point.y - (risen ? 64 : 0),
        transform: `translate(-50%, -50%) scale(${risen ? 1 : 1.6})`,
        opacity: risen ? 0 : 1,
        transition: "top 900ms cubic-bezier(.2,.8,.3,1), transform 220ms ease-out, opacity 900ms cubic-bezier(.7,0,.9,.4)",
      }}
    >
      -{amount}
    </div>
  );
}

function ImpactFlash({ point }: { point: Point }) {
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
        background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,241,214,0.7) 35%, rgba(239,68,68,0) 72%)",
        transition: "transform 320ms ease-out, opacity 380ms ease-in",
      }}
    />
  );
}

/** Trait de ciblage bref (même style que `DragTargetingTrail`) — rend lisible QUI vise QUOI, surtout pour les attaques du bot. */
function TargetingLine({ from, to }: { from: Point; to: Point }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), ATTACK_TIMINGS.lift + ATTACK_TIMINGS.windup);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
    };
  }, []);
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: visible ? 1 : 0, transition: "opacity 140ms ease-out" }} aria-hidden>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgba(2,6,23,0.45)" strokeWidth={3.5} />
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgba(147,197,253,0.8)" strokeWidth={1.5} strokeDasharray="12 6" />
      <circle cx={to.x} cy={to.y} r={7} fill="rgba(2,6,23,0.35)" stroke="rgba(147,197,253,0.85)" strokeWidth={1.5} />
    </svg>
  );
}

function SingleAttack({ attack }: { attack: AttackAnimation }) {
  const [geometry, setGeometry] = useState<{ from: Point; to: Point } | null>(null);
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
    setGeometry({ from: centerOf(attackerEl.getBoundingClientRect()), to: centerOf(targetRect) });
    const attackerAnimation = animateAttacker(attackerEl, targetRect);

    const impactTimer = setTimeout(() => {
      setImpacted(true);
      playRandomAttackSound();
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
      <TargetingLine from={geometry.from} to={geometry.to} />
      {impacted && (
        <>
          <ImpactFlash point={geometry.to} />
          <FloatingDamage point={geometry.to} amount={attack.amount} />
          {attack.retaliation !== undefined && <FloatingDamage point={geometry.from} amount={attack.retaliation} />}
        </>
      )}
    </>
  );
}

/**
 * Mise en scène d'une attaque (`useAttackPresentation`) : trait de ciblage,
 * mouvement de la vraie carte attaquante (soulèvement, élan, frappe, retour),
 * puis au choc un flash, un léger tremblement, le son et les dégâts qui
 * s'envolent — riposte comprise en combat mutuel. Coordonnées VIEWPORT
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
