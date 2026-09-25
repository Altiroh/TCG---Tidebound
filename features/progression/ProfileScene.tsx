"use client";

import { useState, useTransition, type ReactNode } from "react";
import { getCardDefinition } from "@/game";
import {
  LOGIN_CYCLE_LENGTH,
  LOGIN_STREAK_MILESTONE,
  MAX_REWARDED_LEVEL,
  levelRewardItems,
  loginBoosterName,
  loginRewardForStep,
  loginRewardLabel,
} from "@/game/progression";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import { claimDailyLogin, updateProfileIdentity, type ProfileSummary } from "@/features/progression/profileActions";
import { loginGainsText } from "@/features/progression/dailyLogin";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { PreconToken, TideCoin } from "@/features/shell/GameIcons";
import styles from "@/features/progression/ProfileScene.module.css";
import { playButtonClick, playRewardClaimed } from "@/lib/sound";

interface ProfileSceneProps {
  profile: ProfileSummary;
  /** Titre porté, en toutes lettres, ou `null`. */
  titleName: string | null;
  /** Récompenses en attente, toutes familles confondues (bouton « Tout réclamer »). */
  waitingTotal: number;
  claimingAll: boolean;
  onClaimAll: () => void;
  onPickIllustration: () => void;
  onPickTitle: () => void;
  /** « Toute la route » : l'onglet des récompenses de niveau. */
  onShowRoute: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}

/** Nom lisible d'une carte, son identifiant à défaut — jamais d'exception à l'affichage. */
function cardName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

/** Arc de progression du niveau : rayon et périmètre dans le repère 100 × 100 de l'anneau. */
const RING_RADIUS = 32.5;
const RING_PERIMETER = 2 * Math.PI * RING_RADIUS;

/**
 * L'onglet PROFIL de la page `/profil` : une scène montée en calques sur la
 * cabine du navire (`public/assets/profile/`), à la place des panneaux du
 * carnet de bord — photo du joueur, anneau de niveau, quatre losanges de
 * ressources, route des prochains paliers et escales de connexion.
 *
 * Tout est posé en pourcentages d'une SCÈNE au format de la maquette
 * (1855 × 778, bandeau exclu), et les textes en `cqw` de cette scène : la
 * composition reste celle de la référence du 2560 × 1440 au téléphone en
 * paysage. Les zones se remesurent sur la maquette, pas à l'œil.
 */
