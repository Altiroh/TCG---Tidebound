"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recycleCard } from "@/features/collection/recycleActions";
import { keepThreshold, recycleValueOf, sellableCopies } from "@/features/collection/recycleValue";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/collection/card-detail/CardDetail.module.css";
import { playButtonClick } from "@/lib/sound";

interface CardDetailResaleProps {
  cardId: string;
  /** Exemplaires possédés, tels que la Collection les a lus. */
  owned: number;
}

/**
 * Revente des exemplaires EN TROP, depuis la fiche de carte.
 *
 * « En trop » veut dire : au-delà de ce qu'un deck peut accueillir
 * (`maxCopies`, propre à chaque carte). Ce n'étaient auparavant que « les
 * doubles » — on pouvait donc vendre le 2ᵉ exemplaire d'une carte qui se
 * joue en triple, et le regretter sans recours. Un exemplaire qui dépasse
 * la limite, lui, ne peut servir nulle part.
 *
 * Le prix suit la RARETÉ (`RECYCLE_VALUE`, dérivé du prix du booster) : plus
 * une carte est rare, plus elle se revend cher. C'est le catalogue qui le
 * dit, pas cet écran.
 *
 * Tout cela est tenu par le SERVEUR — ce qui s'affiche ici n'en est qu'un
 * miroir : la possession est relue en base sous verrou, donc deux onglets
 * ne peuvent pas revendre le même exemplaire deux fois.
 */
export function CardDetailResale({ cardId, owned }: CardDetailResaleProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unitValue = recycleValueOf(cardId);
  const keep = keepThreshold(cardId);
  // L'EXCÉDENT seulement : ce qui dépasse la limite de deck de cette carte.
  const spare = sellableCopies(cardId, owned);
  if (unitValue === null || keep === null) return null;

  function sell(quantity: number) {
    playButtonClick();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await recycleCard(cardId, quantity);
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

      {spare === 0 ? (
        <p className={styles.resaleNote}>
          {owned === 0
            ? "Tu ne possèdes pas encore cette carte."
            : `Un deck en accepte ${keep} : rien en trop à revendre.`}
        </p>
      ) : (
        <>
          <div className={styles.resaleActions}>
            <button type="button" className={styles.resaleButton} onClick={() => sell(1)} disabled={isPending}>
              Revendre 1 · {unitValue} Tides
            </button>
            {spare > 1 && (
              <button type="button" className={styles.resaleButton} onClick={() => sell(spare)} disabled={isPending}>
                Revendre les {spare} en trop · {unitValue * spare} Tides
              </button>
            )}
          </div>
          <p className={styles.resaleNote}>
            {owned} possédée{owned > 1 ? "s" : ""} · un deck en accepte {keep} · {spare} en trop
          </p>
        </>
      )}

      {message && <p className={styles.resaleOk} role="status">{message}</p>}
      {error && <p className={styles.resaleError} role="alert">{error}</p>}
    </section>
  );
}
