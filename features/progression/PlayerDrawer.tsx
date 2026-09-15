"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { LOGIN_CYCLE_LENGTH, loginStepLabel, MAX_REWARDED_LEVEL } from "@/game/progression";
import { claimDailyLogin, fetchProfile, type ProfileSummary } from "@/features/progression/profileActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { QuestList } from "@/features/quests/QuestList";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import styles from "@/features/progression/PlayerDrawer.module.css";
import { playButtonClick } from "@/lib/sound";

interface PlayerDrawerProps {
  /** Le panneau se referme : survol quitté, Échap, ou clic à côté. */
  onClose: () => void;
  /** Le curseur est entré dans le panneau — le survol du bandeau ne le ferme plus. */
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * CARNET DE BORD — le panneau du joueur, glissé depuis la droite au survol
 * de son avatar dans le bandeau.
 *
 * Il remplace le tiroir de quêtes, qui ne montrait qu'un tiers de ce qui
 * intéresse entre deux parties : niveau et XP, escales de connexion,
 * quêtes, exploits et statistiques sont désormais au même endroit, à un
 * survol de distance depuis n'importe quel écran.
 *
 * NON MODAL, et c'est une conséquence directe du survol : un panneau qui
 * s'ouvre sans qu'on l'ait demandé ne doit jamais bloquer ce qu'on était en
 * train de faire. Pas de voile opaque, pas de piège au clavier — il se
 * ferme dès que le curseur s'en va.
 *
 * Il ne MODIFIE rien du profil (pseudo, illustration, dos de carte) : ce
 * sont des réglages, ils restent sur `/profil`, à un lien d'ici. Seules les
 * deux actions d'un clic — encaisser une quête, franchir l'escale du jour —
 * sont ici, parce que les faire chercher serait cacher ce qui est acquis.
 */
export function PlayerDrawer({ onClose, onPointerEnter, onPointerLeave }: PlayerDrawerProps) {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((result) => !cancelled && setProfile(result))
      .catch((cause) => {
        console.error("[PlayerDrawer] Lecture du profil impossible :", cause);
        if (!cancelled) setError("Ton carnet de bord n'a pas pu être chargé.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Échap ferme, comme tout panneau superposé.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clic AILLEURS : le panneau est non modal, rien ne l'arrête sinon.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  function claimLogin() {
    playButtonClick();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await claimDailyLogin();
      if (!result.ok) {
        setError(result.error ?? "Réclamation impossible.");
        return;
      }
      const gains = [result.tides ? `+${result.tides} Tides` : "", result.xp ? `+${result.xp} XP` : "", result.boosterId ? "1 booster" : ""]
        .filter(Boolean)
        .join(" · ");
      setNotice(gains ? `Escale franchie — ${gains}.` : "Escale franchie.");
      notifyProgressionChanged();
      // Relecture plutôt que correction à la main : l'escale touche à la
      // fois le solde, l'XP, le niveau et l'étape du cycle.
      void fetchProfile().then(setProfile);
    });
  }

  if (!mounted) return null;

  const view = profile?.view;
  const unlocked = profile?.achievements.filter((achievement) => achievement.unlocked).length ?? 0;

  return createPortal(
    <aside
      ref={panelRef}
      className={styles.drawer}
      role="dialog"
      aria-label="Carnet de bord"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <header className={styles.head}>
        {/* L'illustration TELLE QUELLE : c'est un trophée, pas un fond de
            plaque — aucun voile bleu par-dessus. */}
        {profile?.avatarCardId ? (
          <span className={styles.avatar} style={{ backgroundImage: `url("${cardIllustrationUrl(profile.avatarCardId)}")` }} aria-hidden />
        ) : (
          <span className={styles.avatarEmpty} aria-hidden>
            {(profile?.displayName?.trim()?.[0] ?? "?").toUpperCase()}
          </span>
        )}
        <div className={styles.headText}>
          <span className={styles.name}>{profile?.displayName ?? "…"}</span>
          {view && <span className={styles.levelLine}>Niveau {view.level}</span>}
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>

      <div className={styles.body}>
        {error && <p className={styles.error}>{error}</p>}
        {notice && <p className={styles.notice}>{notice}</p>}

        {profile === null && !error && <p className={styles.muted}>Chargement…</p>}

        {profile && !profile.isSignedIn && (
          <p className={styles.muted}>
            Connecte-toi pour suivre ta progression. <Link href="/connexion" className={styles.more}>Se connecter →</Link>
          </p>
        )}

        {profile?.isSignedIn && view && (
          <>
            {/* ── Niveau et XP ─────────────────────────────────── */}
            <section className={styles.section} aria-label="Niveau">
              <div className={styles.xpTrack} role="progressbar" aria-valuenow={view.xpIntoLevel} aria-valuemin={0} aria-valuemax={view.xpForNextLevel}>
                <span className={styles.xpFill} style={{ width: `${view.ratio * 100}%` }} />
              </div>
              <p className={styles.xpLine}>
                <span>
                  {view.xpIntoLevel} / {view.xpForNextLevel} XP
                </span>
                <span>
                  {profile.maxRewardedLevelReached
                    ? `Niveau ${MAX_REWARDED_LEVEL} atteint`
                    : `Encore ${view.xpToNextLevel} avant le ${view.level + 1}`}
                </span>
              </p>
              {!profile.maxRewardedLevelReached && (
                <p className={styles.muted}>
                  Prochain palier — <strong>{profile.nextLevelReward}</strong>
                </p>
              )}

              <ul className={styles.stats}>
                <Stat value={profile.balance} label="Tides" />
                <Stat value={profile.matchesPlayed} label="Parties" />
                <Stat value={`${unlocked} / ${profile.achievements.length}`} label="Exploits" />
                <Stat
                  value={profile.playStreak.current}
                  label={`Jour${profile.playStreak.current > 1 ? "s" : ""} d'affilée`}
                  title={`Meilleure série tenue : ${profile.playStreak.best}`}
                />
              </ul>
            </section>

            {/* ── Escales de connexion ─────────────────────────── */}
            <section className={styles.section} aria-label="Escales de connexion">
              <h3 className={styles.sectionTitle}>Escales de connexion</h3>
              <ol className={styles.cycle}>
                {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => (
                  <li
                    key={step}
                    className={step === profile.login.step ? styles.stepCurrent : step < profile.login.step ? styles.stepPassed : styles.step}
                    title={loginStepLabel(step)}
                  >
                    {step}
                  </li>
                ))}
              </ol>
              <button type="button" className={styles.claim} onClick={claimLogin} disabled={!profile.login.claimable || isPending}>
                {profile.login.claimable ? `Réclamer — ${loginStepLabel(profile.login.step)}` : "Escale du jour déjà franchie"}
              </button>
            </section>

            {/* ── Quêtes ───────────────────────────────────────── */}
            <section className={styles.section} aria-label="Quêtes">
              <h3 className={styles.sectionTitle}>Quêtes</h3>
              <QuestList />
            </section>

            {/* ── Prochaines escales de niveau ─────────────────── */}
            {profile.upcomingMilestones.length > 0 && (
              <section className={styles.section} aria-label="Prochains paliers">
                <h3 className={styles.sectionTitle}>Prochaines escales</h3>
                <ul className={styles.route}>
                  {profile.upcomingMilestones.map((stop) => (
                    <li key={stop.level} className={styles.stop}>
                      <span className={styles.stopLevel}>{stop.level}</span>
                      <span>{stop.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {/* Le carnet complet garde ce que le panneau laisse de côté : pseudo,
          illustration, dos de carte, sillage, catalogue d'exploits. */}
      <Link href="/profil" className={styles.more} onClick={() => { playButtonClick(); onClose(); }}>
        Carnet de bord complet →
      </Link>
    </aside>,
    document.body
  );
}

function Stat({ value, label, title }: { value: number | string; label: string; title?: string }) {
  return (
    <li className={styles.stat} title={title}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </li>
  );
}