export function ProfileScene({
  profile,
  titleName,
  waitingTotal,
  claimingAll,
  onClaimAll,
  onPickIllustration,
  onPickTitle,
  onShowRoute,
  onRefresh,
  onSignOut,
  signingOut,
}: ProfileSceneProps) {
  const { view, login } = profile;

  return (
    <div className={styles.page}>
      <div className={styles.stage}>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local, posé sous tout le reste */}
        <img className={styles.cannon} src="/assets/profile/cannon.webp" alt="" draggable={false} />

        <Polaroid profile={profile} titleName={titleName} onPickIllustration={onPickIllustration} onPickTitle={onPickTitle} onRefresh={onRefresh} />

        <section className={styles.ring} aria-label={`Niveau ${view.level}`}>
          <svg className={styles.ringArc} viewBox="0 0 100 100" aria-hidden>
            <circle className={styles.ringTrack} cx="50" cy="50" r={RING_RADIUS} />
            <circle
              className={styles.ringFill}
              cx="50"
              cy="50"
              r={RING_RADIUS}
              strokeDasharray={`${RING_PERIMETER * view.ratio} ${RING_PERIMETER}`}
            />
          </svg>
          <div className={styles.ringText}>
            <span className={styles.ringCaption}>Niveau</span>
            <span className={styles.ringLevel}>{view.level}</span>
            <span className={styles.ringXp}>
              {view.xpIntoLevel} / {view.xpForNextLevel} XP
            </span>
            <span className={styles.ringRule} aria-hidden />
            <span className={styles.ringNext}>
              {profile.maxRewardedLevelReached ? (
                <>Niveau {MAX_REWARDED_LEVEL} atteint</>
              ) : (
                <>
                  Encore {view.xpToNextLevel} XP
                  <br />
                  avant le niveau {view.level + 1}
                </>
              )}
            </span>
          </div>
        </section>

        <Diamond slot={1} value={profile.balance} label="Tides" icon={<TideCoin size={64} />} />
        <Diamond slot={2} value={profile.preconTokens} label="Jeton de Préconstruit" icon={<PreconToken size={64} />} />
        <Diamond
          slot={3}
          value={profile.matchesPlayed}
          label="Parties"
          // eslint-disable-next-line @next/next/no-img-element -- icône locale
          icon={<img src="/assets/profile/icon-parties.webp" alt="" draggable={false} />}
        />
        <Diamond
          slot={4}
          value={login.streak}
          label="Jours d'affilée"
          title={`Série de connexion — record : ${login.bestStreak}. Encore ${login.daysToStreakBonus} escale${login.daysToStreakBonus > 1 ? "s" : ""} d'affilée pour une carte Abyssale (tous les ${LOGIN_STREAK_MILESTONE} jours).`}
          // eslint-disable-next-line @next/next/no-img-element -- icône locale
          icon={<img src="/assets/profile/icon-streak.webp" alt="" draggable={false} />}
        />

        <section className={styles.route} aria-label="Prochaines escales">
          <header className={styles.routeHead}>
            <h2 className={styles.routeTitle}>Prochaines escales</h2>
            <button
              type="button"
              className={styles.routeLink}
              onClick={() => {
                playButtonClick();
                onShowRoute();
              }}
            >
              Toute la route <span aria-hidden>→</span>
            </button>
          </header>
          {profile.upcomingMilestones.length === 0 ? (
            <p className={styles.routeEmpty}>Tous les paliers de cette version sont franchis.</p>
          ) : (
            <ol className={styles.routeList}>
              {profile.upcomingMilestones.map((milestone) => (
                <li key={milestone.level} className={styles.routeRow}>
                  <span className={styles.routeLevel}>{milestone.level}</span>
                  <span className={styles.routeIcons}>
                    {levelRewardItems(milestone.level)
                      .slice(0, 2)
                      .map((item, index) => (
                        <RewardIcon key={index} item={item} size={30} />
                      ))}
                  </span>
                  <span className={styles.routeLabel}>{milestone.label}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <LoginPanel profile={profile} waitingTotal={waitingTotal} claimingAll={claimingAll} onClaimAll={onClaimAll} onRefresh={onRefresh} />

        <button type="button" className={styles.signOut} onClick={onSignOut} disabled={signingOut}>
          {signingOut ? "Déconnexion…" : "Se déconnecter"}
        </button>
      </div>
    </div>
  );
}

/* ── La photo ─────────────────────────────────────────────────────── */

function Polaroid({
  profile,
  titleName,
  onPickIllustration,
  onPickTitle,
  onRefresh,
}: Pick<ProfileSceneProps, "profile" | "titleName" | "onPickIllustration" | "onPickTitle" | "onRefresh">) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = profile.displayName ?? "Marin";

  function save() {
    playButtonClick();
    const trimmed = draft.trim();
    if (trimmed === (profile.displayName ?? "")) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateProfileIdentity({ displayName: trimmed });
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
      setEditing(false);
      notifyProgressionChanged();
      onRefresh();
    });
  }

  return (
    <section className={styles.photo} aria-label="Identité">
      {/* eslint-disable-next-line @next/next/no-img-element -- cadre local */}
      <img className={styles.photoFrame} src="/assets/profile/photo-frame.webp" alt="" draggable={false} />
      {/* La fenêtre de la photo : l'illustration choisie, inclinée comme le cadre. Sans choix, le portrait peint reste. */}
      <button
        type="button"
        className={styles.photoWindow}
        style={profile.avatarCardId ? { backgroundImage: `url("${cardIllustrationThumbUrl(profile.avatarCardId)}")` } : undefined}
        data-empty={profile.avatarCardId ? undefined : ""}
        onClick={() => {
          playButtonClick();
          onPickIllustration();
        }}
        aria-label={profile.avatarCardId ? `Illustration : ${cardName(profile.avatarCardId)} — changer` : "Choisir une illustration"}
        title={profile.avatarCardId ? `${cardName(profile.avatarCardId)} — changer d'illustration` : "Choisir une illustration"}
      />
      <div className={styles.photoCaption}>
        {editing ? (
          <span className={styles.nameEdit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setDraft(profile.displayName ?? "");
                  setEditing(false);
                }
              }}
              aria-label="Pseudo"
              className={styles.nameInput}
              maxLength={24}
              autoFocus
            />
            <button type="button" className={styles.nameSave} onClick={save} disabled={pending} aria-label="Valider le pseudo">
              {pending ? "…" : "✓"}
            </button>
          </span>
        ) : (
          <span className={styles.nameRow}>
            <span className={styles.name}>{name}</span>
            <button
              type="button"
              className={styles.pencil}
              onClick={() => {
                playButtonClick();
                setDraft(profile.displayName ?? "");
                setEditing(true);
              }}
              aria-label="Changer de pseudo"
              title="Changer de pseudo"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        )}
        <button
          type="button"
          className={styles.title}
          onClick={() => {
            playButtonClick();
            onPickTitle();
          }}
          title={titleName ? "Changer de titre" : "Choisir un titre"}
        >
          {titleName ?? "Choisir un titre"}
        </button>
        {error && <span className={styles.nameError}>{error}</span>}
      </div>
    </section>
  );
}

