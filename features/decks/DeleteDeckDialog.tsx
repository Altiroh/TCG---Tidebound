"use client";

import { DECK_TRASH_RETENTION_DAYS } from "@/features/decks/deckTrash";
import { Dialog } from "@/features/shell/Dialog";
import game from "@/features/shell/GameScreen.module.css";

interface DeleteDeckDialogProps {
  /** Noms des decks concernés — un seul le plus souvent, plusieurs depuis la sélection multiple. */
  deckNames: string[];
  /**
   * `false` : mise à la corbeille, récupérable pendant 30 jours. `true` :
   * effacement DÉFINITIF depuis la corbeille — la seule action de cet écran
   * sans retour en arrière, d'où la validation.
   */
  permanent: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation de suppression de decks — dialogue commun, action destructrice en dernier. */
export function DeleteDeckDialog({ deckNames, permanent, isDeleting, onConfirm, onCancel }: DeleteDeckDialogProps) {
  const count = deckNames.length;
  const subject = count === 1 ? `« ${deckNames[0]} »` : `ces ${count} decks`;
  const title = permanent ? `Effacer ${subject} définitivement ?` : `Supprimer ${subject} ?`;
  const description = permanent
    ? count === 1
      ? "Ce deck disparaît pour de bon, cartes comprises. Il n'y aura pas de retour en arrière."
      : "Ces decks disparaissent pour de bon, cartes comprises. Il n'y aura pas de retour en arrière."
    : count === 1
      ? `Le deck rejoint « Récemment supprimés » : tu pourras le restaurer pendant ${DECK_TRASH_RETENTION_DAYS} jours.`
      : `Les decks rejoignent « Récemment supprimés » : tu pourras les restaurer pendant ${DECK_TRASH_RETENTION_DAYS} jours.`;

  return (
    <Dialog
      title={title}
      tone="danger"
      description={description}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className={game.danger} onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (permanent ? "Effacement…" : "Suppression…") : permanent ? "Effacer définitivement" : "Supprimer"}
          </button>
        </>
      }
    />
  );
}
