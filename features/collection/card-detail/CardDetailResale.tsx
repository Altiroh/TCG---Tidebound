"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recycleCard } from "@/features/collection/recycleActions";
import { keptCopiesOf, recycleValueOf } from "@/features/collection/recycleValue";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { TideCoin } from "@/features/shell/GameIcons";
import styles from "@/features/collection/card-detail/CardDetail.module.css";
import { playButtonClick } from "@/lib/sound";

interface CardDetailResaleProps {
  cardId: string;
  /** Exemplaires possédés, tels que la Collection les a lus. */
  owned: number;
}

/**
 * Revente d'une carte, depuis sa fiche.
 *
 * Le joueur choisit COMBIEN, jusqu'à tout vendre. La version précédente ne
 * proposait que le surplus — ce qui dépasse le maximum d'un deck — et
 * cachait purement et simplement le bouton en dessous : quelqu'un qui
 * voulait se débarrasser d'une carte qu'il ne jouera jamais n'avait ni
 * bouton, ni explication utile, ni recours. Le garde-fou est maintenant
 * une CONFIRMATION, pas un refus : on prévient quand la vente descend sous
 * ce qu'un deck peut jouer, et on laisse décider.
 *
 * Le bouton est donc TOUJOURS là dès qu'un exemplaire est possédé, et la
 * vente passe toujours par la confirmation — on ne rachète pas une carte
 * vendue.
 *
 * Le prix suit la RARETÉ (`RECYCLE_VALUE`). La base tranche la possession
 * sous verrou (`recycle_card`) : ce qui s'affiche ici n'en est qu'un
 * miroir.
 */
export function CardDetailResale({ cardId, owned }: CardDetailResaleProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unitValue = recycleValueOf(cardId);
  const keep = keptCopiesOf(cardId);
  if (unitValue === null || keep === null) return null;

  // La collection peut avoir bougé depuis le montage (une revente, un
  // booster ouvert dans un autre onglet) : on borne à l'affichage plutôt
  // que de laisser un compteur mentir.
  const sellable = Math.max(0, Math.floor(owned));
  const wanted = Math.min(Math.max(1, quantity), Math.max(1, sellable));
  const remaining = sellable - wanted;
  const total = unitValue * wanted;

  function sell() {
    playButtonClick();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await recycleCard(cardId, wanted);
      setConfirming(false);
      if (!result.ok) {
        setError(result.error ?? "Revente impossible.");
        return;
      }
      setQuantity(1);
      setMessage(
        result.remaining === 0
          ? `+${result.tidesGained} Tides — cette carte a quitté ta collection.`
          : `+${result.tidesGained} Tides — il t'en reste ${result.remaining}.`
      );
      // Le solde du bandeau a changé : il doit le relire sans attendre un
      // rechargement de page.
      notifyProgressionChanged();
      router.refresh();
    });
  }

  function step(delta: number) {
    playButtonClick();
    setMessage(null);
    setQuantity((current) => Math.min(sellable, Math.max(1, current + delta)));
  }

  return (
    <section className={styles.resale} aria-label="Revente">
      <p className={styles.resaleHead}>
        <span className={styles.resaleLabel}>Revente</span>
        <span className={styles.resaleValue}>
          <TideCoin size={14} /> {unitValue} Tides / exemplaire
        </span>
      </p>

      {sellable === 0 ? (
        <p className={styles.resaleNote}>Tu ne possèdes pas encore cette carte.</p>
      ) : confirming ? (
        <div className={styles.resaleConfirm} role="alertdialog" aria-label="Confirmer la revente">
          <p className={styles.resaleConfirmText}>
            Revendre <b>{wanted}</b> exemplaire{wanted > 1 ? "s" : ""} pour <b>{total} Tides</b> ?{" "}
            {remaining === 0 ? (
              <>Cette carte quittera ta collection, et les decks qui l&apos;utilisent la compteront comme prêtée.</>
            ) : remaining < keep ? (
              <>
                Il t&apos;en restera {remaining} — un deck peut en jouer jusqu&apos;à {keep}.
              </>
            ) : (
              <>Il t&apos;en restera {remaining}.</>
            )}
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
            <span className={styles.resaleQty} role="group" aria-label="Exemplaires à revendre">
              <button
                type="button"
                className={styles.resaleQtyStep}
                onClick={() => step(-1)}
                disabled={wanted <= 1}
                aria-label="Un exemplaire de moins"
              >
                −
              </button>
              <span className={styles.resaleQtyValue} aria-live="polite">
                {wanted} / {sellable}
              </span>
              <button
                type="button"
                className={styles.resaleQtyStep}
                onClick={() => step(1)}
                disabled={wanted >= sellable}
                aria-label="Un exemplaire de plus"
              >
                +
              </button>
            </span>
            <button
              type="button"
              className={styles.resaleButton}
              onClick={() => {
                playButtonClick();
                setMessage(null);
                setConfirming(true);
              }}
            >
              Revendre · {total} Tides
            </button>
          </div>
          <p className={styles.resaleNote}>
            {sellable} possédée{sellable > 1 ? "s" : ""} · un deck en joue au plus {keep}
            {sellable > keep && ` · ${sellable - keep} en surplus`}
          </p>
        </>
      )}

      {message && <p className={styles.resaleOk} role="status">{message}</p>}
      {error && <p className={styles.resaleError} role="alert">{error}</p>}
    </section>
  );
}
