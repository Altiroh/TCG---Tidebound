"use client";

import { useEffect, useState } from "react";
import {
  getCardDefinition,
  graveyardChoicesForBreak,
  type CardInstance,
  type GameState,
  type PendingReactionCandidate,
  type PlayerAction,
  type PlayerId,
  type PlayerState,
} from "@/game";
import { needsPlayTarget } from "@/features/match/needsPlayTarget";

/**
 * Interactions du plateau, partagées par la partie LOCALE (`MatchBoard`) et
 * la partie ARBITRÉE (`OnlineBoard`).
 *
 * Les deux écrans posaient la même machine à états deux fois, sous des noms
 * différents (`pending` d'un côté, `selection` de l'autre) : sélection de
 * cible, file de réactions, invite de bris, choix en défausse, visionneuse
 * de cimetière, fiche de carte, menu de pause, et les quatre gestes qui les
 * enchaînent. Toute correction était à faire deux fois — et une fois sur
 * deux, elle ne l'était pas.
 *
 * Ce qui reste PROPRE à chaque écran, et qui n'avait donc rien à faire ici :
 * la façon de soumettre une action (`dispatch` immédiat contre aller-retour
 * serveur), et l'activation multiple de réactions, qui se plie en une fois
 * en local et s'attend coup par coup en ligne.
 */

/** Ce que le joueur a commencé et doit terminer en désignant une cible. */
export type BoardSelection =
  | { kind: "playCard"; instanceId: string; needsTarget: boolean }
  | { kind: "attack"; attackerId: string }
  | { kind: "break"; instanceId: string; needsTarget: boolean; fromHand?: boolean }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; needsTarget: boolean };

export interface BoardInteractionConfig {
  /**
   * État VIVANT — celui du moteur, sur lequel se calculent coûts et choix.
   * Jamais l'état AFFICHÉ, qui retarde volontairement pendant l'animation
   * d'une attaque : un choix de défausse lu dessus porterait sur un plateau
   * qui n'existe déjà plus.
   */
  liveState: GameState;
  /** Joueur qui regarde : sa main et son plateau. */
  viewer: PlayerState;
  /** Au nom de qui les actions normales sont émises. */
  actorId: PlayerId;
  /** Peut poser / briser / saborder maintenant. */
  canPlayCards: boolean;
  /** Peut agir tout court (hors fenêtre de réaction en attente). */
  canAct: boolean;
  /** Soumet une action normale. */
  act: (action: PlayerAction) => void;
  /**
   * Premier clic sur une carte qui ferait plonger en Déraison : `true` si
   * l'avertissement l'a intercepté, et que le geste ne doit pas aboutir.
   */
  interceptDeraison: (instanceId: string) => boolean;
  /**
   * Appelé quand un geste commence, avant qu'il n'aboutisse ou n'entre en
   * désignation de cible. La partie locale y efface l'erreur du moteur : y
   * renoncer laisserait un refus affiché pendant qu'on choisit sa cible.
   */
  onGestureStart?: () => void;
}

export interface BoardInteraction {
  selection: BoardSelection | null;
  setSelection: (selection: BoardSelection | null) => void;
  clearSelection: () => void;

  /** Invite « Briser ou Saborder ? » d'un Objet lâché sur le crâne. */
  breakPrompt: { card: CardInstance; source: "hand" | "board" } | null;
  setBreakPrompt: (prompt: { card: CardInstance; source: "hand" | "board" } | null) => void;
  /** Bris qui demande de choisir une carte de sa défausse. */
  graveyardPick: { card: CardInstance; fromHand: boolean } | null;
  setGraveyardPick: (pick: { card: CardInstance; fromHand: boolean } | null) => void;
  graveyardViewerPlayerId: PlayerId | null;
  setGraveyardViewerPlayerId: (playerId: PlayerId | null) => void;
  detailInstance: CardInstance | null;
  setDetailInstance: (instance: CardInstance | null) => void;
  showPauseMenu: boolean;
  setShowPauseMenu: (open: boolean) => void;
  /** Carte de main en cours de glisser — alimente l'avertissement de Déraison. */
  draggingId: string | null;
  setDraggingId: (instanceId: string | null) => void;

  /** Réactions ciblées encore à résoudre, après celle en cours. */
  reactionQueue: PendingReactionCandidate[];
  /**
   * Entre en désignation de cible pour la première réaction de la file, et
   * garde le reste pour après. Rend `false` si la file est vide — l'appelant
   * referme alors la sélection.
   */
  beginReactionTargeting: (queued: PendingReactionCandidate[]) => boolean;

  handleHandCardClick: (instanceId: string, confirmed?: boolean) => void;
  /** Cible désignée sur le plateau. Rend l'action de réaction à soumettre, ou `null` si le geste est déjà traité. */
  resolveBoardCardClick: (instanceId: string, ownerId: PlayerId) => PlayerAction | null;
  requestBreak: (card: CardInstance, fromHand: boolean) => void;
  handleDropOnGraveyard: (instanceId: string, from: "hand" | "board") => void;
}

