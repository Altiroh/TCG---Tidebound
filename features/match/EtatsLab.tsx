"use client";

import { useEffect, useState } from "react";
import { PRECON_DECKS, STATUS_MALADE, type CardInstance, type GameState } from "@/game";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import { MatchBoard } from "@/features/match/MatchBoard";

/**
 * LAB DES ÉTATS (`/game/etats-preview`) : le VRAI plateau (`MatchBoard`),
 * en partie locale, sur un état fabriqué — des unités qui portent des états
 * (Garde, Malade, Pied marin, durée) des deux côtés, pour régler leur
 * lecture : badges au-dessus des cartes, aperçu au survol, zoom au doigt.
 */
export function EtatsLab() {
  // Fabriquée dans le navigateur seulement : la graine et les identifiants
  // tirés au rendu serveur ne correspondraient pas à ceux du client.
  const [state, setState] = useState<GameState | null>(null);
  useEffect(() => setState(fabriquer()), []);
  return state ? <MatchBoard initialState={state} onExit={() => undefined} botPlayerId="p2" /> : null;
}

function fabriquer(): GameState {
  const base = createLocalMatch(PRECON_DECKS[0]!, PRECON_DECKS[1]!, "player1");
  const pose = (cardId: string, ownerId: string, extra: Partial<CardInstance> = {}): CardInstance => ({
    instanceId: `lab_${cardId}_${ownerId}`,
    cardId,
    ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
    ...extra,
  });
  const [p1, p2] = base.players;
  return {
    ...base,
    phase: "mainPhase",
    players: [
      {
        ...p1,
        reason: 8,
        // Une carte à effet d'arrivée ciblé, pour voir l'ouverture automatique à la pose.
        hand: [pose("canonnier-fele", p1.id, { instanceId: "lab_canonnier_main" }), ...p1.hand.slice(0, 3)],
        board: [
          pose("il-capitano-naufrage", p1.id, { damageMarked: 1 }),
          pose("le-dernier-rempart", p1.id, { statuses: [STATUS_MALADE] }),
          pose("caisses-arrimees", p1.id, { turnsRemaining: 2 }),
        ],
      },
      {
        ...p2,
        board: [pose("murene-aveugle", p2.id, { statuses: [STATUS_MALADE] }), pose("le-dernier-rempart", p2.id), pose("canonnier-fele", p2.id, { damageMarked: 1 })],
      },
    ],
  };
}