/* ── Les losanges ─────────────────────────────────────────────────── */

function Diamond({ slot, value, label, icon, title }: { slot: 1 | 2 | 3 | 4; value: number; label: string; icon: ReactNode; title?: string }) {
  return (
    <div className={styles.diamond} data-slot={slot} title={title}>
      <div className={styles.diamondBody}>
        <span className={styles.diamondIcon}>{icon}</span>
        <span className={styles.diamondValue}>{value}</span>
        <span className={styles.diamondLabel}>{label}</span>
      </div>
    </div>
  );
}

/* ── Les escales de connexion ─────────────────────────────────────── */

function LoginPanel({
  profile,
  waitingTotal,
  claimingAll,
  onClaimAll,
  onRefresh,
}: Pick<ProfileSceneProps, "profile" | "waitingTotal" | "claimingAll" | "onClaimAll" | "onRefresh">) {
  const { login } = profile;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function claim() {
    if (!login.claimable || pending) return;
    playButtonClick();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await claimDailyLogin();
      if (!result.ok) {
        setError(result.error ?? "Réclamation impossible.");
        return;
      }
      const gains = loginGainsText(result);
      playRewardClaimed();
      setMessage(gains ? `Escale franchie — ${gains}.` : "Escale franchie.");
      notifyProgressionChanged();
      onRefresh();
    });
  }

  return (
    <section className={styles.login} aria-label="Escales de connexion" data-claimable={login.claimable ? "" : undefined}>
      <header className={styles.loginHead}>
        <div>
          <h2 className={styles.loginTitle}>Escales de connexion</h2>
          <p className={styles.loginSub}>
            {message ?? error ?? (
              <>
                Sept escales, une par jour de retour. Cette semaine : booster {loginBoosterName(login.weekBoosterId)}.
              </>
            )}
          </p>
        </div>
        {waitingTotal > 0 && (
          <button type="button" className={styles.claimAll} onClick={onClaimAll} disabled={claimingAll}>
            {claimingAll ? "…" : `Tout réclamer (${waitingTotal})`}
          </button>
        )}
      </header>

      <ol className={styles.loginCells}>
        {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => {
          const items = login.cycle[step - 1] ?? loginRewardForStep(step);
          const label = items.map(loginRewardLabel).join(" · ");
          const current = step === login.step;
          const passed = step < login.step;
          const claimable = current && login.claimable;
          return (
            <li key={step} className={styles.loginCell} data-state={current ? "current" : passed ? "passed" : "next"} data-claimable={claimable ? "" : undefined}>
              <button
                type="button"
                className={styles.loginCellButton}
                onClick={claim}
                disabled={!claimable || pending}
                title={claimable ? `Réclamer : ${label}` : label}
              >
                <span className={styles.loginIndex}>
                  {step}
                  {passed && (
                    <svg className={styles.loginCheck} viewBox="0 0 24 24" fill="none" aria-label="franchie">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={styles.loginIcon}>
                  {items.slice(0, 1).map((item, itemIndex) => (
                    <RewardIcon key={itemIndex} item={item} size={40} />
                  ))}
                </span>
                <span className={styles.loginLabel}>{claimable ? (pending ? "…" : "Réclamer") : label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Le fil des escales : une perle par jour, celle du jour cerclée. */}
      <div className={styles.loginTrack} aria-hidden>
        {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => (
          <span key={step} className={styles.loginDot} data-state={step === login.step ? "current" : step < login.step ? "passed" : "next"} />
        ))}
      </div>
    </section>
  );
}
