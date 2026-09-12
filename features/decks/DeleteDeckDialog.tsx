"use client";

import { PaperDialog } from "@/features/shell/PaperDialog";
import shell from "@/features/shell/ScreenShell.module.css";

interface DeleteDeckDialogProps {
  deckName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation de suppression, sur `PaperDialog` (feuille de papier, encre, un filet de laiton). */
export function DeleteDeckDialog({ deckName, isDeleting, onConfirm, onCancel }: DeleteDeckDialogProps) {
  return (
    <PaperDialog
      title={`Supprimer « ${deckName} » ?`}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={shell.dialogGhost} onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className={shell.dialogDanger} onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
        </>
      }
    >
      <p className={shell.dialogText}>Cette action est définitive et supprimera toutes les cartes de ce deck.</p>
    </PaperDialog>
  );
}
