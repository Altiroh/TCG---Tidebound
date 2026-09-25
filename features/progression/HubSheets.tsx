"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SPONSOR_STAGES, SPONSORS_UNLOCK_LEVEL, loginRewardLabel, sponsorGift, sponsorGiftStagesReached } from "@/game/progression";
import type { AudienceView, MasteryView, SponsorView } from "@/features/progression/hubService";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import styles from "@/features/progression/HubSheets.module.css";
import { playButtonClick } from "@/lib/sound";

/** Fenêtre plein écran des extensions du hub : fermée par Échap, le fond ou la croix. */
function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
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

/* ── Les mécènes, en grand ─────────────────────────────────────────── */

/**
 * Tous les mécènes : à gauche leurs insignes, à droite celui qu'on regarde
 * — portrait, qui il est, ce qui l'attire, son histoire, l'audience qu'il
 * attend, ses paliers d'intérêt et les colis de chacun. Un mécène qui ne
 * s'est pas encore fait connaître reste une silhouette : on sait seulement
 * combien de spectateurs il attend.
 */
export function SponsorsSheet({
  sponsors,
  audience,
  unlocked,
  busy,
  onOpenGift,
  onClose,
}: {
  sponsors: SponsorView[];
  audience: AudienceView;
  unlocked: boolean;
  busy: boolean;
  onOpenGift: (sponsor: SponsorView) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(sponsors[0]?.id ?? null);
  const sponsor = sponsors.find((entry) => entry.id === selectedId) ?? sponsors[0];

  return (
    <Sheet
      title="Mécènes"
      subtitle={
        <>
          Le public vous regarde — <strong>{audience.audience.toLocaleString("fr-FR")}</strong> spectateurs. Certains, derrière lui, vous observent
          {unlocked ? "." : ` : ils remarquent les marins à partir du niveau ${SPONSORS_UNLOCK_LEVEL}.`}
        </>
      }
      onClose={onClose}
    >
      <div className={styles.sponsorsLayout}>
        <ul className={styles.sponsorList}>
          {sponsors.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={styles.sponsorTab}
                data-color={entry.color}
                data-active={entry.id === sponsor?.id || undefined}
                onClick={() => {
                  playButtonClick();
                  setSelectedId(entry.id);
                }}
              >
                <span className={styles.insignia} data-hidden={!entry.name || undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- insigne local */}
                  <img src={`/assets/mecenes/${entry.id}-insigne.webp`} alt="" draggable={false} />
                </span>
                <span className={styles.tabText}>
                  <span className={styles.tabName}>{entry.name ?? (entry.watching ? "Quelqu'un vous observe…" : "Un regard dans la foule")}</span>
                  <span className={styles.tabStage}>{entry.meetsAudience ? entry.stageLabel : `Attend ${entry.audienceRequired.toLocaleString("fr-FR")} spectateurs`}</span>
                </span>
                {entry.giftStages.length > 0 && <span className={styles.notif} aria-label="Colis à ouvrir" />}
              </button>
            </li>
          ))}
        </ul>

        {sponsor && <SponsorDetail sponsor={sponsor} audience={audience.audience} busy={busy} onOpenGift={onOpenGift} />}
      </div>
    </Sheet>
  );
}

function SponsorDetail({ sponsor, audience, busy, onOpenGift }: { sponsor: SponsorView; audience: number; busy: boolean; onOpenGift: (sponsor: SponsorView) => void }) {
  const revealed = Boolean(sponsor.name);
  const reached = new Set(sponsorGiftStagesReached(sponsor.points));
  const waiting = new Set(sponsor.giftStages);
  const audienceRatio = Math.min(1, audience / sponsor.audienceRequired);

  return (
    <article className={styles.detail} data-color={sponsor.color}>
      <div className={styles.portrait} data-hidden={!revealed || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- portrait local */}
        <img src={`/assets/mecenes/${sponsor.id}.webp`} alt="" draggable={false} />
        {!revealed && <span className={styles.portraitMystery}>?</span>}
      </div>

      <div className={styles.detailBody}>
        <h3 className={styles.detailName}>{sponsor.name ?? "Un mécène inconnu"}</h3>
        {revealed ? (
          <>
            <p className={styles.detailFigure}>{sponsor.figure}</p>
            <p className={styles.detailAttraction}>
              <span>Ce qui l&apos;attire</span> {sponsor.style}
            </p>
            <p className={styles.detailLore}>{sponsor.lore}</p>
          </>
        ) : (
          <p className={styles.detailLore}>
            Il ne s&apos;est pas encore fait connaître. Attirez son regard — il se dévoilera quand il sera <strong>Intrigué</strong>.
          </p>
        )}

        <section className={styles.block} aria-label="Audience attendue">
          <h4>Audience</h4>
          <div className={styles.meter}>
            <span className={styles.meterFill} style={{ width: `${audienceRatio * 100}%` }} />
          </div>
          <p className={styles.meterLine}>
            {sponsor.meetsAudience
              ? `Votre public (${audience.toLocaleString("fr-FR")}) lui suffit : il vous regarde.`
              : `Il attend ${sponsor.audienceRequired.toLocaleString("fr-FR")} spectateurs — vous en avez ${audience.toLocaleString("fr-FR")}.`}
          </p>
        </section>

        <section className={styles.block} aria-label="Paliers d'intérêt">
          <h4>
            Intérêt <span className={styles.points}>{sponsor.points} pts</span>
          </h4>
          <ol className={styles.stages}>
            {SPONSOR_STAGES.filter((stage) => stage.id !== "indifferent").map((stage) => {
              const state = waiting.has(stage.id) ? "gift" : reached.has(stage.id) ? "done" : "locked";
              return (
                <li key={stage.id} className={styles.stage} data-state={state}>
                  <span className={styles.stageHead}>
                    <span className={styles.stageName}>{stage.label}</span>
                    <span className={styles.stagePoints}>{stage.minPoints} pts</span>
                  </span>
                  <span className={styles.stageGift}>
                    {sponsorGift(stage.id).map((item, index) => (
                      <span key={index} title={loginRewardLabel(item)}>
                        <RewardIcon item={item} size={40} />
                      </span>
                    ))}
                  </span>
                  {state === "gift" ? (
                    <button type="button" className={styles.giftButton} disabled={busy} onClick={() => onOpenGift(sponsor)}>
                      Ouvrir le colis
                    </button>
                  ) : (
                    <span className={styles.stageState}>{state === "done" ? "Colis ouvert" : "À venir"}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </article>
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
