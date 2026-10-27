"use client";

import { useState, useTransition, type ReactNode } from "react";
import { getCardDefinition, profileFrameSrc } from "@/game";
import { LOGIN_STREAK_MILESTONE, MAX_REWARDED_LEVEL, levelRewardItems } from "@/game/progression";
import { cardArtworkThumbUrl } from "@/features/decks/cardArtUrl";
import { updateProfileIdentity, type ProfileSummary } from "@/features/progression/profileActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { PreconToken, TideCoin } from "@/features/shell/GameIcons";
import styles from "@/features/progression/ProfileScene.module.css";
import { playButtonClick } from "@/lib/sound";

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
 * ressources, route des prochains paliers. Les escales de connexion vivent
 * dans Récompenses (13/10/2026) : seul « Tout réclamer » reste ici.
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
          <h2 className={styles.routeTitle}>Prochaines escales</h2>
          {profile.upcomingMilestones.length === 0 ? (
            <p className={styles.routeEmpty}>Tous les paliers de cette version sont franchis.</p>
          ) : (
            <ol className={styles.routeList}>
              {profile.upcomingMilestones.map((milestone) => (
                <li key={milestone.level} className={styles.routeRow}>
                  <span className={styles.routeLevel} aria-label={`Niveau ${milestone.level}`}>
                    {milestone.level}
                  </span>
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
          {/* Le lien au pied du parchemin : en tête, il poussait le titre sur deux lignes. */}
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
        </section>

        {/* Les escales de connexion vivent dans Récompenses (13/10/2026 : elles étaient en double ici). Reste, au même
            endroit, le geste qui réclame tout ce qui attend. */}
        {waitingTotal > 0 && (
          <div className={styles.claimAllDock}>
            <button
              type="button"
              className={styles.claimAll}
              onClick={onClaimAll}
              disabled={claimingAll}
              aria-busy={claimingAll || undefined}
              aria-label={`Tout réclamer : ${waitingTotal} récompense${waitingTotal > 1 ? "s" : ""} en attente`}
            >
              {/* Un coffre entrouvert, d'où l'or déborde. */}
              <svg className={styles.claimAllIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3.5 10.5h17v8.2a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3v-8.2Z" fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
                <path d="M3.5 10.5 5 6.2A1.6 1.6 0 0 1 6.5 5h11a1.6 1.6 0 0 1 1.5 1.2l1.5 4.3" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
                <path d="M10.3 10.5v2.6h3.4v-2.6" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
                <circle cx="8" cy="3.6" r="1.3" fill="currentColor" />
                <circle cx="12.5" cy="2.8" r="1.1" fill="currentColor" />
                <circle cx="16.4" cy="3.8" r="1.2" fill="currentColor" />
              </svg>
              <span className={styles.claimAllLabel}>{claimingAll ? "Ouverture…" : "Tout réclamer"}</span>
              {!claimingAll && <span className={styles.claimAllSeal}>{waitingTotal}</span>}
            </button>
          </div>
        )}

        {/* La sortie : une plaque sombre à liseré de laiton, posée sur le pont près du canon. */}
        <button type="button" className={styles.signOut} onClick={onSignOut} disabled={signingOut} aria-busy={signingOut || undefined}>
          <svg className={styles.signOutIcon} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="11" cy="12" r="0.9" fill="currentColor" />
          </svg>
          <span>{signingOut ? "Déconnexion…" : "Se déconnecter"}</span>
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
      <img className={styles.photoFrame} src={profileFrameSrc(profile.profileFrameId)} alt="" draggable={false} />
      {/* La fenêtre de la photo : l'illustration choisie, inclinée comme le cadre. Sans choix, le portrait peint reste. */}
      <button
        type="button"
        className={styles.photoWindow}
        style={profile.avatarCardId ? { backgroundImage: `url("${cardArtworkThumbUrl(profile.avatarCardId, profile.avatarArtwork)}")` } : undefined}
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

