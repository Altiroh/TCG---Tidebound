"use client";

import { useEffect, useRef, useState } from "react";
import { pendingDieRoll, type DieOutcome, type DieRollChoice, type DieSize, type GameState, type PlayerId } from "@/game";

/** Un lancer à montrer sur la table. */
export interface DiceThrow {
  /**
   * Identité du LANCER : change à chaque nouveau jet et à chaque relance (le
   * dé repart), reste la même quand le jet est seulement ajusté (+1, Chaîne)
   * ou quand il se ferme (le dé déjà posé s'éclaire, il ne repart pas).
   */
  key: string;
  rollerId: PlayerId;
  die: DieSize;
  /** Une face, ou deux dés à départager (Double tentative). */
  faces: number[];
  /** Le jet attend encore une décision (Chaîne ouverte). */
  open: boolean;
  /** Issue, une fois le jet fermé. */
  outcome?: DieOutcome;
  cardId?: string;
  /** Le jet ouvert, quand il y en a un : les gestes encore possibles s'y lisent. */
  choice?: DieRollChoice;
}

/** Temps pendant lequel un dé fermé reste posé sur la table avant de s'effacer. */
export const SETTLED_LINGER_MS = 2600;

/**
 * Un jet ouvert peut s'éclipser un instant de l'état : briser un Objet
 * « Chaîne » ouvre d'abord sa fenêtre de réaction, puis le jet revient (ou se
 * ferme). Pendant ce battement, le dé reste posé — sans pastilles — au lieu
 * de disparaître et d'être relancé.
 */
export const OPEN_GRACE_MS = 1500;

function resolvedEvents(state: GameState) {
  return state.eventLog.filter((e): e is Extract<GameState["eventLog"][number], { type: "DIE_RESOLVED" }> => e.type === "DIE_RESOLVED");
}

/**
 * Le lancer courant, lu sur l'état — sans rien mémoriser du moteur.
 *
 * - Un jet OUVERT (`pendingDieRoll`) : le dé est sur la table et attend.
 * - Sinon, le dernier jet FERMÉ (`DIE_RESOLVED`), s'il est arrivé depuis
 *   l'ouverture de l'écran (on ne rejoue pas les jets d'une partie rechargée),
 *   et seulement le temps qu'on le voie se poser.
 *
 * La clé d'un jet ouvert et celle de l'événement qui le ferme sont la même
 * (`<jets déjà fermés>:<tirages>`) : le dé ne repart pas en se fermant.
 */
export function useDiceThrow(state: GameState): DiceThrow | null {
  const resolved = resolvedEvents(state);
  const seenAtMount = useRef(resolved.length);
  const pending = pendingDieRoll(state);

  let current: DiceThrow | null = null;
  if (pending) {
    current = {
      key: `${resolved.length}:${pending.rolls.length}`,
      rollerId: pending.playerId,
      die: pending.die,
      faces: pending.candidates ?? [pending.value ?? 1],
      open: true,
      ...(pending.cardId ? { cardId: pending.cardId } : {}),
      choice: pending,
    };
  } else if (resolved.length > seenAtMount.current) {
    const last = resolved[resolved.length - 1]!;
    current = {
      key: `${resolved.length - 1}:${last.rolls.length}`,
      rollerId: last.playerId,
      die: last.die as DieSize,
      faces: [last.value],
      open: false,
      outcome: last.outcome,
      ...(last.cardId ? { cardId: last.cardId } : {}),
    };
  }

  // Le jet ouvert s'est éclipsé sans se fermer : on garde le dé posé un instant.
  const lastOpen = useRef<DiceThrow | null>(null);
  const [graceOver, setGraceOver] = useState<string | null>(null);
  if (current?.open) lastOpen.current = current;
  else if (current) lastOpen.current = null;
  const enSuspens = !current && lastOpen.current && resolvedEvents(state).length === Number(lastOpen.current.key.split(":")[0]) ? lastOpen.current : null;
  const suspensKey = enSuspens?.key ?? null;
  useEffect(() => {
    if (!suspensKey) return;
    const timer = window.setTimeout(() => setGraceOver(suspensKey), OPEN_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [suspensKey]);
  if (enSuspens && graceOver !== enSuspens.key) {
    const { choice: _gestes, ...pose } = enSuspens;
    current = pose;
  }

  // Un jet fermé s'efface de lui-même ; un nouveau jet le remplace aussitôt.
  const [expiredKey, setExpiredKey] = useState<string | null>(null);
  const settledKey = current && !current.open ? `${current.key}:${current.outcome}` : null;
  useEffect(() => {
    if (!settledKey) return;
    const timer = window.setTimeout(() => setExpiredKey(settledKey), SETTLED_LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [settledKey]);

  if (settledKey && expiredKey === settledKey) return null;
  return current;
}
