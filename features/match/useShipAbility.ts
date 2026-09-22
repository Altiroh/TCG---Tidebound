"use client";

import { useState } from "react";
import { getPlayer, getShipDefinition, shipAbilityView, type GameState, type PlayerAction, type PlayerId } from "@/game";
import { shipAbilityArtUrl } from "@/features/ships/shipFrame";
import type { ShipAbilityPanelView } from "@/features/match/table/TableShip";
import type { BoardSelection } from "@/features/match/useBoardInteraction";

/**
 * Capacité activable de Navire, côté interface — le petit panneau posé sur
 * le cadre, sa confirmation, et l'entrée en ciblage du tir.
 *
 * Partagé par la partie LOCALE (`MatchBoard`) et la partie ARBITRÉE
 * (`OnlineBoard`) : le geste est le même des deux côtés, seule la façon de
 * soumettre l'action change, et elle arrive par `act`.
 *
 * Le moteur reste seul juge : `shipAbilityView` décide de ce qui est
 * possible, ce hook ne fait que l'habiller. Un panneau qui s'allume ici est
 * un geste que `dispatch` acceptera, et réciproquement.
 */

/** Ce que la confirmation doit afficher avant de dépenser la Raison. */
export interface ShipAbilityPromptData {
  name: string;
  shipName: string;
  text: string;
  reasonCost: number;
  reasonAfter: number;
  /** La capacité ne fait qu'armer : le tir viendra plus tard, ou pas. */
  arms: boolean;
}

export interface ShipAbilityUi {
  /** Panneau du Navire du joueur — cliquable quand un geste est possible. */
  panel?: ShipAbilityPanelView;
  /** Panneau du Navire adverse, en lecture seule. */
  opponentPanel?: ShipAbilityPanelView;
  /** Confirmation ouverte, ou `null`. */
  prompt: ShipAbilityPromptData | null;
  /** Confirme l'activation : paie et arme (ou résout). */
  confirm: () => void;
  /** Referme la confirmation sans rien dépenser. */
  cancel: () => void;
  /**
   * Entrée à donner à `ReactionPrompt` quand la capacité du Navire
   * s'active DANS la fenêtre de réaction en cours (`activationWindow` —
   * Changer de cap, Virage court). Absente le reste du temps.
   *
   * Sans elle, une fenêtre ouverte pour le seul Navire n'aurait aucun
   * candidat de carte à afficher : rien à l'écran pour accepter, et surtout
   * rien pour refuser.
   */
  windowEntry?: { name: string; text: string; onActivate: () => void };
}

export interface UseShipAbilityConfig {
  /** État VIVANT du moteur — jamais l'état affiché, qui retarde pendant une animation. */
  liveState: GameState;
  /** Joueur qui regarde. */
  viewerId: PlayerId;
  /** Au nom de qui les actions sont émises (hot-seat : le joueur ACTIF). */
  actorId: PlayerId;
  act: (action: PlayerAction) => void;
  /** Sélection en cours du plateau — le tir en est une. */
  selection: BoardSelection | null;
  setSelection: (selection: BoardSelection | null) => void;
}

export function useShipAbility({
  liveState,
  viewerId,
  actorId,
  act,
  selection,
  setSelection,
}: UseShipAbilityConfig): ShipAbilityUi {
  const [confirming, setConfirming] = useState(false);

  const viewer = getPlayer(liveState, viewerId);
  const opponent = liveState.players.find((p) => p.id !== viewerId);
  const mine = shipAbilityView(liveState, viewerId);
  const theirs = opponent ? shipAbilityView(liveState, opponent.id) : undefined;

  const aiming = selection?.kind === "shipShot";

  function handleClick() {
    if (!mine) return;
    // Déjà en train de viser : recliquer le canon annule le tir. Le geste
    // est son propre retour, comme pour une attaque.
    if (aiming) {
      setSelection(null);
      return;
    }
    if (mine.canFire) {
      setSelection({ kind: "shipShot" });
      return;
    }
    if (mine.canActivate) setConfirming(true);
  }

  const panel: ShipAbilityPanelView | undefined = mine && {
    name: mine.ability.name,
    text: mine.ability.text,
    // Les planches ne servent qu'à dire « armé / pas armé » : une capacité
    // qui se joue d'un seul geste n'a rien à cacher.
    planks: Boolean(mine.ability.armedShot),
    armed: mine.armed,
    artUrl: mine.ability.illustration ? shipAbilityArtUrl(mine.ability.illustration) : undefined,
    actionable: mine.canActivate || mine.canFire || aiming,
    blockedBy: mine.canFire ? mine.activationBlockedBy : (mine.fireBlockedBy ?? mine.activationBlockedBy),
    onClick: handleClick,
  };

  const opponentPanel: ShipAbilityPanelView | undefined = theirs && {
    name: theirs.ability.name,
    text: theirs.ability.text,
    planks: Boolean(theirs.ability.armedShot),
    armed: theirs.armed,
    artUrl: theirs.ability.illustration ? shipAbilityArtUrl(theirs.ability.illustration) : undefined,
    // Jamais de halo sur le Navire d'en face : ce panneau informe, il n'invite à rien.
    actionable: false,
  };

  const prompt: ShipAbilityPromptData | null =
    confirming && mine
      ? {
          name: mine.ability.name,
          shipName: getShipDefinition(viewer.shipId).name,
          text: mine.ability.text,
          reasonCost: mine.ability.cost.reason ?? 0,
          reasonAfter: viewer.reason - (mine.ability.cost.reason ?? 0),
          arms: Boolean(mine.ability.armedShot),
        }
      : null;

  // La fenêtre attend le SPECTATEUR, pas forcément le joueur actif — en
  // hot-seat comme en ligne, c'est lui qui répond, et c'est son nom que
  // porte l'action.
  const windowEntry =
    mine?.ability.activationWindow && mine.canActivate
      ? {
          name: mine.ability.name,
          text: mine.ability.text,
          onActivate: () => act({ type: "activateShipAbility", playerId: viewerId }),
        }
      : undefined;

  return {
    panel,
    opponentPanel,
    prompt,
    windowEntry,
    confirm: () => {
      setConfirming(false);
      act({ type: "activateShipAbility", playerId: actorId });
    },
    cancel: () => setConfirming(false),
  };
}
