"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { fetchProgression, type ProgressionSummary } from "@/features/progression/actions";
import { notifyProgressionChanged, onProgressionChanged, readProgression, rememberedProgression } from "@/features/progression/progressionSync";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import type { ProfileTab } from "@/features/progression/ProfileView";
import { PreconToken, TideCoin } from "@/features/shell/GameIcons";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import styles from "@/features/shell/ScreenShell.module.css";
import { playButtonClick } from "@/lib/sound";

/*
 * Tiroir de profil CHARGÉ À L'OUVERTURE (audit du 24/09) :
 * cet en-tête est sur chaque écran, et le profil — son sélecteur
 * d'illustration, ses exploits — tire tout le catalogue de cartes
 * (~370 Ko). Monté statiquement, il le faisait télécharger dès la page de
 * connexion, tiroir fermé.
 */
const ProfileDrawer = dynamic(() => import("@/features/progression/ProfileDrawer").then((m) => m.ProfileDrawer), {
  ssr: false,
});

/** Parchemin roulé — le journal de bord, pas une coche de logiciel. */
function QuestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
      <path
        d="M6.5 3.5h9.2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2.5 2.5 0 0 1-2.5-2.5V6a2.5 2.5 0 0 1 2.5-2.5Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M8.6 8h6.4M8.6 11.4h6.4M8.6 14.8h4" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

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
  /** Profil ouvert en panneau, et sur quel onglet (`null` : fermé). */
  const [profileTab, setProfileTab] = useState<ProfileTab | null>(null);
  /** Dernier nombre de récompenses à réclamer VU — même principe que les quêtes. */
  const lastRewards = useRef<number | null>(null);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
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
    const load = (force: boolean) => {
      const request = ++latest;
      // Lecture partagée (`readProgression`) : mémorisée même si ce bandeau
      // a été démonté entre-temps, et réutilisée par le suivant tant
      // qu'elle est fraîche. Déconnecté : on n'en garde rien.
      readProgression(fetchProgression, force)
        .then((result) => {
          if (cancelled || request !== latest) return;
          setSummary(result);
          announceNewQuests(result.claimableQuests);
          announceNewRewards(result.claimableRewards);
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
              // Les quêtes vivent dans l'onglet « Quêtes » du profil.
              setProfileTab("quetes");
            }}
          >
            Voir →
          </button>
        ),
      });
    }

    /**
     * Annonce les récompenses qui viennent d'arriver (un palier franchi en
     * fin de partie, typiquement). Les quêtes ont la priorité sur l'alerte :
     * une seule à la fois, et la pastille de l'avatar reste de toute façon.
     */
    function announceNewRewards(claimable: number) {
      const previous = lastRewards.current;
      lastRewards.current = claimable;
      if (previous === null || claimable <= previous) return;
      setToast((current) =>
        current
          ? current
          : {
              id: ++toastId.current,
              tone: "success",
              text: "Nouvelle récompense à réclamer au profil !",
              action: (
                <button
                  type="button"
                  className={styles.toastAction}
                  onClick={() => {
                    playButtonClick();
                    setToast(null);
                    setProfileTab("recompenses");
                  }}
                >
                  Réclamer →
                </button>
              ),
            }
      );
    }

    load(false);
    // Relecture après un achat, une quête réclamée… — cf. `progressionSync`.
    const unsubscribe = onProgressionChanged(() => load(true));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Joueur non connecté : la progression n'existe pas encore, on n'affiche
  // rien du tout plutôt qu'un niveau 1 trompeur.
  const signedIn = summary?.isSignedIn ?? false;

  /** Le profil s'ouvre en PANNEAU ; un clic molette ou Ctrl+clic garde la page `/profil`. */
  function openProfile(event: React.MouseEvent, tab: ProfileTab) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    playButtonClick();
    setProfileTab(tab);
  }

  return (
    <>
      {signedIn && summary && (
        <div className={styles.account}>
          {/* Avatar : l'illustration choisie au profil, sinon l'initiale du
              pseudo dans un jeton de laiton — jamais un rond vide, qui dirait
              qu'il manque quelque chose. Le jeton mène au profil, comme le
              pseudo. */}
          <Link
            href="/profil"
            className={styles.accountAvatarLink}
            aria-label={summary.claimableRewards > 0 ? `Profil — ${summary.claimableRewards} récompense${summary.claimableRewards > 1 ? "s" : ""} à réclamer` : "Profil"}
            onClick={(event) => openProfile(event, summary.claimableRewards > 0 ? "recompenses" : "carnet")}
          >
            {summary.avatarCardId ? (
              <span
                className={`${styles.accountAvatar} ${styles.accountAvatarArt}`}
                style={{ backgroundImage: `url("${cardIllustrationThumbUrl(summary.avatarCardId)}")` }}
              />
            ) : (
              <span className={styles.accountAvatar}>{avatarInitial(summary.displayName)}</span>
            )}
            {/* Pastille : quelque chose attend au profil. Elle pulse — c'est fait pour donner envie d'y aller. */}
            {summary.claimableRewards > 0 && (
              <span className={styles.rewardBadge} aria-hidden>
                {summary.claimableRewards}
              </span>
            )}
          </Link>

          <span className={styles.accountIdentity}>
            {/* Le pseudo mène au carnet de bord : niveau, paliers, escales
                de connexion, exploits (Notion « Progression joueur » §12). */}
            <Link href="/profil" className={styles.accountName} title={summary.displayName ?? undefined} onClick={(event) => openProfile(event, "carnet")}>
              {summary.displayName ?? "Joueur"}
            </Link>

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

          <span className={styles.accountWallet}>
            <span className={styles.accountTides} title="Tides — la monnaie du jeu">
              <TideCoin size={22} />
              {summary.balance}
            </span>
            {/* Jetons de Préconstruit : la seconde monnaie, et la seule
                façon de débloquer un deck. Elle vaut d'être lue d'un coup
                d'œil au même endroit que les Tides, pas seulement au
                profil. */}
            <span
              className={styles.accountTokens}
              title={`${summary.preconTokens} Jeton${summary.preconTokens > 1 ? "s" : ""} de Préconstruit`}
            >
              <PreconToken size={22} />
              {summary.preconTokens}
            </span>
          </span>
        </div>
      )}

      {/* Visiteur : la porte d'entrée du compte, là où le compte s'afficherait.
          Seulement une fois la lecture revenue — avant, on ne sait pas. */}
      {summary && !signedIn && (
        <Link href="/connexion" className={styles.signInLink} onClick={() => playButtonClick()}>
          Se connecter
        </Link>
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

      {profileTab && (
        <ProfileDrawer
          initialTab={profileTab}
          onClose={() => {
            setProfileTab(null);
            // Réclamations, pseudo, avatar : le bandeau relit en fermant.
            notifyProgressionChanged();
          }}
        />
      )}
      {optionsOpen && <SettingsDialog isSignedIn={signedIn} onClose={() => setOptionsOpen(false)} />}
    </>
  );
}
