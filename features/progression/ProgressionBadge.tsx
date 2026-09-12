"use client";

import { useEffect, useState } from "react";
import { fetchProgression, type ProgressionSummary } from "@/features/progression/actions";
import styles from "@/features/shell/ScreenShell.module.css";

/**
 * Niveau, avancement d'XP et solde de Tides, posés dans le header de la
 * coquille partagée — donc visibles sur Collection, Decks, Éditeur et
 * Boosters sans plomberie par écran.
 *
 * Lit la progression via la Server Action au montage plutôt qu'en prop
 * depuis chaque page serveur : la faire descendre à travers 4 routes et 4
 * écrans pour une information d'AFFICHAGE n'apporterait rien, et la
 * coquille reste autonome (tout écran monté dessus l'obtient gratuitement).
 * En contrepartie l'information apparaît une fraction de seconde après le
 * reste du header — d'où l'absence de squelette : mieux vaut ne rien
 * afficher qu'un faux niveau.
 */
export function ProgressionBadge() {
  const [summary, setSummary] = useState<ProgressionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProgression()
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((error) => console.error("[ProgressionBadge] Lecture de la progression impossible :", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // Joueur non connecté : la progression n'existe pas encore, on n'affiche
  // rien du tout plutôt qu'un niveau 1 trompeur.
  if (!summary?.isSignedIn) return null;

  const { view, balance } = summary;

  return (
    <div className={styles.progression}>
      <span className={styles.progressionLevel}>
        <span className={styles.progressionLevelLabel}>Niv.</span>
        {view.level}
      </span>

      <span
        className={styles.progressionTrack}
        role="progressbar"
        aria-valuenow={view.xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={view.xpForNextLevel}
        aria-label={`Progression : ${view.xpIntoLevel} XP sur ${view.xpForNextLevel} avant le niveau ${view.level + 1}`}
      >
        <span className={styles.progressionFill} style={{ width: `${view.ratio * 100}%` }} />
      </span>

      <span className={styles.progressionXp}>
        {view.xpIntoLevel} / {view.xpForNextLevel}
      </span>

      <span className={styles.progressionTides} title="Tides — la monnaie du jeu">
        {balance}
        <span className={styles.progressionTidesLabel}>Tides</span>
      </span>
    </div>
  );
}
