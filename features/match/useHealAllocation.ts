"use client";

import { useEffect, useState } from "react";
import { getCardDefinition, type GameState, type PlayerId } from "@/game";
import type { ChoiceBannerAction } from "@/features/match/ChoiceBanner";

/** Ce que le plateau doit savoir pendant une répartition de soins. */
export interface BoardAllocationMode {
  /** Unités qui peuvent recevoir un point (blessées, et pas déjà comblées). */
  eligible: ReadonlySet<string>;
  /** Points déjà versés, par unité. */
  amounts: ReadonlyMap<string, number>;
  onAdd: (instanceId: string) => void;
  onRemove: (instanceId: string) => void;
}

type Allocation = Array<{ instanceId: string; amount: number }>;

/**
 * « Restaurez jusqu'à N Résistance répartie entre les unités que vous
 * contrôlez » (Trousse du Bord, Chirurgien du Bord) — SUR LE PLATEAU :
 * toucher une unité blessée y verse un point (pastille « +N » sur la
 * carte), clic droit le reprend. Le bandeau en haut dit ce qu'il reste
 * à répartir ; « Réparer » valide (répartir moins est permis). Sans
 * réponse au bout d'une minute, la répartition en cours s'applique telle
 * quelle — rien de versé, rien de réparé.
 */
export function useHealAllocation(state: GameState, viewerId: PlayerId, submit: (allocation: Allocation) => void) {
  const choice = state.pendingChoice;
  const active = choice?.kind === "healAllocation" && choice.playerId === viewerId ? choice : null;
  const [parts, setParts] = useState<Record<string, number>>({});
  const key = active ? `${active.turnNumber}:${active.sourceInstanceId ?? ""}:${active.budget}` : null;
  useEffect(() => setParts({}), [key]);

  if (!active || !key) return { mode: null as BoardAllocationMode | null, banner: null };

  const board = state.players.find((p) => p.id === viewerId)?.board ?? [];
  const spent = Object.values(parts).reduce((sum, n) => sum + n, 0);
  const left = active.budget - spent;
  const wounded = board.filter((unit) => unit.damageMarked > 0);
  const eligible = new Set(wounded.filter((unit) => left > 0 && (parts[unit.instanceId] ?? 0) < unit.damageMarked).map((unit) => unit.instanceId));

  const allocation = (): Allocation =>
    Object.entries(parts)
      .filter(([, amount]) => amount > 0)
      .map(([instanceId, amount]) => ({ instanceId, amount }));
  const send = () => {
    const answer = allocation();
    setParts({});
    submit(answer);
  };

  const mode: BoardAllocationMode = {
    eligible,
    amounts: new Map(Object.entries(parts)),
    onAdd: (instanceId) => {
      if (!eligible.has(instanceId)) return;
      setParts((current) => ({ ...current, [instanceId]: (current[instanceId] ?? 0) + 1 }));
    },
    onRemove: (instanceId) => {
      setParts((current) => {
        const now = current[instanceId] ?? 0;
        if (now <= 0) return current;
        return { ...current, [instanceId]: now - 1 };
      });
    },
  };

  const source = active.sourceInstanceId
    ? state.players.flatMap((p) => [...p.board, ...p.hand, ...p.graveyard]).find((c) => c.instanceId === active.sourceInstanceId)
    : undefined;
  const actions: ChoiceBannerAction[] = [];
  if (spent > 0) actions.push({ label: "Reprendre", onClick: () => setParts({}) });
  actions.push({ label: wounded.length === 0 ? "Continuer" : "Réparer", primary: true, onClick: send });

  const banner = {
    choiceKey: key,
    source: source ? getCardDefinition(source.cardId).name : "Réparations",
    title:
      wounded.length === 0
        ? "Aucune de tes unités n'est blessée."
        : left > 0
          ? `Touche tes unités blessées : ${left} Résistance à répartir.`
          : "Tout est réparti — valide, ou reprends un point (clic droit).",
    detail: "Un toucher verse un point, un clic droit le reprend. Tu peux en verser moins.",
    actions,
    onExpire: send,
  };

  return { mode, banner };
}
