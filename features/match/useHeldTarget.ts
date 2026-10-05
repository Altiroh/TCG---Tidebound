"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameState, PlayerAction } from "@/game";
import { sourcePolarity, type TargetPolarity } from "@/features/match/table/targetPolarity";

/** Une cible déjà désignée, qui garde sa marque tant que l'action n'est pas allée au bout. */
export interface HeldTarget {
  instanceId: string;
  /** `attack` : la cible d'une attaque ; sinon le sens de l'effet. */
  tone: TargetPolarity | "attack";
}

function findCardId(state: GameState, instanceId: string): string | undefined {
  for (const player of state.players) {
    const card = [...player.board, ...player.hand].find((c) => c.instanceId === instanceId);
    if (card) return card.cardId;
  }
  return undefined;
}

/** La cible que désigne cette action, et sa couleur ; `null` sans cible. */
function targetOf(state: GameState, action: PlayerAction): HeldTarget | null {
  switch (action.type) {
    case "attack":
      return action.defenderInstanceId ? { instanceId: action.defenderInstanceId, tone: "attack" } : null;
    case "playCard":
    case "breakObject":
    case "activateAbility":
    case "activateReaction": {
      if (!action.targetInstanceId) return null;
      const sourceId = action.type === "playCard" || action.type === "breakObject" ? action.instanceId : action.sourceInstanceId;
      const cardId = findCardId(state, sourceId);
      const kind = action.type === "playCard" ? "playCard" : action.type === "breakObject" ? "break" : action.type === "activateAbility" ? "ability" : "reaction";
      const tone = cardId ? sourcePolarity(cardId, kind, action.type === "activateReaction" ? action.abilityIndex : 0) : "hostile";
      return { instanceId: action.targetInstanceId, tone };
    }
    default:
      return null;
  }
}

/**
 * LA PREMIÈRE CIBLE RESTE CIBLÉE (05/10/2026) : une action qui vise une
 * unité et qui, en se résolvant, pose une nouvelle question (seconde cible,
 * réaction, défausse…) garde sa première cible MARQUÉE sur le plateau —
 * comme la flèche d'une attaque glissée reste plantée. La marque tombe
 * quand la table est libre (plus de question ni de fenêtre en attente).
 *
 * `note(action)` est appelé au moment où l'action part au moteur, avec
 * l'état d'AVANT (la carte source y est encore là où on l'a prise).
 */
export function useHeldTarget(state: GameState) {
  const [held, setHeld] = useState<HeldTarget | null>(null);
  const busy = Boolean(state.pendingChoice || state.pendingReaction);

  useEffect(() => {
    if (!busy) setHeld(null);
  }, [busy]);

  const note = useCallback((before: GameState, action: PlayerAction) => {
    const target = targetOf(before, action);
    if (target) setHeld(target);
  }, []);

  // La cible a quitté le plateau (détruite par l'effet même) : plus rien à marquer.
  const present = held ? state.players.some((p) => p.board.some((u) => u.instanceId === held.instanceId)) : false;
  return { held: busy && present ? held : null, note };
}
