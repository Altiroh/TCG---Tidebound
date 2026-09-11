"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/game";

export interface AttackImpact {
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
}

/**
 * Plus long que `FLIGHT_DURATION_MS` (carte qui vole entre zones) — un
 * coup porté doit se voir et "prendre le temps" (demande explicite),
 * contrairement à un déplacement de carte plus anodin.
 */
export const ATTACK_IMPACT_DURATION_MS = 1000;

/**
 * Dérive les impacts de combat (`ATTACK` + `DAMAGE` qui suivent dans le
 * même lot d'événements) depuis `state.eventLog`, même principe que
 * `useCardFlights`/`useActionToasts` : un impact par `ATTACK`, avec le
 * montant de dégâts déjà résolu par le moteur (jamais recalculé côté
 * client) et, s'il y a combat mutuel, la riposte subie par l'attaquant.
 */
export function useAttackImpacts(state: GameState): AttackImpact[] {
  const [impacts, setImpacts] = useState<AttackImpact[]>([]);
  const lastSeenLength = useRef(0);
  const nextId = useRef(0);

  useEffect(() => {
    const newEvents = state.eventLog.slice(lastSeenLength.current);
    lastSeenLength.current = state.eventLog.length;
    if (newEvents.length === 0) return;

    const created: AttackImpact[] = [];
    newEvents.forEach((event, i) => {
      if (event.type !== "ATTACK") return;

      let amount = 0;
      let defenderPlayerId: PlayerId | undefined;
      let retaliation: number | undefined;

      for (let j = i + 1; j < newEvents.length; j++) {
        const next = newEvents[j];
        if (!next || next.type === "ATTACK") break;
        if (next.type !== "DAMAGE") continue;

        if (event.defenderInstanceId) {
          if (next.targetInstanceId === event.defenderInstanceId) amount += next.amount;
          else if (next.targetInstanceId === event.attackerInstanceId) retaliation = (retaliation ?? 0) + next.amount;
        } else if (next.targetPlayerId) {
          amount += next.amount;
          defenderPlayerId = next.targetPlayerId;
        }
      }

      created.push({
        id: nextId.current++,
        attackerInstanceId: event.attackerInstanceId,
        defenderInstanceId: event.defenderInstanceId,
        defenderPlayerId,
        amount,
        retaliation,
      });
    });
    if (created.length === 0) return;

    setImpacts((current) => [...current, ...created]);
    created.forEach((impact) => {
      setTimeout(() => {
        setImpacts((current) => current.filter((it) => it.id !== impact.id));
      }, ATTACK_IMPACT_DURATION_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit se déclencher que sur une nouvelle longueur de journal, pas à chaque nouvelle référence de `state`.
  }, [state.eventLog.length]);

  useEffect(() => {
    lastSeenLength.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialisation volontaire au (re)montage uniquement.
  }, []);

  return impacts;
}
