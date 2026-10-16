import styles from "@/features/match/table/Table.module.css";

interface GameViewportProps {
  children: React.ReactNode;
  /** Contours de zones du panneau de debug (cf. `DebugOverlay`). */
  debugZones?: boolean;
  /** Un ciblage est en cours : le terrain se grise, seules les cibles gardent leurs couleurs. */
  targeting?: boolean;
}

/**
 * Fenêtre de jeu : le seul élément accroché à l'écran (`position: fixed`),
 * et le conteneur de référence de toutes les unités `cq*` employées par la
 * scène (`container-type: size`).
 *
 * Conséquence utile pour la suite : le jour où le board devra vivre dans
 * autre chose qu'un plein écran (spectateur, replay, fenêtre de test),
 * seul CE composant change — les tokens suivront la nouvelle taille sans
 * qu'aucune zone n'ait à être retouchée.
 */
export function GameViewport({ children, debugZones = false, targeting = false }: GameViewportProps) {
  return (
    <div
      className={styles.viewport}
      data-game-viewport=""
      data-debug-zones={debugZones ? "true" : "false"}
      // Un ciblage est en cours : le décor du terrain passe en noir et blanc (`Table.module.css`).
      data-targeting={targeting ? "" : undefined}
    >
      {children}
    </div>
  );
}
