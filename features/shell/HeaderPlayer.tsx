"use client";

import { useEffect, useState } from "react";
import { fetchProgression, type ProgressionSummary } from "@/features/progression/actions";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import styles from "@/features/shell/ScreenShell.module.css";
import { playButtonClick } from "@/lib/sound";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth={1.7} />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.28.68.94 1.12 1.66 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        stroke="currentColor"
        strokeWidth={1.45}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Bloc joueur du bandeau : pseudo, niveau, avancement d'XP, solde de
 * Tides, et l'accès aux Options.
 *
 * UN SEUL composant pour tout ça, et donc une seule lecture de la
 * progression : le bouton Options a besoin de savoir si quelqu'un est
 * connecté (les réglages de compte n'ont pas de sens sinon), exactement ce
 * que cette lecture rapporte déjà. Deux composants voisins auraient fait
 * deux fois la même requête sur chaque écran.
 *
 * La lecture se fait au montage plutôt qu'en prop depuis chaque page
 * serveur : la faire descendre à travers toutes les routes pour une
 * information d'AFFICHAGE n'apporterait rien, et la coquille reste
 * autonome (tout écran monté dessus l'obtient gratuitement). En
 * contrepartie l'information apparaît une fraction de seconde après le
 * reste du bandeau — d'où l'absence de squelette : mieux vaut ne rien
 * afficher qu'un faux niveau.
 *
 * L'engrenage, lui, est là DÈS LE DÉPART et ne dépend d'aucune lecture :
 * les réglages audio servent aussi à un visiteur non connecté, et un
 * bouton qui apparaît après coup déplace ce qui l'entoure.
 */
export function HeaderPlayer() {
  const [summary, setSummary] = useState<ProgressionSummary | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProgression()
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((error) => console.error("[HeaderPlayer] Lecture de la progression impossible :", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // Joueur non connecté : la progression n'existe pas encore, on n'affiche
  // rien du tout plutôt qu'un niveau 1 trompeur.
  const signedIn = summary?.isSignedIn ?? false;

  return (
    <>
      {signedIn && summary && (
        <div className={styles.progression}>
          {summary.displayName && (
            <span className={styles.progressionName} title={summary.displayName}>
              {summary.displayName}
            </span>
          )}

          <span className={styles.progressionLevel}>
            <span className={styles.progressionLevelLabel}>Niv.</span>
            {summary.view.level}
          </span>

          <span
            className={styles.progressionTrack}
            role="progressbar"
            aria-valuenow={summary.view.xpIntoLevel}
            aria-valuemin={0}
            aria-valuemax={summary.view.xpForNextLevel}
            aria-label={`Progression : ${summary.view.xpIntoLevel} XP sur ${summary.view.xpForNextLevel} avant le niveau ${summary.view.level + 1}`}
          >
            <span className={styles.progressionFill} style={{ width: `${summary.view.ratio * 100}%` }} />
          </span>

          <span className={styles.progressionXp}>
            {summary.view.xpIntoLevel} / {summary.view.xpForNextLevel}
          </span>

          <span className={styles.progressionTides} title="Tides — la monnaie du jeu">
            {summary.balance}
            <span className={styles.progressionTidesLabel}>Tides</span>
          </span>
        </div>
      )}

      <button
        type="button"
        className={styles.optionsButton}
        aria-label="Options"
        title="Options"
        aria-haspopup="dialog"
        onClick={() => {
          playButtonClick();
          setOptionsOpen(true);
        }}
      >
        <GearIcon />
      </button>

      {optionsOpen && <SettingsDialog isSignedIn={signedIn} onClose={() => setOptionsOpen(false)} />}
    </>
  );
}
