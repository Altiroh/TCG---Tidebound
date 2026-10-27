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

/**
 * Les ÉTATS d'une carte posée (Garde, Malade, Immobilisée, Pied marin…), en
 * toutes lettres : le badge au-dessus de la carte dit qu'il y a un état, pas
 * ce qu'il fait. Même verre que l'effet, posé sous lui ; rien sans état.
 */
export function CardStatesPanel({ legend }: { legend: ReadonlyArray<{ label: string; description: string }> }) {
  if (legend.length === 0) return null;
  return (
    <section className={`${styles.rulesPanel} ${styles.statesPanel}`} aria-label="États de la carte">
      <dl className={styles.statesList}>
        {legend.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
