"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SPONSOR_STAGES, SPONSORS_UNLOCK_LEVEL, loginRewardLabel, sponsorGift, sponsorGiftStagesReached } from "@/game/progression";
import type { AudienceMilestoneView, AudienceView, SponsorView } from "@/features/progression/hubService";
import { RewardIcon } from "@/features/progression/RewardIcon";
import hubStyles from "@/features/progression/HubSheets.module.css";
import styles from "@/features/progression/SponsorsSheet.module.css";
import { playButtonClick } from "@/lib/sound";

const SCENE = "/assets/mecenes/scene";

/**
 * Place de chaque cadre photo sur le mur, dans l'ordre des mécènes : coin
 * haut-gauche (% de la largeur du mur et de sa hauteur), inclinaison propre
 * du cadre, et décalage de la respiration du portrait pour qu'ils ne
 * battent pas à l'unisson.
 */
const WALL: readonly { left: number; top: number; tilt: number; delay: number }[] = [
  { left: 1, top: 6, tilt: -4, delay: 0 },
  { left: 35, top: 0, tilt: 8, delay: -1.7 },
  { left: 67, top: 15, tilt: 14, delay: -3.1 },
  { left: 13, top: 51, tilt: 2, delay: -4.4 },
];

/** Volutes de fumée de la lanterne soufflée : dérive (%), taille (%), départ (s). */
const SMOKE = [
  { dx: -18, size: 30, delay: 0 },
  { dx: 12, size: 26, delay: 0.08 },
  { dx: -6, size: 36, delay: 0.18 },
  { dx: 22, size: 30, delay: 0.3 },
  { dx: -24, size: 24, delay: 0.42 },
  { dx: 4, size: 40, delay: 0.55 },
  { dx: 14, size: 22, delay: 0.75 },
];

/**
 * LES MÉCÈNES, mis en scène (maquette du 28/09/2026) : un mur de cabine où
 * la télé retransmet le public EN DIRECT, une lanterne qu'on souffle et
 * rallume, et les mécènes épinglés en photos, leur insigne en médaille. Un
 * colis qui attend fait luire la photo de la couleur du mécène. Dessous,
 * l'audience qu'attend celui qu'on regarde et ses paliers d'intérêt ; puis
 * sa fiche et les paliers du public.
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

        {/* L'en-tête défile avec la scène : la fumée de la lanterne monte par-dessus le titre. */}
        <div className={styles.body}>
          <header className={styles.head}>
            <h2 className={styles.title}>Mécènes</h2>
            <p className={styles.subtitle}>
              {unlocked ? "Derrière le public, certains vous observent." : `Ils remarquent les marins à partir du niveau ${SPONSORS_UNLOCK_LEVEL}.`}
            </p>
          </header>

          <div className={styles.studio}>
            <Lantern lit={lit} onToggle={() => setLit((value) => !value)} />
            <LiveTv audience={audience} />
          </div>

          <div className={styles.wall}>
            {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
            <img className={styles.starfish} src={`${SCENE}/etoile-de-mer.webp`} alt="" draggable={false} />
            <ul className={styles.wallList} aria-label="Mécènes">
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

          {sponsor && <SponsorFocus sponsor={sponsor} audience={audience.audience} busy={busy} onOpenGift={onOpenGift} />}

          <section className={styles.box} aria-label="Le public">
            <h4 className={styles.boxTitle}>Le public</h4>
            {/* La clé du public, sans formule : chaque humeur a le sien (spectacle × 25 = palier, audit du 27/09/2026). */}
            <p className={styles.boxLine}>
              Chaque humeur a son public : une salle qui suit la partie vous amène vers 1 000 spectateurs, captivée vers 1 500, debout vers
              2 000.
            </p>
            {audience.lastHighlights.length > 0 && (
              <p className={styles.boxLine}>Dernière partie : « {audience.lastHighlights.join(" », « ")} »</p>
            )}
            <AudienceMilestones milestones={milestones} best={audience.best} busy={busy} onClaim={onClaimMilestone} />
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── La lanterne ───────────────────────────────────────────────────── */

/**
 * La lanterne pendue au mur : elle se balance, sa flamme vacille et éclaire
 * la scène. Un clic la souffle — une volute de fumée monte, la pièce
 * s'assombrit ; un autre la rallume.
 */
function Lantern({ lit, onToggle }: { lit: boolean; onToggle: () => void }) {
  // Chaque extinction remonte la fumée (nouvelle clé), pour qu'elle rejoue.
  const [puff, setPuff] = useState(0);
  return (
    <button
      type="button"
      className={styles.lantern}
      data-lit={lit || undefined}
      aria-pressed={lit}
      aria-label={lit ? "Souffler la lanterne" : "Rallumer la lanterne"}
      onClick={() => {
        if (lit) setPuff((value) => value + 1);
        onToggle();
      }}
    >
      <span className={styles.lanternSwing}>
        <span className={styles.lanternGlow} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.lanternOff} src={`${SCENE}/lanterne-eteinte.webp`} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.lanternOn} src={`${SCENE}/lanterne.webp`} alt="" draggable={false} />
        {puff > 0 && !lit && (
          <span key={puff} className={styles.smoke} aria-hidden>
            {SMOKE.map((wisp, index) => (
              <span
                key={index}
                className={styles.wisp}
                style={{ "--dx": `${wisp.dx}%`, "--size": `${wisp.size}%`, animationDelay: `${wisp.delay}s` } as CSSProperties}
              />
            ))}
          </span>
        )}
      </span>
    </button>
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
  const revealed = Boolean(sponsor.name);
  const reached = new Set(sponsorGiftStagesReached(sponsor.points));
  const waiting = new Set(sponsor.giftStages);
  const audienceRatio = Math.min(1, audience / sponsor.audienceRequired);

  return (
    <div className={styles.focus} data-color={sponsor.color}>
      <div className={styles.panels}>
        <section className={styles.box} aria-label="Audience attendue">
          <h4 className={styles.boxTitle}>Audience</h4>
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
                    {gift[0] && <RewardIcon item={gift[0]} size={34} />}
                  </span>
                  <span className={styles.stageName}>{stage.label}</span>
                  <span className={styles.stagePoints}>{stage.minPoints} pts</span>
                  {state === "gift" && (
                    <button type="button" className={styles.stageOpen} disabled={busy} onClick={() => onOpenGift(sponsor)}>
                      Ouvrir
                    </button>
                  )}
                  {state === "done" && <span className={styles.stageDone}>Colis ouvert</span>}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section className={styles.box} aria-label="Fiche du mécène">
        <h4 className={styles.boxTitle}>
          <span className={styles.focusName}>{sponsor.name ?? "Un mécène inconnu"}</span>
        </h4>
        {revealed ? (
          <>
            <p className={styles.boxLine}>{sponsor.figure}</p>
            <p className={styles.boxLine}>
              <span className={styles.attraction}>Ce qui l&apos;attire</span> {sponsor.style}
            </p>
            <p className={styles.lore}>{sponsor.lore}</p>
          </>
        ) : (
          <p className={styles.boxLine}>
            Il ne s&apos;est pas encore fait connaître. Attirez son regard — il se dévoilera quand il sera <strong>Intrigué</strong>.
          </p>
        )}
      </section>
    </div>
  );
}

