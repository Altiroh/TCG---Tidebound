"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loginRewardLabel } from "@/game/progression";
import type { MasteryView } from "@/features/progression/hubService";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import styles from "@/features/progression/HubSheets.module.css";
import { playButtonClick } from "@/lib/sound";

/** Fenêtre plein écran des extensions du hub : fermée par Échap, le fond ou la croix. */
function Sheet({
  title,
  subtitle,
  actions,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Boutons de l'en-tête, à gauche de la croix (« Tout réclamer »). */
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div className={styles.sheet} role="dialog" aria-modal aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <div className={styles.headActions}>
            {actions}
            <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ── Toutes les maîtrises ──────────────────────────────────────────── */

/**
 * Tous les Navires, à la manière du hub : ceux qui ont un palier à réclamer
 * d'abord, puis les plus joués ; ceux jamais menés restent visibles, dans
 * l'ombre. Un bouton par Navire réclame TOUS ses paliers en attente, et
 * « Tout réclamer » ceux de toute la flotte.
 */
export function MasteriesSheet({
  masteries,
  busy,
  onClaim,
  onClaimAll,
  onClose,
}: {
  masteries: MasteryView[];
  busy: boolean;
  onClaim: (mastery: MasteryView) => void;
  onClaimAll: () => void;
  onClose: () => void;
}) {
  const pending = masteries.reduce((sum, mastery) => sum + mastery.claimableLevels.length, 0);
  const ships = masteries.filter((mastery) => mastery.claimableLevels.length > 0).length;
  const ordered = [...masteries].sort((a, b) => Number(b.claimableLevels.length > 0) - Number(a.claimableLevels.length > 0));
  return (
    <Sheet
      title="Maîtrises"
      subtitle={
        pending > 0 ? (
          <>
            <strong>
              {pending} palier{pending > 1 ? "s" : ""} à réclamer
            </strong>{" "}
            sur {ships} Navire{ships > 1 ? "s" : ""}. Chaque Navire progresse avec l&apos;XP des parties jouées à son bord.
          </>
        ) : (
          "Chaque Navire progresse avec l'XP des parties jouées à son bord. Une récompense à chaque niveau."
        )
      }
      actions={
        pending > 0 && (
          <button
            type="button"
            className={styles.claimAll}
            disabled={busy}
            onClick={() => {
              playButtonClick();
              onClaimAll();
            }}
          >
            Tout réclamer ({pending})
          </button>
        )
      }
      onClose={onClose}
    >
      <ul className={styles.shipGrid}>
        {ordered.map((mastery) => {
          const claimable = mastery.claimableLevels;
          const ratio = mastery.xpForNext ? mastery.xpInto / mastery.xpForNext : 1;
          return (
            <li key={mastery.shipId} className={styles.ship} data-unplayed={mastery.matchesPlayed === 0 || undefined} data-claimable={claimable.length ? "" : undefined}>
              <span
                className={styles.shipArt}
                style={mastery.illustration ? { backgroundImage: `url("${shipIllustrationUrl(mastery.illustration)}")` } : undefined}
                aria-hidden
              />
              {claimable.length > 0 && <span className={styles.notif} aria-label="Palier à réclamer" />}
              <span className={styles.shipBody}>
                <span className={styles.shipHead}>
                  <span className={styles.shipLevel} aria-label={`Niveau ${mastery.level}`}>
                    {mastery.level}
                  </span>
                  <span className={styles.shipTitle}>
                    <span className={styles.shipName} title={mastery.shipName}>
                      {mastery.shipName}
                    </span>
                    <span className={styles.shipPlayed}>
                      {mastery.matchesPlayed === 0 ? "Jamais mené" : `${mastery.matchesPlayed} partie${mastery.matchesPlayed > 1 ? "s" : ""}`}
                    </span>
                  </span>
                </span>
                <span className={styles.meter}>
                  <span className={styles.meterFill} style={{ width: `${ratio * 100}%` }} />
                </span>
                <span className={styles.shipXp}>{mastery.xpForNext ? `${mastery.xpInto} / ${mastery.xpForNext} XP` : "Maîtrise complète"}</span>
                {mastery.nextRewardLevel && (
                  <span className={styles.shipReward}>
                    <span className={styles.shipRewardIcons}>
                      {mastery.nextReward.map((item, index) => (
                        <RewardIcon key={index} item={item} size={30} />
                      ))}
                    </span>
                    <span className={styles.shipRewardText}>
                      <span className={styles.shipRewardLevel}>{claimable.length ? `Niveau ${claimable[0]}` : `Prochain : niveau ${mastery.nextRewardLevel}`}</span>
                      <span className={styles.shipRewardLabel}>{mastery.nextReward.map(loginRewardLabel).join(" · ")}</span>
                    </span>
                  </span>
                )}
                {claimable.length > 0 ? (
                  <button
                    type="button"
                    className={styles.claim}
                    disabled={busy}
                    onClick={() => {
                      playButtonClick();
                      onClaim(mastery);
                    }}
                  >
                    {claimable.length > 1 ? `Réclamer ${claimable.length} paliers` : `Réclamer le niveau ${claimable[0]}`}
                  </button>
                ) : (
                  <span className={styles.stageState}>{mastery.nextRewardLevel ? "En route" : "Complète"}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
