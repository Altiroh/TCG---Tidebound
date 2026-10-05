"use client";

import { useEffect, useState } from "react";
import { getCardDefinition, UNIT_CARD_TYPES, type GameState, type PlayerId } from "@/game";
import type { ChoiceBannerAction } from "@/features/match/ChoiceBanner";
import { effectsPolarity, type TargetPolarity } from "@/features/match/table/targetPolarity";
import type { HeldTarget } from "@/features/match/useHeldTarget";

/** Ce que le plateau doit savoir pendant une désignation de plusieurs unités. */
export interface BoardPickMode {
  /** Unités qu'on peut désigner (des deux côtés pour « Choisissez jusqu'à N unités »). */
  eligible: ReadonlySet<string>;
  /** Unités déjà désignées : elles gardent leur marque de cible jusqu'à la validation. */
  picked: ReadonlySet<string>;
  /** Rouge si l'effet nuit aux unités désignées, bleu s'il les aide (ou les épargne). */
  polarity: TargetPolarity;
  onToggle: (instanceId: string) => void;
}

type Answer = { pickInstanceIds: string[] } | { keepInstanceIds: string[] };

/**
 * DÉSIGNER PLUSIEURS UNITÉS, SUR LE PLATEAU (05/10/2026) — « Choisissez
 * jusqu'à N unités » (`pickUnits`) et « choisissez jusqu'à N unités que
 * vous contrôlez, détruisez les autres » (`keepUnits`). Plus de fenêtre
 * par-dessus la table : les cibles légales s'éclairent, un toucher en
 * désigne une — elle garde sa marque de cible, comme une attaque glissée —,
 * un second toucher la reprend. Le bandeau en haut dit combien il en reste ;
 * « Valider » envoie (en désigner moins est permis). Sans réponse au bout
 * d'une minute, la sélection en cours part telle quelle.
 */
export function useBoardPick(state: GameState, viewerId: PlayerId, submit: (answer: Answer) => void) {
  const choice = state.pendingChoice;
  const active = !state.pendingReaction && (choice?.kind === "pickUnits" || choice?.kind === "keepUnits") && choice.playerId === viewerId ? choice : null;
  const [picked, setPicked] = useState<string[]>([]);
  const key = active ? `${active.kind}:${active.turnNumber}:${active.sourceInstanceId ?? ""}:${active.kind === "pickUnits" ? active.among.join(",") : active.kept.join(",")}` : null;
  useEffect(() => setPicked([]), [key]);

  if (!active || !key) return { mode: null as BoardPickMode | null, banner: null, locked: [] as HeldTarget[] };

  const keeping = active.kind === "keepUnits";
  const max = keeping ? active.keep : active.pick;
  const eligible = keeping
    ? (state.players.find((p) => p.id === viewerId)?.board ?? [])
        .filter((unit) => UNIT_CARD_TYPES.includes(getCardDefinition(unit.cardId).type))
        .map((unit) => unit.instanceId)
    : active.among;
  // Garder une unité, c'est l'épargner : bleu. Sinon, le sens des effets appliqués.
  const polarity: TargetPolarity = keeping ? "friendly" : effectsPolarity(active.effects);

  const send = (ids: string[]) => {
    setPicked([]);
    submit(keeping ? { keepInstanceIds: ids } : { pickInstanceIds: ids });
  };

  const mode: BoardPickMode = {
    eligible: new Set(eligible),
    picked: new Set(picked),
    polarity,
    onToggle: (instanceId) => {
      if (!eligible.includes(instanceId)) return;
      setPicked((current) => {
        if (current.includes(instanceId)) return current.filter((id) => id !== instanceId);
        const next = [...current, instanceId];
        // Une de trop chasse la plus ancienne : désigner reste un geste simple.
        return next.length > max ? next.slice(next.length - max) : next;
      });
    },
  };

  const source = active.sourceInstanceId
    ? state.players.flatMap((p) => [...p.board, ...p.hand, ...p.graveyard]).find((c) => c.instanceId === active.sourceInstanceId)
    : undefined;
  const left = max - picked.length;
  const plural = (n: number) => (n > 1 ? "s" : "");

  const actions: ChoiceBannerAction[] = [];
  if (picked.length > 0) actions.push({ label: "Reprendre", onClick: () => setPicked([]) });
  actions.push({ label: keeping ? "Garder" : "Valider", primary: true, onClick: () => send(picked) });

  const banner = {
    choiceKey: key,
    source: source ? getCardDefinition(source.cardId).name : null,
    title:
      eligible.length === 0
        ? "Aucune unité à désigner."
        : keeping
          ? left > 0
            ? `Touche jusqu'à ${left} unité${plural(left)} à GARDER — les autres seront détruites.`
            : "Sélection complète — valide, ou touche une unité pour la reprendre."
          : left > 0
            ? `Touche jusqu'à ${left} unité${plural(left)} sur le plateau.`
            : "Sélection complète — valide, ou touche une unité pour la reprendre.",
    detail: keeping ? "Tu peux en garder moins." : "Un toucher désigne, un second reprend. Tu peux en désigner moins.",
    actions,
    onExpire: () => send(picked),
  };

  // La cible déjà désignée par l'action qui pose la question (Transfert de
  // Pierre : la Sentinelle) reste marquée pendant qu'on choisit la suite.
  // Bleue si c'est une unité à soi, rouge sinon.
  const lockedId = !keeping ? active.chosenTargetInstanceId : undefined;
  const lockedMine = lockedId ? (state.players.find((p) => p.id === viewerId)?.board.some((u) => u.instanceId === lockedId) ?? false) : false;
  const locked: HeldTarget[] = lockedId ? [{ instanceId: lockedId, tone: lockedMine ? "friendly" : "hostile" }] : [];

  return { mode, banner, locked };
}
