import type { ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import { TideIndicator } from "@/features/match/table/TideIndicator";
import type { TableTideModel } from "@/features/match/table/tableModel";

interface CenterZoneProps {
  tide: TableTideModel;
  /** Consigne ponctuelle sous la piste (« Choisissez une cible… »), avec son éventuel bouton. */
  hint?: ReactNode;
}

/**
 * Bande centrale, entre les deux rangées de plateau :
 *   [ tuile de sens de Marée ] [ piste de Marée ] [ hublot de Marée ]
 *
 * La tuile tombe dans la colonne des navires, pile entre les deux cadres ;
 * la piste dans la colonne des plateaux, donc centrée sur eux (et non sur
 * l'écran) ; le hublot dans la colonne des piles, à mi-hauteur entre la
 * pioche du joueur et celle de l'adversaire — la seule place du plateau qui
 * restait libre, et la bonne : les trois éléments de Marée se lisent alors
 * sur une même ligne, du sens à la mer elle-même.
 *
 * Tuile de sens : les deux faces (`montante` / `descendante`) restent montées et
 * se relaient en pivotant quand l'orientation change — même mouvement que
 * `TideOrientationTile` (fondu + légère rotation + zoom).
 */
export function CenterZone({ tide, hint }: CenterZoneProps) {
  const rising = tide.orientation === "rising";
  return (
    <div className={`${styles.zone} ${styles.centerZone}`} data-zone="CenterZone">
      <div className={styles.zoneSlotShip}>
        <div className={styles.tideTile} role="img" aria-label={`Marée ${rising ? "montante" : "descendante"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- tuile locale */}
          <img
            src="/assets/board/tide-orientation/montante.webp"
            alt=""
            draggable={false}
            className={`${styles.fill} ${styles.tideTileFace} ${rising ? styles.tideTileFaceOn : ""}`}
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- tuile locale */}
          <img
            src="/assets/board/tide-orientation/descendante.webp"
            alt=""
            draggable={false}
            className={`${styles.fill} ${styles.tideTileFace} ${rising ? "" : styles.tideTileFaceOn}`}
          />
        </div>
      </div>
      <div className={styles.zoneSlotBoard}>
        <div className={styles.centerStack}>
          <TideIndicator tide={tide} />
          {hint}
        </div>
      </div>
      {/* La colonne des piles reste vide : les hublots de la piste montrent
          déjà la mer de chaque état, le grand hublot a été retiré. */}
      <div className={styles.zoneSlotCargo} />
    </div>
  );
}
