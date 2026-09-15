import styles from "@/features/match/table/Table.module.css";

/**
 * Calque d'effets — vide par construction à ce stade.
 *
 * Posé AU-DESSUS du gameplay et du HUD, mais en `pointer-events: none` :
 * il ne bloque donc aucun clic tant qu'il ne contient rien (et les futurs
 * effets devront eux-mêmes rester non cliquables, ou réactiver
 * `pointer-events` uniquement sur la portion qui le demande).
 *
 * Accueillera : vols de cartes, dégâts, particules, changement de Marée,
 * maladie, effets de statut, animations de victoire / défaite.
 */
export function EffectsLayer({ children }: { children?: React.ReactNode }) {
  return (
    <div className={styles.effects} aria-hidden>
      {children}
    </div>
  );
}
