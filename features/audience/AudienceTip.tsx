"use client";

import type { ReactNode } from "react";
import styles from "@/features/audience/AudienceTip.module.css";

/**
 * Bulle « qu'est-ce que c'est ? » de l'Audience, au survol (ou au focus
 * clavier) : trois lignes, pas un manuel. Le joueur joue sans s'en soucier ;
 * celui qui se pose la question a sa réponse sans quitter l'écran.
 *
 * `placement` : sous l'élément (bandeau) ou à sa gauche (coin de la table).
 */
export function AudienceTip({
  children,
  mood,
  count,
  placement = "below",
}: {
  children: ReactNode;
  /** Humeur du moment (« Le public est captivé »), si on la connaît. */
  mood?: string | null;
  /** Spectateurs, si on veut les rappeler en tête de bulle. */
  count?: number;
  placement?: "below" | "left";
}) {
  return (
    <span className={styles.anchor} tabIndex={0} data-placement={placement}>
      {children}
      <span className={styles.tip} role="tooltip">
        <span className={styles.title}>
          Audience{count !== undefined ? ` · ${count.toLocaleString("fr-FR")} spectateurs` : ""}
        </span>
        {mood && <span className={styles.mood}>{mood}.</span>}
        <span className={styles.body}>
          Le public qui suit vos parties. Il juge chacune en silence : une partie disputée, variée et bien menée
          l&apos;attire ; une partie expédiée, des tours passés ou un abandon le lassent.
        </span>
        <span className={styles.foot}>À partir du niveau 10, c&apos;est lui qui attire le regard des mécènes.</span>
      </span>
    </span>
  );
}
