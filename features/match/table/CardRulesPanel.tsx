"use client";

import { getCardDefinition } from "@/game";
import styles from "@/features/match/table/Table.module.css";

/**
 * L'EFFET d'une carte, en texte de lecture — un prolongement de la carte en
 * grand, en verre liquide, qui sort de derrière son bord.
 *
 * Sur la face, un effet long rétrécit pour tenir dans sa zone. Seul celui-là
 * a besoin d'être repris : l'encart n'apparaît que si la face a dû réduire
 * son texte sous une taille confortable (`data-fit-small`, posé par la face ;
 * règle `:has` dans `Table.module.css`). Un effet court se lit déjà sur la
 * carte et n'est pas répété.
 *
 * Posé contre l'aperçu au survol (`HoverCardPreview`) et dans la carte en
 * grand au doigt (`TableCardZoom`).
 */
export function CardRulesPanel({ cardId }: { cardId: string }) {
  const def = getCardDefinition(cardId);
  if (!def.text) return null;
  return (
    <section className={styles.rulesPanel} aria-label={`Effet de ${def.name}`}>
      <p className={styles.rulesPanelText}>{def.text}</p>
    </section>
  );
}
