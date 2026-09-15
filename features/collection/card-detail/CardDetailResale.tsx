"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recycleCard } from "@/features/collection/recycleActions";
import { recycleValueOf } from "@/features/collection/recycleValue";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/collection/card-detail/CardDetail.module.css";
import { playButtonClick } from "@/lib/sound";

interface CardDetailResaleProps {
  cardId: string;
  /** Exemplaires possédés, tels que la Collection les a lus. */
  owned: number;
}

/**
 * Revente des exemplaires EN DOUBLE, depuis la fiche de carte.
 *
 * Le prix suit la RARETÉ (`RECYCLE_VALUE`, dérivé du prix du booster) : plus
 * une carte est rare, plus elle se revend cher. C'est le catalogue qui le
 * dit, pas cet écran.
 *
 * Deux règles, et elles sont tenues par le serveur — ce qui s'affiche ici
 * n'est qu'un miroir :
 *   - on garde TOUJOURS au moins un exemplaire de chaque carte, pour qu'une
 *     revente ne puisse jamais rendre un deck sauvegardé injouable, ni être
 *     un regret définitif ;
 *   - la possession est relue en base sous verrou : deux onglets ne peuvent
 *     pas revendre le même exemplaire deux fois.
 */
export function CardDetailResale({ cardId, owned }: CardDetailResaleProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unitValue = recycleValueOf(cardId);
  // Doubles seulement : le dernier exemplaire n'est jamais vendable.
  const spare = Math.max(0, owned - 1);
  if (unitValue === null) return null;

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
            : "Tu n'en as qu'un exemplaire — on garde toujours le dernier."}
        </p>
      ) : (
        <>
          <div className={styles.resaleActions}>
            <button type="button" className={styles.resaleButton} onClick={() => sell(1)} disabled={isPending}>
              Revendre 1
            </button>
            {spare > 1 && (
              <button type="button" className={styles.resaleButton} onClick={() => sell(spare)} disabled={isPending}>
                Revendre les {spare} doubles · {unitValue * spare} Tides
              </button>
            )}
          </div>
          <p className={styles.resaleNote}>
            {owned} possédée{owned > 1 ? "s" : ""} · {spare} en double
          </p>
        </>
      )}

      {message && <p className={styles.resaleOk} role="status">{message}</p>}
      {error && <p className={styles.resaleError} role="alert">{error}</p>}
    </section>
  );
}
