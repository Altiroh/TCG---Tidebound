import type { TideStateName } from "@/game";
import styles from "@/features/match/table/Table.module.css";

/**
 * Pluie sur la table en Tempête et dans les Abysses — un habillage, pas une
 * information : l'état de Marée se lit déjà sur la piste. Montée en
 * permanence et allumée en fondu, pour qu'un changement de Marée ne fasse
 * rien clignoter. Posée entre la mer et le plateau : les cartes restent
 * nettes par-dessus.
 */
export function RainLayer({ tideState }: { tideState: TideStateName }) {
  const intensity = tideState === "tempete" ? "storm" : tideState === "abysses" ? "abyss" : "none";
  return (
    <div aria-hidden className={styles.rain} data-intensity={intensity}>
      {intensity !== "none" && (
        <>
          <span className={styles.rainFar} />
          <span className={styles.rainNear} />
        </>
      )}
    </div>
  );
}