/* ── Les paliers du public ─────────────────────────────────────────── */

/**
 * LES PALIERS D'AUDIENCE — ce que le public rapporte. Ils se lisent sur le
 * RECORD : un palier franchi l'est pour de bon. Celui qui attend d'être
 * ouvert luit ; les suivants disent ce qu'il reste à conquérir.
 */
function AudienceMilestones({
  milestones,
  best,
  busy,
  onClaim,
}: {
  milestones: AudienceMilestoneView[];
  best: number;
  busy: boolean;
  onClaim: (milestone: AudienceMilestoneView) => void;
}) {
  if (milestones.length === 0) return null;
  return (
    <ol className={styles.milestones} aria-label="Paliers d'audience">
      {milestones.map((milestone) => {
        const state = milestone.claimed ? "claimed" : milestone.claimable ? "claimable" : "locked";
        const rewards = milestone.rewards.map(loginRewardLabel).join(" · ");
        return (
          <li key={milestone.threshold} className={styles.milestone} data-state={state}>
            <span className={styles.milestoneIcons} aria-hidden>
              {milestone.rewards.map((item, index) => (
                <RewardIcon key={index} item={item} size={30} />
              ))}
            </span>
            <span className={styles.milestoneLabel}>{milestone.label}</span>
            <span className={styles.milestoneThreshold}>{milestone.threshold.toLocaleString("fr-FR")} spectateurs</span>
            {state === "claimable" ? (
              <button type="button" className={styles.milestoneClaim} disabled={busy} onClick={() => onClaim(milestone)} title={rewards}>
                Ouvrir
              </button>
            ) : (
              <span className={styles.milestoneStatus} title={rewards}>
                {state === "claimed" ? "Ouvert" : `Record ${Math.min(best, milestone.threshold).toLocaleString("fr-FR")} / ${milestone.threshold.toLocaleString("fr-FR")}`}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
