"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { GameEvent, GameState, PlayerId } from "@/game";

export interface AttackAnimation {
  id: number;
  attackerInstanceId: string;
  /** Cible unité, absente pour une attaque directe du Navire. */
  defenderInstanceId?: string;
  /** Cible Navire (attaque directe) — présent seulement si `defenderInstanceId` est absent. */
  defenderPlayerId?: PlayerId;
  /** Dégâts infligés à la cible principale (unité ou Navire). */
  amount: number;
  /** Dégâts de riposte encaissés par l'attaquant (combat mutuel unité contre unité), si non nul. */
  retaliation?: number;
  /** La cible unité a quitté le plateau à l'issue du combat. */
  defenderDies: boolean;
  /** L'attaquant a quitté le plateau (riposte mortelle). */
  attackerDies: boolean;
}

/**
 * Découpage de l'animation d'attaque (retour de test du 13/09) : la carte
 * se soulève, prend un léger élan en arrière, frappe sa cible, puis revient.
 * Le choc tombe à `ATTACK_IMPACT_AT_MS` — c'est à cet instant que les dégâts
 * deviennent visibles.
 */
export const ATTACK_TIMINGS = { lift: 170, windup: 210, strike: 140, back: 400 } as const;
export const ATTACK_IMPACT_AT_MS = ATTACK_TIMINGS.lift + ATTACK_TIMINGS.windup + ATTACK_TIMINGS.strike;
export const ATTACK_TOTAL_MS = ATTACK_IMPACT_AT_MS + ATTACK_TIMINGS.back;

function onAnyBoard(state: GameState, instanceId: string): boolean {
  return state.players.some((player) => player.board.some((unit) => unit.instanceId === instanceId));
}

/** Premier `ATTACK` du lot, avec les dégâts déjà résolus par le moteur (jamais recalculés côté client). */
function deriveAttack(events: GameEvent[], after: GameState, id: number): AttackAnimation | null {
  const index = events.findIndex((event) => event.type === "ATTACK");
  const event = events[index];
  if (!event || event.type !== "ATTACK") return null;

  let amount = 0;
  let defenderPlayerId: PlayerId | undefined;
  let retaliation: number | undefined;
  for (const next of events.slice(index + 1)) {
    if (next.type === "ATTACK") break;
    if (next.type !== "DAMAGE") continue;
    if (event.defenderInstanceId) {
      if (next.targetInstanceId === event.defenderInstanceId) amount += next.amount;
      else if (next.targetInstanceId === event.attackerInstanceId) retaliation = (retaliation ?? 0) + next.amount;
    } else if (next.targetPlayerId) {
      amount += next.amount;
      defenderPlayerId = next.targetPlayerId;
    }
  }

  return {
    id,
    attackerInstanceId: event.attackerInstanceId,
    defenderInstanceId: event.defenderInstanceId,
    // Attaque directe sans DAMAGE (0 dégât) : le Navire visé reste celui de l'adversaire de l'attaquant.
    defenderPlayerId: event.defenderInstanceId
      ? undefined
      : (defenderPlayerId ?? after.players.find((player) => player.id !== event.playerId)?.id),
    amount,
    retaliation,
    defenderDies: Boolean(event.defenderInstanceId) && !onAnyBoard(after, event.defenderInstanceId!),
    attackerDies: !onAnyBoard(after, event.attackerInstanceId),
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Met en scène les attaques en retardant l'état AFFICHÉ, jamais l'état de
 * jeu : quand un nouvel état contient un `ATTACK`, le plateau continue
 * d'afficher l'état d'avant l'attaque (attaquant et cible encore en place,
 * Résistances intactes) pendant que `AttackImpactLayer` anime la vraie carte,
 * puis bascule sur l'état réel au choc — ou à la fin du retour si une carte
 * meurt, pour qu'elle encaisse le coup avant de partir au cimetière.
 *
 * Les appelants doivent continuer à valider/appliquer les actions sur l'état
 * RÉEL (`live`), pas sur `displayState`. Un nouvel état qui arrive pendant
 * une mise en scène l'interrompt : l'affichage rattrape aussitôt le réel.
 * `useLayoutEffect` : la bascule vers l'état retenu se fait avant la
 * peinture, sans une frame où les dégâts apparaîtraient trop tôt.
 */
export function useAttackPresentation(live: GameState): { displayState: GameState; attacks: AttackAnimation[] } {
  const [held, setHeld] = useState<GameState | null>(null);
  const [attacks, setAttacks] = useState<AttackAnimation[]>([]);
  const previousLive = useRef(live);
  const releaseTimer = useRef<ReturnType<typeof setTimeout>>();
  const nextId = useRef(0);

  useLayoutEffect(() => {
    const previous = previousLive.current;
    previousLive.current = live;
    if (previous === live) return;

    clearTimeout(releaseTimer.current);
    const newEvents = live.eventLog.length > previous.eventLog.length ? live.eventLog.slice(previous.eventLog.length) : [];
    const attack = deriveAttack(newEvents, live, nextId.current++);
    if (!attack || prefersReducedMotion()) {
      setHeld(null);
      return;
    }

    setHeld(previous);
    setAttacks((current) => [...current, attack]);
    const holdMs = attack.defenderDies || attack.attackerDies ? ATTACK_TOTAL_MS : ATTACK_IMPACT_AT_MS;
    releaseTimer.current = setTimeout(() => setHeld(null), holdMs);
    setTimeout(() => setAttacks((current) => current.filter((it) => it.id !== attack.id)), ATTACK_TOTAL_MS + 900);
  }, [live]);

  useLayoutEffect(() => () => clearTimeout(releaseTimer.current), []);

  return { displayState: held ?? live, attacks };
}
