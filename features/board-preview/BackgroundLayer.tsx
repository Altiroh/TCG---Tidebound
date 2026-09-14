import styles from "@/features/board-preview/BoardPreview.module.css";

interface BackgroundLayerProps {
  /**
   * Image de décor optionnelle. Non utilisée pour l'instant (le laboratoire
   * se contente d'un dégradé) mais le point d'entrée existe déjà : le
   * calque est en `background-size: cover` / `background-position: center`,
   * donc le décor pourra être recadré selon le format d'écran SANS jamais
   * déplacer le gameplay, qui vit dans un calque séparé au-dessus.
   */
  imageUrl?: string;
}

export function BackgroundLayer({ imageUrl }: BackgroundLayerProps) {
  return (
    <div
      aria-hidden
      className={styles.background}
      style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
    >
      <div className={styles.backgroundVeil} />
    </div>
  );
}
