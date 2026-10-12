"use client";

import { getCardDefinition, previewBreakReason, type GameState, type PlayerId, type TideStateName } from "@/game";
import { FocusedCard, type FocusedCardAction } from "@/features/match/FocusedCard";
import type { BoardInteraction } from "@/features/match/useBoardInteraction";

/**
 * La carte posée à droite (`FocusedCard`) pour les DEUX plateaux, local et en
 * ligne : ce qu'elle dit et ses boutons, selon ce qu'on s'apprête à en faire
 * (`BoardInteraction.focus`). Les actions passent par `useBoardInteraction`,
 * qui sait déjà les soumettre à la façon de chaque écran.
 */
export function FocusedCardHost({
  board,
  liveState,
  actorId,
  tideState,
}: {
  board: BoardInteraction;
  liveState: GameState;
  actorId: PlayerId;
  tideState: TideStateName;
}) {
  const focus = board.focus;
  if (!focus) return null;
  const { request, stage } = focus;
  const def = getCardDefinition(request.card.cardId);
  const cancel: FocusedCardAction = { label: "Annuler", tone: "neutral", onClick: board.cancelFocus };

  if (request.kind === "arrival") {
    const { options } = request;
    const single = options.length === 1 ? options[0]! : null;
    const describe = (index: number) => def.abilities?.[index]?.description ?? def.text ?? "";
    const cost = (reason: number) => (reason > 0 ? ` (${reason} Raison)` : "");
    // « Choisissez : A ou B » dont chaque mode vise une unité : pas de bouton
    // de mode — le joueur touche la cible, et la cible dit le mode (une
    // alliée pour le bonus, une ennemie pour le malus).
    const byTarget = !single && options.every((option) => option.candidate.needsTarget);
    const actions: FocusedCardAction[] =
      stage === "choose"
        ? single
          ? [{ label: `Activer${cost(single.candidate.reasonCost)}`, tone: "accept" as const, onClick: () => board.activateFocusedArrival(single) }, cancel]
          : byTarget
            ? [{ label: "Activer", tone: "accept" as const, onClick: () => void board.startFocusedArrival() }, cancel]
            : [cancel]
        : stage === "targeting"
          ? [cancel]
          : [];
    // Dernier recours : un mode qui ne vise rien se choisit sur sa ligne.
    const modes =
      stage === "choose" && !single && !byTarget
        ? options.map((option) => ({
            label: `${describe(option.entry.abilityIndex)}${cost(option.candidate.reasonCost)}`,
            onClick: () => board.activateFocusedArrival(option),
          }))
        : undefined;
    // Le rappel de l'effet : la phrase d'arrivée de la carte, ou la description du seul mode.
    const reminder = single ? describe(single.entry.abilityIndex) : byTarget ? def.text : undefined;
    return (
      <FocusedCard
        card={request.card}
        tideState={tideState}
        eyebrow={byTarget ? "Effet d'arrivée — touche ta cible" : "Effet d'arrivée"}
        detail={stage === "choose" ? reminder : undefined}
        hint={
          stage === "targeting"
            ? byTarget
              ? "Touche une cible : la tienne pour l'aider, celle de l'adversaire pour lui nuire."
              : "Touche une cible sur le plateau."
            : undefined
        }
        actions={actions}
        options={modes}
        waiting={stage === "targeting"}
        leaving={focus.leaving}
        onDone={board.focusDone}
      />
    );
  }

  // BRIS : l'Objet lâché sur le Cimetière.
  const fromHand = request.source === "hand";
  const preview = previewBreakReason(liveState, actorId, request.card.instanceId, fromHand);
  const blocked = preview !== undefined && !preview.allowed;
  const reactionOnly = preview?.reactionOnly === true;
  const actions: FocusedCardAction[] =
    stage === "choose"
      ? [
          { label: preview && preview.cost > 0 ? `Briser (${preview.cost} Raison)` : "Briser", tone: "accept", disabled: blocked, onClick: board.breakFocused },
          // Saborder reste possible pour un Objet POSÉ : il part sans résoudre son effet.
          ...(fromHand ? [] : [{ label: "Saborder", tone: "danger" as const, onClick: board.scuttleFocused }]),
          cancel,
        ]
      : stage === "targeting"
        ? [cancel]
        : [];
  const detail =
    stage !== "choose"
      ? undefined
      : blocked
        ? reactionOnly
          ? "Cet Objet se Brise en réaction : quand la situation de son texte se présente, il te sera proposé."
          : "Pas assez de Raison pour briser cet Objet."
        : preview && preview.allowed && preview.reasonAfter < 0
          ? `Ta Raison passera à ${preview.reasonAfter} : tu entreras en Déraison.`
          : def.text;
  return (
    <FocusedCard
      card={request.card}
      tideState={tideState}
      eyebrow={fromHand ? "Briser depuis la main" : "Briser"}
      detail={detail}
      hint={stage === "targeting" ? "Touche une cible pour l'effet de bris." : undefined}
      actions={actions}
      waiting={stage === "targeting"}
      leaving={focus.leaving}
      onDone={board.focusDone}
    />
  );
}
