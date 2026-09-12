"use client";

import { useState } from "react";
import { deraisonAnchorDamage, previewPlayCardReason, type GameState, type PlayerState } from "@/game";

/**
 * Annonce la Déraison AVANT de valider une carte (Notion "Gameplay — Raison,
 * Déraison…" : "l'interface doit permettre au joueur de voir avant de
 * valider une carte combien de Raison négative et combien de dégâts futurs
 * cette action provoquera").
 *
 * - Glisser-déposer : l'avertissement s'affiche pendant tout le glisser, le
 *   dépôt vaut validation.
 * - Clic : le premier clic sur une carte qui ferait passer (ou rester) sous
 *   0 n'arme qu'une confirmation ; un second clic sur la même carte la joue.
 */
export function useDeraisonWarning(state: GameState, player: PlayerState | undefined, draggingId: string | null) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function warningFor(instanceId: string): string | null {
    if (!player) return null;
    const preview = previewPlayCardReason(state, player.id, instanceId);
    if (!preview || !preview.allowed || preview.cost <= 0 || preview.reasonAfter >= 0) return null;
    const damage = deraisonAnchorDamage(player, preview.reasonAfter);
    return (
      `Déraison : cette carte vous amène à ${preview.reasonAfter} Raison — ${damage} dégât(s) d'Ancrage à la fin de ` +
      `votre tour si vous n'êtes pas remonté à 0 d'ici là.`
    );
  }

  /** À appeler au clic sur une carte de la main : `true` = ce clic ne fait qu'armer la confirmation, ne pas jouer la carte. */
  function interceptClick(instanceId: string): boolean {
    if (warningFor(instanceId) && confirmId !== instanceId) {
      setConfirmId(instanceId);
      return true;
    }
    setConfirmId(null);
    return false;
  }

  const confirmWarning = confirmId ? warningFor(confirmId) : null;
  const warning = draggingId
    ? warningFor(draggingId)
    : confirmWarning
      ? `${confirmWarning} Cliquez à nouveau sur la carte pour la jouer.`
      : null;

  return { warning, interceptClick, dismiss: () => setConfirmId(null) };
}
