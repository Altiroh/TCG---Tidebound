"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SPONSOR_STAGES, SPONSORS_UNLOCK_LEVEL, loginRewardLabel, sponsorGift, sponsorGiftStagesReached } from "@/game/progression";
import type { AudienceMilestoneView, AudienceView, SponsorView } from "@/features/progression/hubService";
import { RewardIcon } from "@/features/progression/RewardIcon";
import hubStyles from "@/features/progression/HubSheets.module.css";
import styles from "@/features/progression/SponsorsSheet.module.css";
import { Lantern } from "@/features/shell/Lantern";
import { playButtonClick } from "@/lib/sound";

const SCENE = "/assets/mecenes/scene";

/**
 * Place de chaque cadre photo sur le mur — une rangée en quinconce, dans
 * l'ordre des mécènes : coin haut-gauche (% de la largeur du mur et de sa
 * hauteur), inclinaison propre du cadre, et décalage de la respiration du
 * portrait pour qu'ils ne battent pas à l'unisson.
 */
const WALL: readonly { left: number; top: number; tilt: number; delay: number }[] = [
  { left: 0, top: 13, tilt: -6, delay: 0 },
  { left: 26.3, top: 0, tilt: 3, delay: -1.7 },
  { left: 52.7, top: 13, tilt: -3, delay: -3.1 },
  { left: 79, top: 0, tilt: 6, delay: -4.4 },
];

/**
 * LES MÉCÈNES, mis en scène (maquette du 28/09/2026) : un mur de cabine où
 * la télé retransmet le public EN DIRECT, une lanterne qu'on souffle et
 * rallume, et les mécènes épinglés en photos, leur insigne en médaille. Un
 * colis qui attend fait luire la photo de la couleur du mécène. Dessous,
 * l'audience qu'attend celui qu'on regarde et ses paliers d'intérêt.
 *
 * Rien ne défile : la scène (une planche de proportions fixes) se met à
 * l'échelle de la place qui reste ; sur un écran bas (téléphone couché),
 * elle passe à gauche et les encarts à droite.
 */
