import { Fragment } from "react";
import type { CardDetailStat } from "@/features/collection/card-detail/cardDetailData";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

const MEDALLION_CLASS: Record<CardDetailStat["key"], string> = {
  cost: styles.statCost ?? "",
  attack: styles.statAttack ?? "",
  health: styles.statHealth ?? "",
};

/**
 * Coût / Puissance / Résistance en médaillons.
 *
 * Le nombre de médaillons suit la carte : une Structure n'a pas de
 * Puissance, un Objet souvent ni l'une ni l'autre — on n'affiche jamais un
 * zéro de remplissage pour garder trois pastilles alignées.
 */
export function CardDetailStats({ stats }: { stats: CardDetailStat[] }) {
  return (
    <dl className={styles.stats}>
      {stats.map((stat, index) => (
        <Fragment key={stat.key}>
          {index > 0 && <span className={styles.statSeparator} aria-hidden />}
          <div className={styles.stat}>
            <dd className={`${styles.statMedallion} ${MEDALLION_CLASS[stat.key]}`}>{stat.value}</dd>
            <dt className={styles.statLabel}>{stat.label}</dt>
          </div>
        </Fragment>
      ))}
    </dl>
  );
}
