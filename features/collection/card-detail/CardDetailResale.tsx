"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recycleCard } from "@/features/collection/recycleActions";
import { keptCopiesOf, recycleValueOf, surplusOf } from "@/features/collection/recycleValue";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/collection/card-detail/CardDetail.module.css";
import { playButtonClick } from "@/lib/sound";

interface CardDetailResaleProps {
  cardId: string;
  /** Exemplaires possédés, tels que la Collection les a lus. */
  owned: number;
}

/**
 * Revente du SURPLUS, depuis la fiche de carte.
 *
 * On ne revend que ce qui dépasse le maximum d'exemplaires d'un deck
 * (`keptCopiesOf`) : au-delà, une copie ne peut servir à aucun deck, la
 * vendre ne coûte rien. En dessous, le bouton n'existe pas. Et la vente
 * passe par une CONFIRMATION — on ne rachète pas une carte vendue.
 *
 * Le prix suit la RARETÉ (`RECYCLE_VALUE`). Le serveur tient les mêmes
 * règles sous verrou (`recycle_card`, `p_min_keep`) : ce qui s'affiche ici
 * n'est qu'un miroir.
 */
export function CardDetailResale({ cardId, owned }: CardDetailResaleProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unitValue = recycleValueOf(cardId);
  const keep = keptCopiesOf(cardId);
  const surplus = surplusOf(cardId, owned);
  if (unitValue === null || keep === null) return null;

  function sell() {
    playButtonClick();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await recycleCard(cardId, surplus);
      setConfirming(false);
      if (!result.ok) {
        setError(result.error ?? "Revente impossible.");
        return;
      }
      setMessage(`+${result.tidesGained} Tides — il t'en reste ${result.remaining}.`);
      // Le solde du bandeau a changé : il doit le relire sans attendre un
      // rechargement de page.
      notifyProgressionChanged();
      router.refresh();
    });
  }

  return (
    <section className={styles.resale} aria-label="Revente">
      <p className={styles.resaleHead}>
        <span className={styles.resaleLabel}>Revente</span>
        <span className={styles.resaleValue}>{unitValue} Tides / exemplaire</span>
      </p>

      {surplus === 0 ? (
        <p className={styles.resaleNote}>
          {owned === 0
            ? "Tu ne possèdes pas encore cette carte."
            : `${owned} / ${keep} exemplaire${keep > 1 ? "s" : ""} — rien en surplus. Seuls les exemplaires au-delà du maximum d'un deck se revendent.`}
        </p>
      ) : confirming ? (
        <div className={styles.resaleConfirm} role="alertdialog" aria-label="Confirmer la revente">
          <p className={styles.resaleConfirmText}>
            Revendre <b>{surplus}</b> exemplaire{surplus > 1 ? "s" : ""} pour <b>{unitValue * surplus} Tides</b> ? Tu en garderas {keep}.
          </p>
          <div className={styles.resaleActions}>
            <button
              type="button"
              className={styles.resaleButton}
              onClick={() => {
                playButtonClick();
                setConfirming(false);
              }}
              disabled={isPending}
            >
              Annuler
            </button>
            <button type="button" className={`${styles.resaleButton} ${styles.resaleButtonConfirm}`} onClick={sell} disabled={isPending}>
              {isPending ? "Revente…" : "Confirmer la revente"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.resaleActions}>
            <button
              type="button"
              className={styles.resaleButton}
              onClick={() => {
                playButtonClick();
                setMessage(null);
                setConfirming(true);
              }}
            >
              Revendre le surplus ({surplus}) · {unitValue * surplus} Tides
            </button>
          </div>
          <p className={styles.resaleNote}>
            {owned} possédée{owned > 1 ? "s" : ""} · maximum {keep} par deck · {surplus} en surplus
          </p>
        </>
      )}

      {message && <p className={styles.resaleOk} role="status">{message}</p>}
      {error && <p className={styles.resaleError} role="alert">{error}</p>}
    </section>
  );
}
