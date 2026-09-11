"use client";

import { useEffect, useRef, useState } from "react";
import type { AttackImpact } from "@/features/match/useAttackImpacts";
import { ATTACK_IMPACT_DURATION_MS } from "@/features/match/useAttackImpacts";
import { playAttackImpactSound } from "@/features/match/sound";

interface Point {
  x: number;
  y: number;
}

function centerOf(el: Element): Point {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Résout le centre (coordonnées viewport) d'une unité de plateau ou d'un Navire ciblé — mesuré en direct via les attributs `data-board-unit`/`data-ship-target` posés par `MatchBoard`/`OnlineBoard`, jamais recalculé analytiquement (le plateau est en flexbox, pas une grille à formule fixe). */
function resolvePoint(kind: "unit" | "ship", id: string): Point | null {
  const selector = kind === "unit" ? `[data-board-unit="${id}"]` : `[data-ship-target="${id}"]`;
  const el = document.querySelector(selector);
  return el ? centerOf(el) : null;
}

type Phase = "advancing" | "impact" | "returning" | "settled";

const PHASE_ADVANCE_MS = Math.round(ATTACK_IMPACT_DURATION_MS * 0.35);
const PHASE_IMPACT_MS = Math.round(ATTACK_IMPACT_DURATION_MS * 0.15);
const PHASE_RETURN_MS = ATTACK_IMPACT_DURATION_MS - PHASE_ADVANCE_MS - PHASE_IMPACT_MS;

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
      className="pointer-events-none absolute z-40 text-3xl font-black text-rose-400 [text-shadow:0_2px_6px_rgba(0,0,0,0.9),0_0_10px_rgba(244,63,94,0.6)]"
      style={{
        left: point.x,
        top: point.y - (risen ? 60 : 10),
        transform: "translate(-50%, -50%)",
        opacity: risen ? 0 : 1,
        transition: `top ${ATTACK_IMPACT_DURATION_MS * 0.7}ms ease-out, opacity ${ATTACK_IMPACT_DURATION_MS * 0.7}ms ease-in`,
      }}
    >
      -{amount}
    </div>
  );
}

function ImpactFlash({ point, active }: { point: Point; active: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 rounded-full"
      style={{
        left: point.x,
        top: point.y,
        width: 90,
        height: 90,
        transform: `translate(-50%, -50%) scale(${active ? 1 : 0.2})`,
        opacity: active ? 0.9 : 0,
        background: "radial-gradient(circle, rgba(255,241,214,0.95) 0%, rgba(239,68,68,0.55) 45%, rgba(239,68,68,0) 75%)",
        transition: `transform ${PHASE_IMPACT_MS}ms ease-out, opacity ${PHASE_RETURN_MS}ms ease-in ${PHASE_IMPACT_MS}ms`,
      }}
    />
  );
}

function SingleImpact({ impact }: { impact: AttackImpact }) {
  // `arrived` (façon `FlyingCard`) déclenche juste après le montage le
  // passage visuel de `from` à `to` via la transition CSS ; `stage`,
  // temporisé, pilote le reste (flash d'impact, nombre de dégâts, retour) —
  // deux horloges distinctes pour ne pas confondre "l'état CSS cible" et
  // "le moment réel où le coup a atteint sa cible".
  const [arrived, setArrived] = useState(false);
  const [stage, setStage] = useState<Phase>("advancing");
  const attackerPoint = useRef<Point | null>(null);
  const defenderPoint = useRef<Point | null>(null);
  const soundPlayed = useRef(false);

  useEffect(() => {
    attackerPoint.current = resolvePoint("unit", impact.attackerInstanceId);
    defenderPoint.current = impact.defenderInstanceId
      ? resolvePoint("unit", impact.defenderInstanceId)
      : impact.defenderPlayerId
        ? resolvePoint("ship", impact.defenderPlayerId)
        : null;

    const raf = requestAnimationFrame(() => setArrived(true));
    const toImpact = setTimeout(() => setStage("impact"), PHASE_ADVANCE_MS);
    const toReturning = setTimeout(() => setStage("returning"), PHASE_ADVANCE_MS + PHASE_IMPACT_MS);
    const toSettled = setTimeout(() => setStage("settled"), ATTACK_IMPACT_DURATION_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toImpact);
      clearTimeout(toReturning);
      clearTimeout(toSettled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un seul cycle d'animation par impact, jamais rejoué.
  }, []);

  useEffect(() => {
    if (stage === "impact" && !soundPlayed.current) {
      soundPlayed.current = true;
      playAttackImpactSound();
    }
  }, [stage]);

  const from = attackerPoint.current;
  const to = defenderPoint.current;
  if (!from || !to) return null;

  const returning = stage === "returning" || stage === "settled";
  const pos = returning ? from : arrived ? to : from;
  const duration = returning ? PHASE_RETURN_MS : PHASE_ADVANCE_MS;

  return (
    <>
      {/* Lame/projectile qui parcourt la distance attaquant → cible, puis revient. */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-30 rounded-full"
        style={{
          left: pos.x,
          top: pos.y,
          width: 22,
          height: 22,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.85) 55%, rgba(125,211,252,0) 80%)",
          boxShadow: "0 0 14px 4px rgba(125,211,252,0.65)",
          opacity: stage === "settled" ? 0 : 1,
          transition: `left ${duration}ms ease-${returning ? "in" : "out"}, top ${duration}ms ease-${returning ? "in" : "out"}, opacity 150ms`,
        }}
      />

      <ImpactFlash point={to} active={stage === "impact" || stage === "returning"} />
      {(stage === "impact" || stage === "returning" || stage === "settled") && (
        <FloatingDamage point={to} amount={impact.amount} />
      )}
      {impact.retaliation !== undefined && (stage === "returning" || stage === "settled") && (
        <FloatingDamage point={from} amount={impact.retaliation} />
      )}
    </>
  );
}

/**
 * Habillage visuel + sonore d'un coup porté (`useAttackImpacts`) : un
 * projectile part de l'attaquant, "frappe" la cible (flash + son + nombre
 * de dégâts qui s'envole), puis revient — et, en cas de combat mutuel, un
 * second nombre de dégâts apparaît sur l'attaquant pour la riposte. Rendu
 * en `fixed inset-0`, coordonnées VIEWPORT directes (mesurées via
 * `getBoundingClientRect` sur les attributs `data-board-unit`/
 * `data-ship-target`) — pas de conversion vers le repère `BoardStage`,
 * contrairement à `CardFlightLayer` qui utilise des ancres de zone déjà
 * exprimées dans ce repère.
 */
export function AttackImpactLayer({ impacts }: { impacts: AttackImpact[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {impacts.map((impact) => (
        <SingleImpact key={impact.id} impact={impact} />
      ))}
    </div>
  );
}
