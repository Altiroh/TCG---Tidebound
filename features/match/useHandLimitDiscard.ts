"use client";

import { useEffect, useState } from "react";
import { getCardDefinition, type GameState, type PlayerId } from "@/game";
import type { ChoiceBannerAction } from "@/features/match/ChoiceBanner";

/** Ce que le plateau doit savoir pendant une défausse depuis la main. */
export interface HandLimitDiscardMode {
  /** Cartes à jeter en tout (au plus, pour un « jusqu'à N »). */
  count: number;
  /** Déjà glissées au Cimetière, pas encore envoyées au moteur (défausse de plusieurs cartes). */
  staged: ReadonlySet<string>;
  /** Une carte de la main vient d'être lâchée sur le Cimetière. */
  onDiscard: (instanceId: string) => void;
}

/** Le bandeau en haut de la table (`ChoiceBanner`) pendant la défausse. */
export interface HandDiscardBanner {
  choiceKey: string;
  source: string | null;
  title: string;
  detail: string;
  actions: ChoiceBannerAction[];
  onExpire: () => void;
}

type Answer = { discardInstanceIds: string[] } | "pass";

/**
 * DÉFAUSSE DEPUIS LA MAIN, côté plateau — limite de main en fin de tour
 * comme « défaussez N cartes » d'un effet : le joueur GLISSE lui-même les
 * cartes à jeter sur son Cimetière. Pas de fenêtre par-dessus le plateau,
 * c'est sa main qu'il regarde ; un bandeau en haut dit combien il en reste
 * et combien de temps.
 *
 * Plusieurs cartes : chacune lâchée est mise de côté (retirée de la main
 * affichée) et la réponse part au moteur avec la dernière. « Jusqu'à N » :
 * « Terminer » envoie ce qui est déjà glissé. « Vous pouvez » : « Ne rien
 * défausser ». À l'échéance (une minute), un texte facultatif ne
 * s'applique pas ; un texte qui impose la défausse complète au hasard.
 *
 * Remettre SOUS la pioche n'est pas une défausse : cette question-là garde
 * sa fenêtre (`HandDiscardPrompt`), le Cimetière n'y a rien à faire.
 */
export function useHandLimitDiscard(state: GameState, viewerId: PlayerId, submit: (answer: Answer) => void) {
  const choice = state.pendingChoice;
  const active =
    choice?.kind === "handDiscard" && choice.playerId === viewerId && choice.destination !== "deckBottom" ? choice : null;
  const [staged, setStaged] = useState<string[]>([]);

  // Une nouvelle question (ou plus de question du tout) repart de zéro.
  const stableKey = active ? `${active.turnNumber}:${active.count}:${active.sourceInstanceId ?? "main"}` : null;
  useEffect(() => setStaged([]), [stableKey]);

  if (!active || !stableKey) return { mode: null, banner: null as HandDiscardBanner | null };

  const hand = state.players.find((p) => p.id === viewerId)?.hand ?? [];
  const remaining = active.count - staged.length;
  const optional = active.atMost === true || active.refusable;

  const send = (answer: Answer) => {
    setStaged([]);
    submit(answer);
  };

  const mode: HandLimitDiscardMode = {
    count: active.count,
    staged: new Set(staged),
    onDiscard: (instanceId) => {
      if (staged.includes(instanceId)) return;
      const next = [...staged, instanceId];
      if (next.length >= active.count) send({ discardInstanceIds: next });
      else setStaged(next);
    },
  };

  const sourceCard = active.sourceInstanceId
    ? state.players.flatMap((p) => [...p.board, ...p.hand, ...p.graveyard]).find((c) => c.instanceId === active.sourceInstanceId)
    : undefined;
  const plural = remaining > 1 ? "s" : "";

  const actions: ChoiceBannerAction[] = [];
  if (staged.length > 0) actions.push({ label: "Reprendre", onClick: () => setStaged([]) });
  if (active.atMost && staged.length > 0) actions.push({ label: "Terminer", primary: true, onClick: () => send({ discardInstanceIds: staged }) });
  if (active.refusable && staged.length === 0) actions.push({ label: "Ne rien défausser", onClick: () => send("pass") });

  const banner: HandDiscardBanner = {
    choiceKey: stableKey,
    source: active.handLimit ? "Main pleine" : sourceCard ? getCardDefinition(sourceCard.cardId).name : null,
    title: active.handLimit
      ? `Glisse ${remaining} carte${plural} dans ton Cimetière pour finir ton tour.`
      : active.atMost
        ? `Glisse jusqu'à ${remaining} carte${plural} de ta main dans ton Cimetière.`
        : `Glisse ${remaining} carte${plural} de ta main dans ton Cimetière.`,
    detail: optional ? "Sans réponse, l'effet ne s'applique pas." : "Sans réponse, la défausse se fait au hasard.",
    actions,
    onExpire: () => {
      if (optional) {
        send(staged.length > 0 ? { discardInstanceIds: staged } : active.refusable ? "pass" : { discardInstanceIds: [] });
        return;
      }
      // Le texte impose la défausse : on complète au hasard.
      const pool = hand.filter((card) => !staged.includes(card.instanceId)).map((card) => card.instanceId);
      const picked = [...staged];
      while (picked.length < active.count && pool.length > 0) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
      send({ discardInstanceIds: picked });
    },
  };

  return { mode, banner };
}
