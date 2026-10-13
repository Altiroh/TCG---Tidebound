"use client";

import { useEffect, useRef, useState } from "react";
import { getCardDefinition, getShipDefinition, UNIT_CARD_TYPES, type GameState, type PlayerId } from "@/game";
import type { ChoiceBannerAction } from "@/features/match/ChoiceBanner";

/** Ce que le plateau doit savoir pendant une répartition de soins. */
export interface BoardAllocationMode {
  /** Unités qui peuvent recevoir un point (blessées, et pas déjà comblées). */
  eligible: ReadonlySet<string>;
  /** Points déjà versés, par unité. */
  amounts: ReadonlyMap<string, number>;
  onAdd: (instanceId: string) => void;
  onRemove: (instanceId: string) => void;
  /**
   * Le Navire du joueur, quand il peut recevoir sa part (« … entre vos
   * unités et votre Navire ») : il s'éclaire comme une unité, un toucher y
   * verse un point. Absent : il n'entre pas dans la répartition.
   */
  ship?: { eligible: boolean; amount: number; onAdd: () => void; onRemove: () => void };
}

type Allocation = Array<{ instanceId: string; amount: number }>;

/** Part versée au Navire (`HealAllocationChoice.includeShip`) — l'identifiant que le moteur attend. */
const SHIP = "ship";
/** Après le dernier point versé, le temps de le voir se poser avant que la réparation ne parte. */
const AUTO_SEND_MS = 450;

/**
 * « Restaurez jusqu'à N Résistance répartie entre les unités que vous
 * contrôlez » (Trousse du Bord, Chirurgien du Bord) — SUR LE PLATEAU :
 * toucher une unité blessée (ou le Navire, quand le texte l'inclut) y verse
 * un point, clic droit le reprend. Le bandeau en haut dit ce qu'il reste à
 * répartir.
 *
 * VALIDATION D'ELLE-MÊME (13/10/2026) : dès que tout est réparti — ou que
 * plus rien ne peut recevoir de point —, la répartition part, sans bouton.
 * Répartir MOINS reste permis : « Terminer » apparaît alors dans le bandeau.
 * Sans réponse au bout d'une minute, la répartition en cours s'applique
 * telle quelle.
 */
export function useHealAllocation(state: GameState, viewerId: PlayerId, submit: (allocation: Allocation) => void) {
  const choice = state.pendingChoice;
  const active = choice?.kind === "healAllocation" && choice.playerId === viewerId ? choice : null;
  const [parts, setParts] = useState<Record<string, number>>({});
  const key = active ? `${active.turnNumber}:${active.sourceInstanceId ?? ""}:${active.budget}` : null;
  useEffect(() => setParts({}), [key]);

  // Tout est réparti (ou plus rien ne peut recevoir) : la répartition part d'elle-même, le temps de voir le dernier point.
  const complete = useRef<(() => void) | null>(null);
  const done = useRef<string | null>(null);
  const spentNow = Object.values(parts).reduce((sum, n) => sum + n, 0);
  useEffect(() => {
    if (!key || !complete.current || done.current === key) return undefined;
    const send = complete.current;
    const timer = window.setTimeout(() => {
      done.current = key;
      send();
    }, AUTO_SEND_MS);
    return () => window.clearTimeout(timer);
  }, [key, spentNow]);

  if (!active || !key) {
    complete.current = null;
    return { mode: null as BoardAllocationMode | null, banner: null };
  }

  const viewer = state.players.find((p) => p.id === viewerId);
  const board = viewer?.board ?? [];
  // « … entre vos unités et votre Navire » (Frère Michel) : le Navire s'éclaire et reçoit sa part au toucher.
  // L'Ancrage n'a plus de plafond (12/10/2026) : le Navire peut recevoir tout le budget.
  const shipRoom = active.includeShip && viewer ? active.budget : 0;
  const shipPart = parts[SHIP] ?? 0;
  const spent = Object.values(parts).reduce((sum, n) => sum + n, 0);
  const left = active.budget - spent;
  // Les UNITÉS blessées seulement : une Structure n'entre pas dans la répartition.
  const wounded = board.filter((unit) => unit.damageMarked > 0 && UNIT_CARD_TYPES.includes(getCardDefinition(unit.cardId).type));
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
    ...(shipRoom > 0
      ? {
          ship: {
            eligible: left > 0 && shipPart < shipRoom,
            amount: shipPart,
            onAdd: () => {
              if (left <= 0 || shipPart >= shipRoom) return;
              setParts((current) => ({ ...current, [SHIP]: (current[SHIP] ?? 0) + 1 }));
            },
            onRemove: () =>
              setParts((current) => ((current[SHIP] ?? 0) > 0 ? { ...current, [SHIP]: (current[SHIP] ?? 0) - 1 } : current)),
          },
        }
      : {}),
  };

  // Plus rien à verser : tout le budget est parti, ou aucune cible ne peut plus recevoir.
  const nothingLeft = left <= 0 || (eligible.size === 0 && !(shipRoom > 0 && shipPart < shipRoom));
  complete.current = nothingLeft ? send : null;

  const source = active.sourceInstanceId
    ? state.players.flatMap((p) => [...p.board, ...p.hand, ...p.graveyard]).find((c) => c.instanceId === active.sourceInstanceId)
    : undefined;
  const actions: ChoiceBannerAction[] = [];
  if (spent > 0) actions.push({ label: "Reprendre", onClick: () => setParts({}) });
  const rienAReparer = wounded.length === 0 && shipRoom === 0;
  // Verser MOINS que le budget, si on le veut : le seul bouton qui reste, et seulement quand il sert.
  if (!nothingLeft && spent > 0) actions.push({ label: "Terminer", primary: true, onClick: send });
  if (!nothingLeft && spent === 0) actions.push({ label: "Passer", onClick: send });

  const banner = {
    choiceKey: key,
    source: source ? getCardDefinition(source.cardId).name : "Réparations",
    title:
      rienAReparer
        ? "Aucune de tes unités n'est blessée."
        : left > 0
          ? `Touche ${shipRoom > 0 ? "tes unités blessées ou ton Navire" : "tes unités blessées"} : ${left} Résistance à répartir.`
          : "Tout est réparti.",
    detail: "Un toucher verse un point, un clic droit le reprend. La réparation part dès que tout est réparti.",
    actions,
    onExpire: send,
  };

  return { mode, banner };
}
