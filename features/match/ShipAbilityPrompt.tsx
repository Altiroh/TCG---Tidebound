"use client";

import { useEffect } from "react";
import { PromptActions, PromptButton, PromptEffect, PromptEyebrow, PromptQuestion, PromptShell } from "@/features/match/PromptShell";

interface ShipAbilityPromptProps {
  /** Nom de la capacité (« Canon de proue »). */
  name: string;
  /** Nom du Navire qui la porte. */
  shipName: string;
  /** Texte imprimé de la capacité. */
  text: string;
  /** Coût en Raison, 0 si la capacité est gratuite. */
  reasonCost: number;
  /** Raison du joueur APRÈS paiement — négative = Déraison. */
  reasonAfter: number;
  /** La capacité ne fait qu'armer : le joueur tirera (ou non) plus tard. */
  arms: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation avant de dépenser la Raison d'une capacité de Navire.
 *
 * Elle existe parce que le coût part MAINTENANT, même pour une capacité en
 * deux temps : armer le Canon de proue coûte 2 Raison qu'aucun tir ne
 * remboursera si le joueur change d'avis. Un clic sur un petit panneau du
 * cadre ne doit pas pouvoir coûter ça par accident.
 *
 * Même verre et mêmes pastilles que les autres invites (`PromptShell`) :
 * trois questions de même nature doivent se ressembler.
 */
export function ShipAbilityPrompt({
  name,
  shipName,
  text,
  reasonCost,
  reasonAfter,
  arms,
  onConfirm,
  onCancel,
}: ShipAbilityPromptProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  return (
    <PromptShell ariaLabel={`Activer ${name}`} onClose={onCancel} closeLabel="Annuler" dim>
      <div className="flex flex-col items-center gap-3">
        <PromptEyebrow>{shipName}</PromptEyebrow>
        <PromptEffect>{text}</PromptEffect>
        <PromptQuestion>Voulez-vous {arms ? "armer" : "activer"} {name} ?</PromptQuestion>

        {reasonCost > 0 && (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/70">
            {reasonCost} Raison
          </span>
        )}
        {arms && (
          <PromptQuestion>
            La Raison part maintenant : un canon armé et non tiré ne se rembourse pas, et se referme en fin de tour.
          </PromptQuestion>
        )}
        {reasonAfter < 0 && (
          <PromptQuestion>Ta Raison passera à {reasonAfter} : tu entreras en Déraison.</PromptQuestion>
        )}

        <PromptActions>
          <PromptButton tone="accept" onClick={onConfirm}>
            {arms ? "Armer" : "Activer"}
          </PromptButton>
          <PromptButton onClick={onCancel}>Annuler</PromptButton>
        </PromptActions>
      </div>
    </PromptShell>
  );
}
