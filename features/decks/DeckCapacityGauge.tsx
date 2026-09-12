import styles from "@/features/decks/DeckScreens.module.css";

interface DeckCapacityGaugeProps {
  count: number;
  min: number;
  max: number;
}

/**
 * « Ligne de charge » du deck, gravée dans le papier : un rail d'encre, un
 * remplissage, et un repère au minimum légal (`RULES.DECK_SIZE_MIN`).
 *
 * Remplace l'égaliseur à segments néon d'avant, dernier vestige de
 * l'ancienne direction artistique. La couleur porte le seul sens utile :
 * laiton tant que le deck est incomplet (« en cours »), turquoise dès
 * qu'il est jouable (le seul endroit où cette couleur apparaît sur le
 * papier), encre rouge délavée s'il dépasse le maximum.
 */
export function DeckCapacityGauge({ count, min, max }: DeckCapacityGaugeProps) {
  const isOver = count > max;
  const isValid = count >= min && count <= max;
  const fillRatio = Math.min(1, count / max);
  const fillClass = isOver ? styles.gaugeFillOver : isValid ? styles.gaugeFillValid : styles.gaugeFill;

  return (
    <div className={styles.gauge}>
      <div
        className={styles.gaugeTrack}
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label="Taille du deck"
      >
        <span className={fillClass} style={{ width: `${fillRatio * 100}%` }} />
        {/* Repère du minimum : il n'a de sens que tant qu'on ne l'a pas atteint. */}
        {!isValid && !isOver && <span className={styles.gaugeMark} style={{ left: `${(min / max) * 100}%` }} />}
      </div>

      <div className={styles.gaugeLabels}>
        <span>
          <span className={styles.gaugeCount}>{count}</span> / {max}
        </span>
        {isOver ? (
          <span className={styles.gaugeStatusOver}>Trop de cartes</span>
        ) : isValid ? (
          <span className={styles.gaugeStatusValid}>Jouable</span>
        ) : (
          <span>Minimum {min}</span>
        )}
      </div>
    </div>
  );
}
