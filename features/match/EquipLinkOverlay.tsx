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
 * Trait en angles droits reliant chaque Équipement posé à l'unité qu'il équipe,
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
          y1: equipRect.bottom + 3,
          x2: targetRect.left + targetRect.width / 2,
          y2: targetRect.bottom + 3,
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
      {links.map((link) => {
        // Tracé orthogonal (retour de test du 13/09) : descend sous l'Équipement, file à angle droit jusqu'à
        // l'aplomb de l'unité équipée, puis remonte vers elle. Bleu discret et fin, sans halo.
        const dip = Math.max(link.y1, link.y2) + 14;
        const path = `M ${link.x1} ${link.y1} V ${dip} H ${link.x2} V ${link.y2}`;
        return (
          <g key={link.key}>
            <path d={path} fill="none" stroke="rgba(2,6,23,0.4)" strokeWidth={3} strokeLinejoin="miter" />
            <path d={path} fill="none" stroke="rgba(147,197,253,0.7)" strokeWidth={1.25} strokeLinejoin="miter" />
            <circle cx={link.x1} cy={link.y1} r={2} fill="rgba(147,197,253,0.85)" />
            <circle cx={link.x2} cy={link.y2} r={2} fill="rgba(147,197,253,0.85)" />
          </g>
        );
      })}
    </svg>
  );
}
