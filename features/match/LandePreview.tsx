"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCardDefinition, PRECON_DECKS, type CardInstance, type GameState } from "@/game";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import { MatchBoard } from "@/features/match/MatchBoard";

const LANDES = ["pluie-corrosive", "chaine-de-construction", "vallee-de-verre"] as const;

function carte(cardId: string, ownerId: string, index: number): CardInstance {
  return { instanceId: `lab_${ownerId}_${cardId}_${index}`, cardId, ownerId, damageMarked: 0, modifiers: [], summoningSick: false, hasAttackedThisTurn: false };
}

/**
 * Laboratoire des LANDES (`/game/lande-preview`) : une partie locale à deux
 * sur le même écran, les trois Landes en main du premier joueur, de quoi
 * les payer, et quelques corps de chaque côté pour voir leurs règles agir.
 *
 * `?lande=<id>` : la Lande est déjà en jeu au chargement (sa scène seule,
 * sans l'arrivée) — pour régler un décor sans rejouer la carte.
 */
export function LandePreview() {
  const params = useSearchParams();
  // Construite après le montage : la partie tire un horodatage et une
  // graine, que le rendu serveur ne partagerait pas (erreur d'hydratation).
  const [state, setState] = useState<GameState | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lu une fois, à l'arrivée
  useEffect(() => setState(build()), []);
  function build(): GameState {
    const base = createLocalMatch(PRECON_DECKS[0]!, PRECON_DECKS[1]!);
    const deja = params.get("lande");
    const lande = deja && LANDES.includes(deja as (typeof LANDES)[number]) ? deja : null;
    return {
      ...base,
      environment: {
        ...base.environment,
        ...(lande ? { lande: { instanceId: "lab_lande", cardId: lande, ownerId: "p1", remainingPlayerTurns: 2 * getCardDefinition(lande).lande!.durationTableTurns } } : {}),
      },
      players: base.players.map((p) =>
        p.id === "p1"
          ? {
              ...p,
              reason: 10,
              hand: [...LANDES.filter((id) => id !== lande).map((id, i) => carte(id, p.id, i)), ...p.hand.slice(0, 3)],
              board: [carte("crabe-de-fer", p.id, 0), carte("marin-des-jetees", p.id, 1)],
            }
          : { ...p, board: [carte("crabe-de-fer", p.id, 0), carte("murene-aveugle", p.id, 1), carte("marin-des-jetees", p.id, 2)] }
      ) as GameState["players"],
    };
  }
  return state ? <MatchBoard initialState={state} onExit={() => window.history.back()} /> : null;
}
