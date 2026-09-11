"use client";

import { GameButton } from "@/components/game-ui/GameButton";
import { GameModal } from "@/components/game-ui/GameModal";

interface DeleteDeckDialogProps {
  deckName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation de suppression, sur `GameModal`. */
export function DeleteDeckDialog({ deckName, isDeleting, onConfirm, onCancel }: DeleteDeckDialogProps) {
  return (
    <GameModal onClose={onCancel} className="w-full max-w-sm">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Supprimer « {deckName} » ?</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Cette action est définitive et supprimera toutes les cartes de ce deck.</p>
      <div className="mt-5 flex justify-end gap-2">
        <GameButton variant="secondary" onClick={onCancel}>
          Annuler
        </GameButton>
        <GameButton variant="danger" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? "Suppression..." : "Supprimer"}
        </GameButton>
      </div>
    </GameModal>
  );
}
