"use client";

import { useMemo } from "react";
import { buildPlayerStatsSheet, type PlayerStatsInput } from "@/features/progression/playerStatsSheet";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/PlayerStatsBoard.module.css";

/**
 * Onglet « Statistiques » du profil — le carnet chiffré du joueur : bilan,
 * temps de jeu, cartes, combat, Marée, façons de gagner, records. Même
 * matière cabine que la vitrine des Exploits ; seule la grille défile.
 */
export function PlayerStatsBoard({ stats }: { stats: PlayerStatsInput | null }) {
  const sheet = useMemo(() => (stats ? buildPlayerStatsSheet(stats) : null), [stats]);

  return (
    <section className={`${game.cabinFrame} ${styles.board}`} aria-label="Statistiques">
      <header className={styles.head}>
        <h2 className={`${game.cabinTitle} ${styles.title}`}>Statistiques</h2>
        <p className={styles.subtitle}>Le carnet de bord chiffré de tes traversées. Le détail compte les parties vraiment jouées, amicales exclues.</p>
      </header>

      {!sheet ? (
        <p className={styles.empty}>Les statistiques ne sont pas disponibles pour le moment. Elles reviendront à la prochaine visite.</p>
      ) : (
        <div className={styles.scroller}>
          <ul className={styles.highlights}>
            {sheet.highlights.map((row) => (
              <li key={row.key} className={`${game.cabinPanel} ${styles.highlight}`}>
                <span className={styles.highlightValue}>{row.value}</span>
                <span className={styles.highlightLabel}>{row.label}</span>
              </li>
            ))}
          </ul>

          <div className={styles.sections}>
            {sheet.sections.map((section) => (
              <section key={section.id} className={`${game.cabinPanel} ${styles.section}`} aria-labelledby={`stats-${section.id}`}>
                <h3 id={`stats-${section.id}`} className={styles.sectionTitle}>
                  {section.title}
                </h3>
                <dl className={styles.rows}>
                  {section.rows.map((row) => (
                    <div key={row.key} className={styles.row}>
                      <dt className={styles.label}>
                        {row.label}
                        {row.hint && <span className={styles.hint}>{row.hint}</span>}
                      </dt>
                      <dd className={styles.value}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
