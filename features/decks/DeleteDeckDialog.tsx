"use client";

import { Dialog } from "@/features/shell/Dialog";
import game from "@/features/shell/GameScreen.module.css";

interface DeleteDeckDialogProps {
  deckName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation de suppression d'un deck — dialogue commun, action destructrice en dernier. */
export function DeleteDeckDialog({ deckName, isDeleting, onConfirm, onCancel }: DeleteDeckDialogProps) {
  return (
    <Dialog
      title={`Supprimer « ${deckName} » ?`}
      tone="danger"
      description="Cette action est définitive et supprimera toutes les cartes de ce deck."
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className={game.danger} onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
        </>
      }
    />
  );
}
