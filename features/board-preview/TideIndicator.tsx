import styles from "@/features/board-preview/BoardPreview.module.css";
import type { PreviewTideModel } from "@/features/board-preview/previewFixtures";

interface TideIndicatorProps {
  tide: PreviewTideModel;
}

/**
 * Placeholder de la mécanique de Marée, au centre de la scène entre les
 * deux plateaux. Remplacera à terme (ou sera remplacé par) le vrai
 * composant `TideProgressBar`/`TideOrientationTile` du board de partie.
 */
export function TideIndicator({ tide }: TideIndicatorProps) {
  return (
    <div className={styles.tide}>
      <span className={styles.tideArrow}>{tide.direction === "up" ? "▲" : "▼"}</span>
      <span className={styles.tideName}>Marée · {tide.name}</span>
      {/* Piste d'avancement : décorative, masquée en mobile paysage. */}
      <div className={styles.tideTrack}>
        {Array.from({ length: tide.steps }, (_, index) => (
          <span
            key={index}
            className={`${styles.tideStep} ${index < tide.step ? styles.tideStepActive : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
