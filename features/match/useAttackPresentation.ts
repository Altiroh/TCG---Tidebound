"use client";

import { useEffect, useRef, useState } from "react";
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
export function deriveAttack(events: GameEvent[], after: GameState, id: number): AttackAnimation | null {
  const index = events.findIndex((event) => event.type === "ATTACK");
  const event = events[index];
  if (!event || event.type !== "ATTACK") return null;

  let amount = 0;
  let defenderPlayerId: PlayerId | undefined;
  let retaliation: number | undefined;
  // Seuls les coups marqués par le moteur (`DamageEvent.combat`) : un
  // Contrecoup renvoyé ou les dégâts d'une capacité ne sont pas « le coup ».
  for (const next of events.slice(index + 1)) {
    if (next.type === "ATTACK") break;
    if (next.type !== "DAMAGE" || !next.combat) continue;
    if (next.combat === "retaliation") {
      retaliation = (retaliation ?? 0) + next.amount;
    } else {
      amount += next.amount;
      if (next.targetPlayerId) defenderPlayerId = next.targetPlayerId;
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

/** Ce que la mise en scène a vu passer, et ce qu'elle retient. */
interface Presentation {
  /** Dernier état réel examiné. */
  live: GameState;
  /** État AFFICHÉ à la place du réel pendant le coup — `null` hors mise en scène. */
  held: GameState | null;
  /** L'attaque en cours de mise en scène, s'il y en a une. */
  attack: AttackAnimation | null;
  /** Ce coup termine la partie : on laisse l'animation aller au bout avant l'écran de fin. */
  finalBlow: boolean;
}

/** Après un coup qui termine la partie : le temps de voir le Navire encaisser avant l'écran de fin. */
const FINAL_BLOW_LINGER_MS = 900;

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
 *
 * La retenue est décidée PENDANT LE RENDU (mise à jour d'état en cours de
 * rendu, pas dans un effet) : les enfants ne voient JAMAIS l'état réel
 * avant le choc. Avec un effet — même de layout — le plateau était d'abord
 * validé avec l'état réel, et `useTableMotion`, dont l'effet passe AVANT
 * celui du parent, faisait déjà voler la carte détruite vers la défausse ;
 * puis la retenue la faisait réapparaître pour le coup, et elle repartait
 * une seconde fois. Une carte ne doit mourir qu'une fois.
 */
export function useAttackPresentation(live: GameState): { displayState: GameState; attacks: AttackAnimation[] } {
  const [presentation, setPresentation] = useState<Presentation>({ live, held: null, attack: null, finalBlow: false });
  const [attacks, setAttacks] = useState<AttackAnimation[]>([]);
  const nextId = useRef(0);

  if (presentation.live !== live) {
    const previous = presentation.live;
    const newEvents = live.eventLog.length > previous.eventLog.length ? live.eventLog.slice(previous.eventLog.length) : [];
    const attack = deriveAttack(newEvents, live, nextId.current);
    const staged = attack !== null && !prefersReducedMotion();
    if (staged) nextId.current += 1;
    setPresentation({
      live,
      held: staged ? previous : null,
      attack: staged ? attack : null,
      finalBlow: staged && live.status === "finished" && previous.status !== "finished",
    });
  }

  // Minuteurs de l'attaque mise en scène : relâcher l'état retenu au bon
  // moment, puis retirer l'animation. La relâche ne touche qu'à SA mise en
  // scène : un état plus récent l'a peut-être déjà remplacée.
  const staged = presentation.attack;
  const finalBlow = presentation.finalBlow;
  useEffect(() => {
    if (!staged) return;
    setAttacks((current) => (current.some((it) => it.id === staged.id) ? current : [...current, staged]));
    // Le coup de grâce : l'écran de fin n'arrive qu'une fois le coup joué
    // jusqu'au bout, retour compris, et le temps d'un souffle.
    const holdMs = finalBlow
      ? ATTACK_TOTAL_MS + FINAL_BLOW_LINGER_MS
      : staged.defenderDies || staged.attackerDies
        ? ATTACK_TOTAL_MS
        : ATTACK_IMPACT_AT_MS;
    const release = setTimeout(
      () => setPresentation((current) => (current.attack?.id === staged.id ? { ...current, held: null } : current)),
      holdMs
    );
    setTimeout(() => setAttacks((current) => current.filter((it) => it.id !== staged.id)), ATTACK_TOTAL_MS + 900);
    return () => clearTimeout(release);
  }, [staged, finalBlow]);

  return { displayState: presentation.held ?? presentation.live, attacks };
}
