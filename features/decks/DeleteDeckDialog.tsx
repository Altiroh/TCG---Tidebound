"use client";

interface DeleteDeckDialogProps {
  deckName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation de suppression — verre liquide, cohérent avec les autres overlays plein écran de l'app (`CardDetailModal`, etc.). */
export function DeleteDeckDialog({ deckName, isDeleting, onConfirm, onCancel }: DeleteDeckDialogProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/[0.07] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
      >
        <h2 className="text-lg font-semibold text-white">Supprimer « {deckName} » ?</h2>
        <p className="mt-2 text-sm text-slate-300">Cette action est définitive et supprimera toutes les cartes de ce deck.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/20"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
