import { OrientationLock } from "@/features/shell/OrientationLock";
import styles from "@/features/shell/OrientationGate.module.css";

/**
 * Impose le PAYSAGE sur un appareil tactile : Tidebound se joue à
 * l'horizontale (plateau en paysage, bandeau qui ne tient pas sous 640 px).
 *
 * Trois niveaux, du plus contraignant au plus universel :
 *  1. le manifeste (`public/manifest.webmanifest`, `orientation: landscape`)
 *     — Android tient l'app installée en paysage tout seul ;
 *  2. `OrientationLock` tente en plus l'API d'orientation là où elle existe ;
 *  3. ce voile, en CSS pur, couvre tout le reste — iOS notamment, qui
 *     n'honore ni le manifeste ni le verrou : le joueur tourne l'appareil.
 *
 * Monté une seule fois, dans `app/layout.tsx` : il vaut pour toutes les
 * routes, plateau compris. Rendu côté serveur et masqué par défaut, donc
 * invisible partout ailleurs (bureau, tablette, paysage).
 */
export function OrientationGate() {
  return (
    <div className={styles.gate} role="alertdialog" aria-live="polite" aria-label="Tournez votre appareil">
      <OrientationLock />
      <svg className={styles.icon} width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="2" width="10" height="20" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.6 19.2h2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <h1 className={styles.title}>Tournez votre appareil</h1>
      <p className={styles.text}>Tidebound se joue à l&apos;horizontale : le plateau, les mains et le journal ont besoin de la largeur.</p>
      <p className={styles.hint}>
        Si l&apos;écran ne pivote pas, désactivez le verrouillage de rotation de votre téléphone.
      </p>
    </div>
  );
}
