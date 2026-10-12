import { QualificationDescription } from "@/features/match/QualificationBadge";
import type { QualificationChip } from "@/features/match/qualificationDisplay";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

/**
 * Les QUALIFICATIONS de la carte (« spé. »), une par ligne : nom et valeur,
 * ce qu'elle fait, quand elle s'active — et, pour l'équivalent d'un effet
 * écrit, sa condition. Le texte de règles, lui, les rappelle en tête.
 */
export function CardDetailQualifications({ chips }: { chips: readonly QualificationChip[] }) {
  return (
    <section>
      <span className={styles.sectionLabel}>{chips.length > 1 ? "Qualifications" : "Qualification"}</span>
      <ul className={styles.effect} style={{ listStyle: "none", margin: 0 }}>
        {chips.map((chip) => (
          <li key={chip.key} data-qualification={chip.id} className={styles.effectText} style={{ marginTop: 0 }}>
            <strong className={styles.effectValue}>{chip.label}</strong>
            {" — "}
            <QualificationDescription chip={chip} />
          </li>
        ))}
      </ul>
    </section>
  );
}
