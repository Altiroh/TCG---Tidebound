"use client";

import { useEffect, useState } from "react";
import type { GameState, PlayerId } from "@/game";

/** Ce que le plateau doit savoir pendant la défausse de fin de tour. */
export interface HandLimitDiscardMode {
  /** Cartes à jeter en tout. */
  count: number;
  /** Déjà glissées au Cimetière, pas encore envoyées au moteur (défausse de plusieurs cartes). */
  staged: ReadonlySet<string>;
  /** Une carte de la main vient d'être lâchée sur le Cimetière. */
  onDiscard: (instanceId: string) => void;
}

/**
 * LIMITE DE MAIN, côté plateau : quand la fin du tour s'arrête sur « trop
 * de cartes » (`pendingChoice` `handDiscard` + `handLimit`), le joueur
 * GLISSE lui-même les cartes à jeter dans son Cimetière — pas de fenêtre
 * par-dessus le plateau, c'est sa main qu'il regarde.
 *
 * Plusieurs cartes à jeter : chacune lâchée est mise de côté (retirée de la
 * main affichée) et la réponse part au moteur avec la dernière. « Annuler »
 * les remet en main tant que le compte n'est pas atteint.
 */
export function useHandLimitDiscard(state: GameState, viewerId: PlayerId, submit: (discardInstanceIds: string[]) => void) {
  const choice = state.pendingChoice;
  const active = choice?.kind === "handDiscard" && choice.handLimit === true && choice.playerId === viewerId ? choice : null;
  const [staged, setStaged] = useState<string[]>([]);

  // Une nouvelle question (ou plus de question du tout) repart de zéro.
  const choiceKey = active ? `${active.turnNumber}:${active.count}` : null;
  useEffect(() => setStaged([]), [choiceKey]);

  if (!active) return { mode: null, hint: null, cancel: undefined };

  const remaining = active.count - staged.length;
  const mode: HandLimitDiscardMode = {
    count: active.count,
    staged: new Set(staged),
    onDiscard: (instanceId) => {
      if (staged.includes(instanceId)) return;
      const next = [...staged, instanceId];
      if (next.length >= active.count) {
        setStaged([]);
        submit(next);
      } else {
        setStaged(next);
      }
    },
  };
  const hint = `Main pleine : glisse ${remaining} carte${remaining > 1 ? "s" : ""} dans ton Cimetière pour finir ton tour.`;
  return { mode, hint, cancel: staged.length > 0 ? () => setStaged([]) : undefined };
}
