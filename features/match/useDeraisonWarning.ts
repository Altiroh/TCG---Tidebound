"use client";

import { useState } from "react";
import { deraisonAnchorDamage, previewPlayCardReason, type GameState, type PlayerState } from "@/game";

/**
 * Annonce la Déraison AVANT de valider une carte (Notion "Gameplay — Raison,
 * Déraison…" : "l'interface doit permettre au joueur de voir avant de
 * valider une carte combien de Raison négative et combien de dégâts futurs
 * cette action provoquera").
 *
 * - Glisser-déposer : le prix flotte au-dessus de la jauge de Raison pendant
 *   tout le glisser (`ReasonCostPreview`), le dépôt vaut validation.
 * - Clic : le premier clic sur une carte qui ferait passer (ou rester) sous
 *   0 n'arme qu'une confirmation ; un second clic sur la même carte la joue.
 *   L'alerte s'efface seule (`hide`) sans désarmer la confirmation : elle
 *   ne se perd que si le joueur l'écarte (`dismiss`) ou joue autre chose.
 * - Doigt : le bouton « Jouer » de la carte agrandie écrit la dette dans
 *   son libellé ; il vaut confirmation et ne passe pas par ici.
 */
export function useDeraisonWarning(state: GameState, player: PlayerState | undefined, draggingId: string | null) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

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
      setHidden(false);
      return true;
    }
    setConfirmId(null);
    return false;
  }

  const confirmWarning = confirmId ? warningFor(confirmId) : null;
  // Pendant un glisser, plus de bandeau : le prix flotte au-dessus de la
  // jauge de Raison, en rouge avec l'Ancrage en jeu s'il fait entrer en
  // Déraison (`ReasonCostPreview`, `TableBoard`). Le bandeau reste pour le
  // clic, qui n'a pas d'autre moment pour le dire.
  const warning = draggingId || hidden ? null : confirmWarning ? `${confirmWarning} Jouez-la une seconde fois pour confirmer.` : null;

  return { warning, interceptClick, dismiss: () => setConfirmId(null), hide: () => setHidden(true) };
}
