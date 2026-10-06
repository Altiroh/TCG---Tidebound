"use client";

import { ARCHETYPE_LABELS, getCardDefinition } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import styles from "@/features/match/table/Table.module.css";

/**
 * L'EFFET d'une carte, en texte de lecture — à côté de la carte en grand.
 *
 * Sur la face, un effet long rétrécit pour tenir dans sa zone : même en
 * aperçu, il finit en petits caractères. Cet encart le reprend en entier, à
 * une taille de lecture fixe, avec le nom et la ligne de type. Posé contre
 * l'aperçu au survol (`HoverCardPreview`) et dans la carte en grand au doigt
 * (`TableCardZoom`).
 */
export function CardRulesPanel({ cardId }: { cardId: string }) {
  const def = getCardDefinition(cardId);
  if (!def.text) return null;
  const famille = def.archetype ? ARCHETYPE_LABELS[def.archetype] : null;
  return (
    <section className={styles.rulesPanel} aria-label={`Effet de ${def.name}`}>
      <h4 className={styles.rulesPanelName}>{def.name}</h4>
      <p className={styles.rulesPanelType}>
        {CARD_TYPE_LABELS[def.type]}
        {famille && <span className={styles.rulesPanelFamily}> · {famille}</span>}
      </p>
      <p className={styles.rulesPanelText}>{def.text}</p>
    </section>
  );
}
