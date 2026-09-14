"use client";

import { useEffect, useState } from "react";
import { fetchProgression, type ProgressionSummary } from "@/features/progression/actions";
import { onProgressionChanged, rememberProgression, rememberedProgression } from "@/features/progression/progressionSync";
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

/** Jeton de Tides — une pièce, pas une icône de logiciel : la monnaie doit se reconnaître d'un coup d'œil. */
export function TideCoin({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={styles.tideCoin}>
      <circle cx="12" cy="12" r="9" fill="url(#tideCoinFace)" stroke="#a47b36" strokeWidth="1.3" />
      <path
        d="M6.6 13.4c1.4-1.5 2.7-1.5 4.1 0s2.7 1.5 4.1 0 2.7-1.5 4.1 0"
        fill="none"
        stroke="#6d5224"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.85"
      />
      <defs>
        <linearGradient id="tideCoinFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d79a" />
          <stop offset="100%" stopColor="#c79a4e" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Initiale du pseudo pour l'avatar. Insécable si le pseudo est vide ou ne commence pas par une lettre. */
function avatarInitial(name: string | null): string {
  const first = name?.trim()?.[0];
  return first ? first.toUpperCase() : "?";
}

/**
 * Zone du COMPTE, au bout du bandeau : avatar, pseudo, niveau et
 * avancement d'XP, solde de Tides, puis l'accès aux Options.
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
  // Dernière lecture connue affichée d'emblée : chaque écran monte son propre
  // bandeau, qui repartait sinon de rien — le bloc du compte apparaissait
  // une fraction de seconde après tout le reste à CHAQUE navigation. La
  // relecture se fait quand même en arrière-plan et corrige l'affichage.
  const [summary, setSummary] = useState<ProgressionSummary | null>(rememberedProgression);
  const [optionsOpen, setOptionsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Numéro de lecture : deux relectures rapprochées (achat puis quête)
    // peuvent revenir dans le désordre — seule la dernière demandée compte.
    let latest = 0;
    const load = () => {
      const request = ++latest;
      fetchProgression()
        .then((result) => {
          // Mémorisée même si ce bandeau a été démonté entre-temps : le
          // prochain écran en profitera. Déconnecté : on n'en garde rien.
          rememberProgression(result);
          if (!cancelled && request === latest) setSummary(result);
        })
        .catch((error) => console.error("[HeaderPlayer] Lecture de la progression impossible :", error));
    };

    load();
    // Relecture après un achat, une quête réclamée… — cf. `progressionSync`.
    const unsubscribe = onProgressionChanged(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Joueur non connecté : la progression n'existe pas encore, on n'affiche
  // rien du tout plutôt qu'un niveau 1 trompeur.
  const signedIn = summary?.isSignedIn ?? false;

  return (
    <>
      {signedIn && summary && (
        <div className={styles.account}>
          {/* Avatar : l'initiale du pseudo dans un jeton de laiton. Pas
              d'image tant que le jeu n'en propose pas — un rond vide dirait
              qu'il manque quelque chose. */}
          <span className={styles.accountAvatar} aria-hidden>
            {avatarInitial(summary.displayName)}
          </span>

          <span className={styles.accountIdentity}>
            <span className={styles.accountName} title={summary.displayName ?? undefined}>
              {summary.displayName ?? "Joueur"}
            </span>

            <span className={styles.accountLevelRow}>
              <span className={styles.accountLevel}>
                Niv. <b>{summary.view.level}</b>
              </span>
              <span
                className={styles.progressionTrack}
                role="progressbar"
                aria-valuenow={summary.view.xpIntoLevel}
                aria-valuemin={0}
                aria-valuemax={summary.view.xpForNextLevel}
                aria-label={`Progression : ${summary.view.xpIntoLevel} XP sur ${summary.view.xpForNextLevel} avant le niveau ${summary.view.level + 1}`}
                title={`${summary.view.xpIntoLevel} / ${summary.view.xpForNextLevel} XP`}
              >
                <span className={styles.progressionFill} style={{ width: `${summary.view.ratio * 100}%` }} />
              </span>
            </span>
          </span>

          <span className={styles.accountTides} title="Tides — la monnaie du jeu">
            <TideCoin />
            {summary.balance}
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
