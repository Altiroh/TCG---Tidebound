import styles from "@/features/board-preview/BoardPreview.module.css";
import type { PreviewResourceModel } from "@/features/board-preview/previewFixtures";

interface PreviewResourcesProps {
  resources: readonly PreviewResourceModel[];
}

/**
 * Colonne de ressources d'un camp (Tides, deck, main, cimetière).
 * Purement positionnelle à ce stade : ce sont les emplacements qu'on teste,
 * pas leur habillage.
 */
export function PreviewResources({ resources }: PreviewResourcesProps) {
  return (
    <div className={styles.resources}>
      {resources.map((resource) => (
        <div key={resource.key} className={styles.resourceRow}>
          <span className={styles.resourceLabel}>{resource.label}</span>
          <span className={styles.resourceValue}>{resource.value}</span>
        </div>
      ))}
    </div>
  );
}
