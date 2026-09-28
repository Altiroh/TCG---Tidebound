"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loginRewardLabel } from "@/game/progression";
import type { MasteryView } from "@/features/progression/hubService";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import styles from "@/features/progression/HubSheets.module.css";

/** Fenêtre plein écran des extensions du hub : fermée par Échap, le fond ou la croix. */
function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
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
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ── Toutes les maîtrises ──────────────────────────────────────────── */

/** Tous les Navires, les plus joués d'abord — ceux jamais menés restent visibles, dans l'ombre. */
export function MasteriesSheet({
  masteries,
  busy,
  onClaim,
  onClose,
}: {
  masteries: MasteryView[];
  busy: boolean;
  onClaim: (mastery: MasteryView, level: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Maîtrises" subtitle="Chaque Navire progresse avec l'XP des parties jouées à son bord. Une récompense à chaque niveau." onClose={onClose}>
      <ul className={styles.shipGrid}>
        {masteries.map((mastery) => {
          const claimLevel = mastery.claimableLevels[0];
          return (
            <li key={mastery.shipId} className={styles.ship} data-unplayed={mastery.matchesPlayed === 0 || undefined} data-claimable={claimLevel ? "" : undefined}>
              <span
                className={styles.shipArt}
                style={mastery.illustration ? { backgroundImage: `url("${shipIllustrationUrl(mastery.illustration)}")` } : undefined}
                aria-hidden
              />
              <span className={styles.shipLevel}>{mastery.level}</span>
              {claimLevel && <span className={styles.notif} aria-label="Palier à réclamer" />}
              <span className={styles.shipBody}>
                <span className={styles.shipName}>{mastery.shipName}</span>
                <span className={styles.shipPlayed}>
                  {mastery.matchesPlayed === 0 ? "Jamais mené" : `${mastery.matchesPlayed} partie${mastery.matchesPlayed > 1 ? "s" : ""}`}
                </span>
                <span className={styles.meter}>
                  <span className={styles.meterFill} style={{ width: `${mastery.xpForNext ? (mastery.xpInto / mastery.xpForNext) * 100 : 100}%` }} />
                </span>
                <span className={styles.shipXp}>{mastery.xpForNext ? `${mastery.xpInto} / ${mastery.xpForNext} XP` : "Maîtrise complète"}</span>
                <span className={styles.shipFoot}>
                  <span className={styles.shipReward} title={mastery.nextRewardLevel ? `Niveau ${mastery.nextRewardLevel} : ${mastery.nextReward.map(loginRewardLabel).join(" · ")}` : undefined}>
                    {mastery.nextReward.map((item, index) => (
                      <RewardIcon key={index} item={item} size={30} />
                    ))}
                  </span>
                  {claimLevel ? (
                    <button type="button" className={styles.giftButton} disabled={busy} onClick={() => onClaim(mastery, claimLevel)}>
                      Réclamer niv. {claimLevel}
                    </button>
                  ) : (
                    <span className={styles.stageState}>{mastery.nextRewardLevel ? `Prochain : niv. ${mastery.nextRewardLevel}` : "Complète"}</span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