export function SponsorsSheet({
  sponsors,
  audience,
  milestones,
  unlocked,
  busy,
  onOpenGift,
  onClaimMilestone,
  onClose,
}: {
  sponsors: SponsorView[];
  audience: AudienceView;
  milestones: AudienceMilestoneView[];
  unlocked: boolean;
  busy: boolean;
  onOpenGift: (sponsor: SponsorView) => void;
  onClaimMilestone: (milestone: AudienceMilestoneView) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [lit, setLit] = useState(true);
  const [selectedId, setSelectedId] = useState(sponsors[0]?.id ?? null);
  const sponsor = sponsors.find((entry) => entry.id === selectedId) ?? sponsors[0];
  // Les paliers du public se détaillent dans le hub ; ici, seulement celui qui attend d'être ouvert.
  const milestone = milestones.find((entry) => entry.claimable);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div className={hubStyles.backdrop} data-side onClick={onClose} role="presentation">
      <div
        className={styles.panel}
        data-lit={lit || undefined}
        role="dialog"
        aria-modal
        aria-label="Mécènes"
        onClick={(event) => event.stopPropagation()}
      >
        <span className={styles.lanternLight} aria-hidden />
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
          ×
        </button>

        <div className={styles.body}>
          <header className={styles.head}>
            <h2 className={styles.title}>Mécènes</h2>
            <p className={styles.subtitle}>
              {unlocked ? "Derrière le public, certains vous observent." : `Ils remarquent les marins à partir du niveau ${SPONSORS_UNLOCK_LEVEL}.`}
            </p>
          </header>

          {/* La planche garde ses proportions et se loge dans la place restante ; la fumée déborde par-dessus le titre. */}
          <div className={styles.scene}>
            <div className={styles.board}>
              <Lantern lit={lit} onToggle={() => setLit((value) => !value)} litSrc={`${SCENE}/lanterne.webp`} outSrc={`${SCENE}/lanterne-eteinte.webp`} className={styles.lantern} />
              <LiveTv audience={audience} />
              {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
              <img className={styles.starfish} src={`${SCENE}/etoile-de-mer.webp`} alt="" draggable={false} />
              <ul className={styles.wall} aria-label="Mécènes">
                {sponsors.map((entry, index) => (
                  <SponsorPhoto
                    key={entry.id}
                    sponsor={entry}
                    place={WALL[index % WALL.length]!}
                    selected={entry.id === sponsor?.id}
                    busy={busy}
                    onSelect={() => {
                      playButtonClick();
                      setSelectedId(entry.id);
                    }}
                    onOpenGift={() => onOpenGift(entry)}
                  />
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.info}>
            {milestone && (
              <button type="button" className={styles.milestoneReady} disabled={busy} onClick={() => onClaimMilestone(milestone)}>
                Palier d&apos;audience « {milestone.label} » : ouvrir
              </button>
            )}
            {sponsor && <SponsorFocus sponsor={sponsor} audience={audience.audience} busy={busy} onOpenGift={onOpenGift} />}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── La télé ───────────────────────────────────────────────────────── */

/** Le public en direct : l'image grésille, défile, saute par instants ; le bandeau EN DIRECT bat. */
function LiveTv({ audience }: { audience: AudienceView }) {
  const count = audience.audience.toLocaleString("fr-FR");
  return (
    <section className={styles.tv} aria-label={`${count} spectateurs, record ${audience.best.toLocaleString("fr-FR")}`}>
      <div className={styles.screen}>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.screenImage} src={`${SCENE}/tele-ecran.webp`} alt="" draggable={false} />
        <span className={styles.noise} aria-hidden />
        <span className={styles.scanlines} aria-hidden />
        <span className={styles.rollBar} aria-hidden />
        <div className={styles.screenText} aria-hidden>
          <strong className={styles.count}>{count}</strong>
          <span className={styles.countUnit}>Spectateurs</span>
          <span className={styles.record}>Record : {audience.best.toLocaleString("fr-FR")}</span>
        </div>
        <span className={styles.live} aria-hidden>
          <span className={styles.liveDot} />
          En direct
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img className={styles.tvFrame} src={`${SCENE}/tele.webp`} alt="" draggable={false} />
    </section>
  );
}

/* ── Le mur des mécènes ────────────────────────────────────────────── */

function SponsorPhoto({
  sponsor,
  place,
  selected,
  busy,
  onSelect,
  onOpenGift,
}: {
  sponsor: SponsorView;
  place: (typeof WALL)[number];
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onOpenGift: () => void;
}) {
  const revealed = Boolean(sponsor.name);
  const gift = sponsor.giftStages.length > 0;
  const name = sponsor.name ?? (sponsor.watching ? "Quelqu'un vous observe…" : "Un regard dans la foule");
  const status = sponsor.meetsAudience ? sponsor.stageLabel : `Attend ${sponsor.audienceRequired.toLocaleString("fr-FR")}`;
  return (
    <li
      className={styles.photo}
      data-color={sponsor.color}
      data-selected={selected || undefined}
      data-gift={gift || undefined}
      style={{ left: `${place.left}%`, top: `${place.top}%`, "--tilt": `${place.tilt}deg`, "--breath-delay": `${place.delay}s` } as CSSProperties}
    >
      <button
        type="button"
        className={styles.photoButton}
        aria-pressed={selected}
        aria-label={`${name} — ${sponsor.meetsAudience ? sponsor.stageLabel : `attend ${sponsor.audienceRequired.toLocaleString("fr-FR")} spectateurs`}`}
        onClick={onSelect}
      >
        <span className={styles.photoGlow} aria-hidden />
        <span className={styles.photoWindow} data-hidden={!revealed || undefined} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- portrait local */}
          <img src={`/assets/mecenes/${sponsor.id}.webp`} alt="" draggable={false} />
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.photoFrame} src={`${SCENE}/cadre-photo.webp`} alt="" draggable={false} />
        <span className={styles.photoCaption} aria-hidden>
          <span className={styles.photoName}>{name}</span>
          <span className={styles.photoStatus}>{status}</span>
        </span>
        <span className={styles.medal} data-hidden={!revealed || undefined} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- insigne local */}
          <img src={`/assets/mecenes/${sponsor.id}-insigne.webp`} alt="" draggable={false} />
        </span>
      </button>
      {gift && (
        <button type="button" className={styles.giftBadge} disabled={busy} onClick={onOpenGift} aria-label={`Ouvrir le colis de ${name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- coffret local */}
          <img src="/assets/mecenes/coffret/coffret-ferme.webp" alt="" draggable={false} />
        </button>
      )}
    </li>
  );
}

/* ── Le mécène qu'on regarde ───────────────────────────────────────── */

function SponsorFocus({ sponsor, audience, busy, onOpenGift }: { sponsor: SponsorView; audience: number; busy: boolean; onOpenGift: (sponsor: SponsorView) => void }) {
  const reached = new Set(sponsorGiftStagesReached(sponsor.points));
  const waiting = new Set(sponsor.giftStages);
  const audienceRatio = Math.min(1, audience / sponsor.audienceRequired);
  // Qui il est et ce qui l'attire, au survol de son nom (la fenêtre ne défile plus).
  const about = sponsor.name
    ? [sponsor.figure, sponsor.style && `Ce qui l'attire : ${sponsor.style}`].filter(Boolean).join(" — ")
    : "Il se dévoilera quand il sera Intrigué.";

  return (
    <div className={styles.focus} data-color={sponsor.color}>
      <section className={styles.box} aria-label="Audience attendue">
        <h4 className={styles.boxTitle}>
          Audience
          <span className={styles.focusName} title={about}>
            {sponsor.name ?? "Un mécène inconnu"}
          </span>
        </h4>
        <div className={styles.meter}>
          <span className={styles.meterFill} style={{ width: `${audienceRatio * 100}%` }} />
        </div>
        <p className={styles.boxLine}>
          {sponsor.meetsAudience
            ? `Votre public (${audience.toLocaleString("fr-FR")}) lui suffit : il vous regarde.`
            : `Il attend ${sponsor.audienceRequired.toLocaleString("fr-FR")} spectateurs — vous en avez ${audience.toLocaleString("fr-FR")}.`}
        </p>
      </section>

      <section className={styles.box} aria-label="Paliers d'intérêt">
        <h4 className={styles.boxTitle}>
          Intérêt <span className={styles.points}>{sponsor.points} pts</span>
        </h4>
        <ol className={styles.stages}>
          {SPONSOR_STAGES.filter((stage) => stage.id !== "indifferent").map((stage) => {
            const state = waiting.has(stage.id) ? "gift" : reached.has(stage.id) ? "done" : "locked";
            const gift = sponsorGift(stage.id);
            return (
              <li key={stage.id} className={styles.stage} data-state={state}>
                <span className={styles.stageIcon} title={gift.map(loginRewardLabel).join(" · ")}>
                  {gift[0] && <RewardIcon item={gift[0]} size={30} />}
                </span>
                <span className={styles.stageName}>{stage.label}</span>
                {state === "gift" ? (
                  <button type="button" className={styles.stageOpen} disabled={busy} onClick={() => onOpenGift(sponsor)}>
                    Ouvrir
                  </button>
                ) : (
                  <span className={styles.stagePoints}>{state === "done" ? "Colis ouvert" : `${stage.minPoints} pts`}</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

