"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProgression, type ProgressionSummary } from "@/features/progression/actions";
import { onProgressionChanged, rememberProgression, rememberedProgression } from "@/features/progression/progressionSync";
import { PlayerDrawer } from "@/features/progression/PlayerDrawer";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
  /**
   * Fermeture DIFFÉRÉE du carnet de bord.
   *
   * Le panneau s'ouvre au survol du bloc de compte mais s'affiche à côté :
   * entre les deux, le curseur traverse forcément un peu de bandeau. Sans
   * ce délai, le panneau se refermerait avant qu'on l'ait atteint. Entrer
   * dans le panneau annule le compte à rebours, et en sortir le relance.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Dernier nombre de quêtes à réclamer VU. Sert à repérer une quête qui
   * vient de tomber : c'est une AUGMENTATION qui s'annonce, pas un total —
   * sinon l'alerte reviendrait à chaque écran tant que rien n'est réclamé.
   *
   * `null` tant qu'on n'a rien lu : la première lecture d'une session ne
   * doit rien annoncer, même si des quêtes attendent depuis hier.
   */
  const lastClaimable = useRef<number | null>(null);
  const toastId = useRef(0);

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
          if (cancelled || request !== latest) return;
          setSummary(result);
          announceNewQuests(result.claimableQuests);
        })
        .catch((error) => console.error("[HeaderPlayer] Lecture de la progression impossible :", error));
    };

    /**
     * Annonce les quêtes qui viennent de se terminer. Le joueur ne doit pas
     * avoir à ouvrir un panneau pour apprendre qu'il a gagné quelque chose :
     * une partie finie, et l'alerte le dit, avec de quoi encaisser sur-le-champ.
     */
    function announceNewQuests(claimable: number) {
      const previous = lastClaimable.current;
      lastClaimable.current = claimable;
      // Première lecture de la session : on prend le compte sans rien dire.
      if (previous === null || claimable <= previous) return;

      const gained = claimable - previous;
      setToast({
        id: ++toastId.current,
        tone: "success",
        text: `${gained} quête${gained > 1 ? "s" : ""} terminée${gained > 1 ? "s" : ""} — récompense à encaisser.`,
        action: (
          <button
            type="button"
            className={styles.toastAction}
            onClick={() => {
              playButtonClick();
              setToast(null);
              setPanelOpen(true);
            }}
          >
            Voir →
          </button>
        ),
      });
    }

    load();
    // Relecture après un achat, une quête réclamée… — cf. `progressionSync`.
    const unsubscribe = onProgressionChanged(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Le compte à rebours ne doit pas survivre au démontage du bandeau —
  // chaque navigation en monte un nouveau.
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const holdOpen = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setPanelOpen(true);
  }, []);

  const releaseOpen = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPanelOpen(false), 260);
  }, []);

  const closeNow = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setPanelOpen(false);
  }, []);

  // Joueur non connecté : la progression n'existe pas encore, on n'affiche
  // rien du tout plutôt qu'un niveau 1 trompeur.
  const signedIn = summary?.isSignedIn ?? false;

  return (
    <>
      {signedIn && summary && (
        /*
         * Tout le bloc est la POIGNÉE du carnet de bord : le survoler
         * l'ouvre, le clic aussi (et le clavier par le focus). Le pseudo
         * menait auparavant à `/profil` — une navigation complète pour
         * jeter un œil à son niveau entre deux parties.
         */
        <button
          type="button"
          className={styles.account}
          onMouseEnter={holdOpen}
          onMouseLeave={releaseOpen}
          onFocus={holdOpen}
          onClick={() => {
            playButtonClick();
            if (panelOpen) closeNow();
            else holdOpen();
          }}
          aria-haspopup="dialog"
          aria-expanded={panelOpen}
          aria-label="Carnet de bord"
        >
          {/* L'illustration choisie sert d'avatar, SANS filtre : c'est un
              trophée, pas un fond de plaque. Sans illustration, l'initiale
              du pseudo dans un jeton de laiton. */}
          {summary.avatarCardId ? (
            <span
              className={styles.accountPortrait}
              style={{ backgroundImage: `url("${cardIllustrationUrl(summary.avatarCardId)}")` }}
              aria-hidden
            />
          ) : (
            <span className={styles.accountAvatar} aria-hidden>
              {avatarInitial(summary.displayName)}
            </span>
          )}

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

          {/* Pastille : ce qui attend une action, et rien d'autre. Elle a
              suivi les quêtes dans le carnet de bord, faute d'icône à
              porter — c'est le bloc de compte qui signale l'attente. */}
          {summary.claimableQuests > 0 && (
            <span className={styles.badge} aria-label={`${summary.claimableQuests} récompense${summary.claimableQuests > 1 ? "s" : ""} à réclamer`}>
              {summary.claimableQuests}
            </span>
          )}
        </button>
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

      {/* Alerte de quête terminée. Montée ICI et non par écran : le bandeau
          est le seul composant présent partout, et c'est lui qui relit la
          progression. */}
      <ScreenToast message={toast} onDismiss={() => setToast(null)} />

      {panelOpen && <PlayerDrawer onClose={closeNow} onPointerEnter={holdOpen} onPointerLeave={releaseOpen} />}
      {optionsOpen && <SettingsDialog isSignedIn={signedIn} onClose={() => setOptionsOpen(false)} />}
    </>
  );
}