export function useBoardInteraction({
  liveState,
  viewer,
  actorId,
  canPlayCards,
  canAct,
  act,
  interceptDeraison,
  onGestureStart,
}: BoardInteractionConfig): BoardInteraction {
  const [selection, setSelection] = useState<BoardSelection | null>(null);
  const [reactionQueue, setReactionQueue] = useState<PendingReactionCandidate[]>([]);
  const [breakPrompt, setBreakPrompt] = useState<{ card: CardInstance; source: "hand" | "board" } | null>(null);
  const [graveyardPick, setGraveyardPick] = useState<{ card: CardInstance; fromHand: boolean } | null>(null);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);
  const [detailInstance, setDetailInstance] = useState<CardInstance | null>(null);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Échap : bascule le menu de pause, sauf si une fenêtre est déjà ouverte —
  // Échap y vaut « annuler », jamais « quitter la partie ».
  useEffect(() => {
    const overlayOpen = Boolean(detailInstance || graveyardViewerPlayerId || breakPrompt || graveyardPick);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (overlayOpen) return;
      setShowPauseMenu((current) => !current);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailInstance, graveyardViewerPlayerId, breakPrompt, graveyardPick]);

  function clearSelection() {
    setSelection(null);
    setReactionQueue([]);
  }

  function beginReactionTargeting(queued: PendingReactionCandidate[]): boolean {
    const [first, ...rest] = queued;
    if (!first) {
      clearSelection();
      return false;
    }
    setSelection({ kind: "reaction", sourceInstanceId: first.sourceInstanceId, abilityIndex: first.abilityIndex, needsTarget: true });
    setReactionQueue(rest);
    return true;
  }

  /** Clic sur une carte de main : la joue, ou entre en désignation de cible. Le glisser-déposer passe `confirmed`. */
  function handleHandCardClick(instanceId: string, confirmed = false) {
    if (!canPlayCards) return;
    const card = viewer.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (!confirmed && interceptDeraison(instanceId)) return;
    onGestureStart?.();
    // Recliquer la carte déjà choisie annule — le geste est son propre retour.
    if (selection?.kind === "playCard" && selection.instanceId === instanceId) {
      clearSelection();
      return;
    }
    if (needsPlayTarget(getCardDefinition(card.cardId), viewer.board)) {
      setSelection({ kind: "playCard", instanceId, needsTarget: true });
    } else {
      act({ type: "playCard", playerId: actorId, instanceId });
    }
  }

  /**
   * Cible désignée sur le plateau.
   *
   * Les réactions remontent à l'appelant au lieu d'être soumises ici : elles
   * peuvent survenir HORS de son tour, et les deux écrans ne les soumettent
   * pas de la même façon. Tout le reste est traité sur place.
   */
  function resolveBoardCardClick(instanceId: string, ownerId: PlayerId): PlayerAction | null {
    if (selection?.kind === "reaction" && selection.needsTarget) {
      return {
        type: "activateReaction",
        playerId: viewer.id,
        sourceInstanceId: selection.sourceInstanceId,
        abilityIndex: selection.abilityIndex,
        targetInstanceId: instanceId,
      };
    }
    if (!canAct) return null;
    if (selection?.kind === "playCard" && selection.needsTarget) {
      act({ type: "playCard", playerId: actorId, instanceId: selection.instanceId, targetInstanceId: instanceId });
      return null;
    }
    if (selection?.kind === "break" && selection.needsTarget) {
      act({ type: "breakObject", playerId: actorId, instanceId: selection.instanceId, targetInstanceId: instanceId, fromHand: selection.fromHand });
      return null;
    }
    if (selection?.kind === "attack" && ownerId !== viewer.id) {
      act({ type: "attack", playerId: actorId, attackerInstanceId: selection.attackerId, defenderInstanceId: instanceId });
    }
    return null;
  }

  /** Brise un Objet, posé ou depuis la main : cible ou carte de défausse d'abord si l'effet en demande une. */
  function requestBreak(card: CardInstance, fromHand: boolean) {
    if (!canAct) return;
    setBreakPrompt(null);
    const def = getCardDefinition(card.cardId);
    if ((def.onBreakEffects ?? []).some((effect) => effect.target.kind === "chosenUnit")) {
      setSelection({ kind: "break", instanceId: card.instanceId, needsTarget: true, fromHand });
      return;
    }
    // Sur l'état VIVANT : la défausse affichée peut retarder d'une animation.
    if (graveyardChoicesForBreak(liveState, actorId, def).length > 0) {
      setGraveyardPick({ card, fromHand });
      return;
    }
    act({ type: "breakObject", playerId: actorId, instanceId: card.instanceId, fromHand });
  }

  /** Carte lâchée sur le crâne : un Objet propose Briser / Saborder, tout autre permanent est Sabordé. */
  function handleDropOnGraveyard(instanceId: string, from: "hand" | "board") {
    const zone = from === "hand" ? viewer.hand : viewer.board;
    const card = zone.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (getCardDefinition(card.cardId).type === "objet") {
      setBreakPrompt({ card, source: from });
      return;
    }
    if (from === "board") act({ type: "saborder", playerId: actorId, instanceId });
  }

  return {
    selection,
    setSelection,
    clearSelection,
    breakPrompt,
    setBreakPrompt,
    graveyardPick,
    setGraveyardPick,
    graveyardViewerPlayerId,
    setGraveyardViewerPlayerId,
    detailInstance,
    setDetailInstance,
    showPauseMenu,
    setShowPauseMenu,
    draggingId,
    setDraggingId,
    reactionQueue,
    beginReactionTargeting,
    handleHandCardClick,
    resolveBoardCardClick,
    requestBreak,
    handleDropOnGraveyard,
  };
}
