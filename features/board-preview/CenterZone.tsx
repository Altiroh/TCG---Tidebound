import styles from "@/features/board-preview/BoardPreview.module.css";
import { TideIndicator } from "@/features/board-preview/TideIndicator";
import type { PreviewTideModel } from "@/features/board-preview/previewFixtures";

/**
 * Bande centrale de la scène : la Marée, et (en superposition, même
 * rangée de grille) les grappes du HUD. Sa hauteur est plafonnée par
 * `--center-max` côté CSS, le reste de l'espace vertical étant réparti
 * également autour des trois rangées — la Marée reste donc centrée entre
 * les deux camps quelle que soit la résolution, sans créer de grand vide.
 */
export function CenterZone({ tide }: { tide: PreviewTideModel }) {
  return (
    <div className={styles.centerZone} data-zone="CenterZone">
      <TideIndicator tide={tide} />
    </div>
  );
}
