"use client";

import { useEffect, useState } from "react";
import { getCardDefinition, salvePower, salveTargets, type GameState, type PlayerAction, type PlayerId } from "@/game";
import type { ChoiceBannerAction } from "@/features/match/ChoiceBanner";
import type { BoardAllocationMode } from "@/features/match/useHealAllocation";

type AttackAction = Extract<PlayerAction, { type: "attack" }>;

/**
 * SALVE SUR LE PLATEAU — une unité avec Salve attaque une unité alors
 * qu'il y a d'autres cibles possibles : l'attaque n'est pas envoyée tout de
 * suite. Toute sa Puissance est d'abord sur la cible déclarée (pastille sur
 * la carte) ; toucher une autre unité adverse y fait passer 1 point, clic
 * droit le reprend. La cible déclarée garde toujours au moins 1. « Frapper »
 * envoie l'attaque avec sa répartition (`AttackAction.salve`), que le
 * moteur vérifie (`game/rules/salve.ts`) ; « Tout sur la cible » l'envoie
 * sans répartir. Sans réponse au bout d'une minute, elle part telle quelle.
 */
export function useSalveAllocation(state: GameState, viewerId: PlayerId, send: (action: AttackAction) => void) {
  const [pending, setPending] = useState<{ action: AttackAction; parts: Record<string, number> } | null>(null);

  // Le combat est fini, ou ce n'est plus son tour : la répartition en cours n'a plus d'objet.
  const stillCombat = state.phase === "combatPhase" && state.activePlayerId === viewerId && !state.pendingReaction && !state.pendingChoice;
  useEffect(() => {
    if (!stillCombat) setPending(null);
  }, [stillCombat]);

  /** `true` si l'attaque attend sa répartition : l'appelant ne l'envoie pas. */
  function intercept(action: PlayerAction): boolean {
    if (action.type !== "attack" || action.salve || !action.defenderInstanceId) return false;
    if (salvePower(state, action.playerId, action.attackerInstanceId) < 2) return false;
    if (salveTargets(state, action.playerId, action.attackerInstanceId, action.defenderInstanceId).length === 0) return false;
    setPending({ action, parts: {} });
    return true;
  }

  if (!pending || !pending.action.defenderInstanceId) return { intercept, mode: null as BoardAllocationMode | null, banner: null };

  const { action, parts } = pending;
  const main = action.defenderInstanceId!;
  const power = salvePower(state, action.playerId, action.attackerInstanceId);
  const spent = Object.values(parts).reduce((sum, n) => sum + n, 0);
  const onMain = Math.max(0, power - spent);
  const legal = salveTargets(state, action.playerId, action.attackerInstanceId, main);
  const eligible = new Set(onMain > 1 ? legal : []);

  const strike = (withSalve: boolean) => {
    const salve = withSalve
      ? Object.entries(parts)
          .filter(([, amount]) => amount > 0)
          .map(([targetInstanceId, amount]) => ({ targetInstanceId, amount }))
      : [];
    setPending(null);
    // Toujours un tableau, même vide : une attaque déjà répartie (ou envoyée telle quelle) ne repasse pas par ici.
    send({ ...action, salve });
  };

  const mode: BoardAllocationMode = {
    eligible,
    amounts: new Map([[main, onMain], ...Object.entries(parts).filter(([, n]) => n > 0)]),
    onAdd: (instanceId) => {
      if (!eligible.has(instanceId)) return;
      setPending((current) => (current ? { ...current, parts: { ...current.parts, [instanceId]: (current.parts[instanceId] ?? 0) + 1 } } : current));
    },
    onRemove: (instanceId) => {
      setPending((current) => {
        const now = current?.parts[instanceId] ?? 0;
        if (!current || now <= 0) return current;
        return { ...current, parts: { ...current.parts, [instanceId]: now - 1 } };
      });
    },
  };

  const attacker = state.players.flatMap((p) => p.board).find((u) => u.instanceId === action.attackerInstanceId);
  const actions: ChoiceBannerAction[] = [{ label: "Annuler", onClick: () => setPending(null) }];
  if (spent > 0) actions.push({ label: "Reprendre", onClick: () => setPending((current) => (current ? { ...current, parts: {} } : current)) });
  else actions.push({ label: "Tout sur la cible", onClick: () => strike(false) });
  actions.push({ label: "Frapper", primary: true, onClick: () => strike(true) });

  const banner = {
    choiceKey: `salve:${action.attackerInstanceId}:${main}`,
    source: attacker ? `${getCardDefinition(attacker.cardId).name} — Salve` : "Salve",
    title:
      onMain > 1
        ? `Répartis sa Puissance (${power}) : touche d'autres unités adverses pour y envoyer 1 point.`
        : "La cible déclarée garde 1 point : tout le reste est réparti.",
    detail: "Un toucher envoie un point, un clic droit le reprend. Chaque cible touchée riposte, et la Garde vaut pour chacune.",
    actions,
    onExpire: () => strike(true),
  };

  return { intercept, mode, banner };
}
