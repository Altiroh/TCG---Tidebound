"use client";

import { useLayoutEffect, useState } from "react";
import type { GameState } from "@/game";

interface EquipLink {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Paires (Équipement, unité équipée) actuellement attachées — tous joueurs confondus, l'attachement ne traverse jamais les plateaux (`game/cards/types.ts`). */
function equipPairs(state: GameState): Array<{ equipId: string; targetId: string }> {
  const pairs: Array<{ equipId: string; targetId: string }> = [];
  for (const player of state.players) {
    for (const unit of player.board) {
      if (unit.attachedToInstanceId) {
        pairs.push({ equipId: unit.instanceId, targetId: unit.attachedToInstanceId });
      }
    }
  }
  return pairs;
}

/**
 * Trait glow reliant chaque Équipement posé à l'unité qu'il équipe,
 * directement sur le plateau (`CardInstance.attachedToInstanceId`) — lit le
 * DOM (`[data-board-unit]`, déjà posé par `MatchBoard`/`OnlineBoard` sur
 * chaque tuile) plutôt que de dupliquer un système de refs : les deux
 * tuiles peuvent être n'importe où dans l'ordre du plateau, jamais
 * forcément côte à côte. Coordonnées VIEWPORT (même principe que
 * `DragTargetingTrail`) : un overlay `fixed` plein écran restitue
 * directement `getBoundingClientRect()`, qui tient déjà compte de
 * l'échelle appliquée par `BoardStage` — aucun calcul de repère à dupliquer
 * ici.
 */
export function EquipLinkOverlay({ state }: { state: GameState }) {
  const [links, setLinks] = useState<EquipLink[]>([]);
  // Change à chaque ajout/retrait/réordonnancement d'un permanent sur
  // N'IMPORTE quel plateau (pas seulement un (dés)attachement) : la
  // position des tuiles existantes se déplace dès qu'une carte rejoint ou
  // quitte la même rangée flex — il faut remesurer dans les deux cas.
  const boardKey = state.players.map((p) => p.board.map((u) => u.instanceId).join(",")).join("|");

  useLayoutEffect(() => {
    function measure() {
      const pairs = equipPairs(state);
      const next: EquipLink[] = [];
      for (const { equipId, targetId } of pairs) {
        const equipEl = document.querySelector(`[data-board-unit="${equipId}"]`);
        const targetEl = document.querySelector(`[data-board-unit="${targetId}"]`);
        if (!equipEl || !targetEl) continue;
        const equipRect = equipEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        next.push({
          key: equipId,
          x1: equipRect.left + equipRect.width / 2,
          y1: equipRect.bottom - 6,
          x2: targetRect.left + targetRect.width / 2,
          y2: targetRect.bottom - 6,
        });
      }
      setLinks(next);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement indexé sur `boardKey` (composition des plateaux), pas sur l'objet `state` entier qui change à chaque action sans rapport avec la disposition des tuiles.
  }, [boardKey]);

  if (links.length === 0) return null;

  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden>
      <defs>
        <filter id="equip-link-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {links.map((link) => {
        const midX = (link.x1 + link.x2) / 2;
        const sag = 22;
        const dip = Math.max(link.y1, link.y2) + sag;
        const path = `M ${link.x1} ${link.y1} Q ${midX} ${dip} ${link.x2} ${link.y2}`;
        return (
          <path
            key={link.key}
            d={path}
            fill="none"
            stroke="#f0c419"
            strokeWidth={2.5}
            strokeLinecap="round"
            filter="url(#equip-link-glow)"
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}
