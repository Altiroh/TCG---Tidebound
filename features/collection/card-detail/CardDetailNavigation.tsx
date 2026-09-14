import styles from "@/features/collection/card-detail/CardDetail.module.css";

interface CardDetailNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Flèches carte précédente / suivante.
 *
 * Montées uniquement quand la navigation a un sens (plus d'une carte dans
 * la sélection courante) — c'est l'appelant qui en décide. Le clavier
 * (`ArrowLeft`/`ArrowRight`) est géré une seule fois dans `CardDetailModal`
 * plutôt que dupliqué ici.
 */
export function CardDetailNavigation({ onPrevious, onNext }: CardDetailNavigationProps) {
  return (
    <>
      <button type="button" onClick={onPrevious} aria-label="Carte précédente" className={`${styles.control} ${styles.navPrev}`}>
        <svg viewBox="0 0 24 24" fill="none" className={styles.controlIcon} aria-hidden>
          <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" onClick={onNext} aria-label="Carte suivante" className={`${styles.control} ${styles.navNext}`}>
        <svg viewBox="0 0 24 24" fill="none" className={styles.controlIcon} aria-hidden>
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );
}
