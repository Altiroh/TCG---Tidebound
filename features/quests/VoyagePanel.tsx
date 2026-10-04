"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "@/features/quests/VoyagePanel.module.css";
import { claimVoyageTier, type VoyageBoard, type VoyageStepView, type VoyageView } from "@/features/quests/voyageActions";
import type { SceneNotice } from "@/features/quests/QuestScene";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick, playRewardClaimed } from "@/lib/sound";
import { TideCoin } from "@/features/shell/GameIcons";
import { getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";

/**
 * Les cinq bouées PEINTES sur la carte (`carte-traversee.webp`), en % de
 * l'image : les escales se posent dessus. Une Traversée plus longue que la
 * carte (aucune aujourd'hui) répartirait ses escales entre la première et
 * la dernière.
 */
const BUOYS: readonly { x: number; y: number }[] = [
  { x: 17.7, y: 62.6 },
  { x: 29.6, y: 60.6 },
  { x: 41.9, y: 68.0 },
  { x: 54.7, y: 64.2 },
  { x: 69.9, y: 70.0 },
];

function buoyAt(index: number, count: number): { x: number; y: number } {
  if (count <= BUOYS.length) return BUOYS[index]!;
  const first = BUOYS[0]!;
  const last = BUOYS[BUOYS.length - 1]!;
  const t = count > 1 ? index / (count - 1) : 0;
  return { x: first.x + (last.x - first.x) * t, y: first.y + (last.y - first.y) * t };
}

/**
 * Traversée à montrer en arrivant : celle qui a un palier à réclamer (on
 * vient chercher ce qu'on a gagné), sinon celle en cours, sinon la dernière
 * bouclée.
 */
function initialVoyageId(voyages: readonly VoyageView[]): string | undefined {
  return (
    voyages.find((voyage) => voyage.claimableTier !== null)?.id ??
    voyages.find((voyage) => voyage.status === "current")?.id ??
    voyages.filter((voyage) => voyage.status === "done").at(-1)?.id
  );
}

/** L'escale que la plaque raconte par défaut : celle à réclamer, sinon celle en cours, sinon la dernière. */
function focusIndex(voyage: VoyageView): number {
  if (voyage.claimableTier !== null) return voyage.claimableTier - 1;
  const current = voyage.steps.findIndex((step) => step.state === "current");
  if (current >= 0) return current;
  return voyage.status === "locked" ? 0 : voyage.steps.length - 1;
}

/**
 * TRAVERSÉES — la suite de quêtes à paliers, peinte en carte marine en tête
 * de l'écran Quêtes (maquette du 29/09/2026).
 *
 * La route et ses cinq bouées sont PEINTES ; les escales s'y posent : un
 * médaillon d'or pour l'escale en cours (ou le palier à réclamer, qui
 * pulse), un chiffre ivoire sur les bouées à venir, un chiffre d'or sur les
 * escales faites. Survoler ou toucher une escale la raconte sous le titre ;
 * la plaque clouée à droite montre ce qu'elle rapporte — et, quand un
 * palier attend, c'est elle qu'on touche pour le réclamer (toujours le
 * suivant : c'est la base qui le vérifie, `claim_voyage_tier`).
 *
 * Les Traversées se choisissent à côté du titre : une bouclée reste
 * consultable (et réclamable si on y a laissé des paliers), une verrouillée
 * montre ce qui attend sans pouvoir avancer.
 */
export function VoyagePanel({
  board,
  onNotice,
  onChanged,
}: {
  board: VoyageBoard;
  /** Le mot laissé sur la table après une réclamation (gain ou échec). */
  onNotice: (notice: SceneNotice) => void;
  /** Relit Traversées et profil après une réclamation. */
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState(() => initialVoyageId(board.voyages));
  const [hovered, setHovered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Un palier réclamé reste marqué jusqu'aux Traversées RELUES : relâché plus tôt, il réapparaissait « à réclamer ».
  useEffect(() => setBusy(false), [board]);

  const voyage = board.voyages.find((entry) => entry.id === selectedId) ?? board.voyages[0];
  if (!board.available || !voyage) return null;

  function handleClaim() {
    if (!voyage || busy) return;
    playButtonClick();
    setBusy(true);
    void claimVoyageTier(voyage.id)
      .then((result) => {
        if (!result.ok) {
          onNotice({ tone: "error", text: result.error ?? "Réclamation impossible." });
          setBusy(false);
          return;
        }
        playRewardClaimed();
        const gains = [
          result.xpGained ? `+${result.xpGained} XP` : "",
          result.tidesGained ? `+${result.tidesGained} Tides` : "",
          result.boosterId ? "+1 booster" : "",
        ].filter(Boolean);
        onNotice({ tone: "success", text: `Palier ${result.tier} : ${gains.join(" · ")}` });
        notifyProgressionChanged();
        onChanged();
        // Relâché à l'arrivée des Traversées relues (`board`) ; filet si la relecture n'aboutit pas.
        window.setTimeout(() => setBusy(false), 10_000);
      })
      .catch(() => setBusy(false));
  }

  const shown = hovered ?? focusIndex(voyage);
  const step = voyage.steps[shown];
  const claimableHere = voyage.claimableTier !== null && voyage.claimableTier === shown + 1;
  const locked = voyage.status === "locked";

  return (
    <section className={styles.map} data-status={voyage.status} aria-label="Traversées">
      <div className={styles.titleBlock}>
        <p className={styles.eyebrow}>
          <span>
            Traversée · palier {voyage.tier}/{voyage.steps.length}
          </span>
          {board.voyages.length > 1 && (
            <span className={styles.voyageTabs} role="tablist" aria-label="Choisir une Traversée">
              {board.voyages.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={entry.id === voyage.id}
                  className={styles.voyageTab}
                  data-status={entry.status}
                  data-claimable={entry.claimableTier !== null || undefined}
                  title={`Traversée ${entry.numeral} — ${entry.name}${entry.status === "locked" ? " (verrouillée)" : ""}`}
                  aria-label={`Traversée ${entry.numeral} — ${entry.name}${entry.status === "locked" ? ", verrouillée" : ""}${entry.claimableTier !== null ? ", un palier à réclamer" : ""}`}
                  onClick={() => {
                    if (entry.id === voyage.id) return;
                    playButtonClick();
                    setHovered(null);
                    setSelectedId(entry.id);
                  }}
                >
                  {entry.numeral}
                </button>
              ))}
            </span>
          )}
        </p>
        <h2 className={styles.title}>{voyage.name}</h2>
        <p className={styles.tagline}>{voyage.tagline}</p>
      </div>

      <ol className={styles.route} aria-label={`Escales de la Traversée ${voyage.numeral}`}>
        {voyage.steps.map((entry, index) => (
          <Stop
            key={entry.code}
            step={entry}
            index={index}
            count={voyage.steps.length}
            claimable={voyage.claimableTier === index + 1}
            shown={index === shown}
            onShow={(value) => setHovered(value ? index : null)}
          />
        ))}
      </ol>

      {/* L'escale survolée (ou touchée) se raconte dans une bulle au-dessus
          de sa bouée : le papier du titre reste au titre. */}
      {hovered !== null && step && (
        <p className={styles.stepTip} style={{ "--x": `${buoyAt(shown, voyage.steps.length).x}%`, "--y": `${buoyAt(shown, voyage.steps.length).y}%` } as CSSProperties} role="status">
          <span className={styles.stepName}>
            Escale {shown + 1} · {step.name}
          </span>
          {step.label}
          {step.state === "current" && ` (${step.progress}/${step.target})`}
        </p>
      )}

      {step && <RewardPlaque step={step} claimable={claimableHere} busy={busy} locked={locked} onClaim={handleClaim} />}
    </section>
  );
}

function Stop({
  step,
  index,
  count,
  claimable,
  shown,
  onShow,
}: {
  step: VoyageStepView;
  index: number;
  count: number;
  claimable: boolean;
  shown: boolean;
  onShow: (value: boolean) => void;
}) {
  const at = buoyAt(index, count);
  const ratio = step.target > 0 ? Math.min(1, step.progress / step.target) : 0;
  const state = step.claimed ? "claimed" : claimable ? "claimable" : step.state;
  return (
    <li className={styles.stop} style={{ "--x": `${at.x}%`, "--y": `${at.y}%` } as CSSProperties}>
      <button
        type="button"
        className={styles.buoy}
        data-state={state}
        data-shown={shown || undefined}
        style={{ "--ratio": ratio } as CSSProperties}
        aria-label={`Escale ${index + 1} — ${step.name} : ${step.label}${step.state === "current" ? `, ${step.progress} sur ${step.target}` : ""}${
          step.claimed ? ", palier réclamé" : claimable ? ", palier à réclamer" : step.state === "done" ? ", faite" : ""
        }`}
        onMouseEnter={() => onShow(true)}
        onMouseLeave={() => onShow(false)}
        onFocus={() => onShow(true)}
        onBlur={() => onShow(false)}
        onClick={() => onShow(true)}
      >
        {index + 1}
      </button>
    </li>
  );
}

/** La plaque clouée à droite de la carte : ce que rapporte l'escale racontée — et le palier à réclamer. */
function RewardPlaque({ step, claimable, busy, locked, onClaim }: { step: VoyageStepView; claimable: boolean; busy: boolean; locked: boolean; onClaim: () => void }) {
  const { reward } = step;
  const lines = (
    <>
      {reward.tides > 0 && (
        <span className={styles.plaqueLine}>
          <span className={styles.plaqueIcon}>
            <TideCoin size={40} />
          </span>
          +{reward.tides} Tides
        </span>
      )}
      {reward.boosterId && (
        <span className={styles.plaqueLine}>
          <span className={styles.plaqueIcon} data-kind="booster" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- sachet local */}
            <img src={getBoosterPackVisual(reward.boosterId).assets.closed} alt="" draggable={false} />
          </span>
          +1 booster
        </span>
      )}
      {reward.xp > 0 && (
        <span className={styles.plaqueLine}>
          <span className={styles.plaqueIcon} data-kind="xp" aria-hidden>
            <svg viewBox="0 0 40 40" width="100%" height="100%">
              <circle cx="20" cy="20" r="17" fill="#6b1d17" stroke="#d6a44a" strokeWidth="3" />
              <circle cx="20" cy="20" r="11.5" fill="none" stroke="#e7c67a" strokeWidth="1.2" opacity="0.7" />
              <path d="M20 8.5l2.6 8.9 8.9 2.6-8.9 2.6-2.6 8.9-2.6-8.9-8.9-2.6 8.9-2.6z" fill="#f0cf7e" />
              <circle cx="20" cy="20" r="2.2" fill="#6b1d17" />
            </svg>
          </span>
          +{reward.xp} XP
        </span>
      )}
      {step.claimed && <span className={styles.plaqueState}>Palier réclamé</span>}
      {locked && <span className={styles.plaqueState}>Boucle la Traversée précédente pour lever l&apos;ancre.</span>}
      {claimable && <span className={styles.plaqueClaim}>{busy ? "…" : "Réclamer"}</span>}
    </>
  );

  if (claimable) {
    return (
      <button type="button" className={styles.plaque} data-claimable onClick={onClaim} disabled={busy} aria-label={`Réclamer le palier : ${step.name}`}>
        {lines}
      </button>
    );
  }
  return <div className={styles.plaque}>{lines}</div>;
}

/**
 * La Traversée en attente de sa lecture : la MÊME carte, et un texte de
 * gabarit rendu invisible (`.ghost`) — le vrai panneau prend sa place sans
 * que rien ne bouge.
 */
export function VoyageSkeleton() {
  const ghost = styles.ghost;
  return (
    <section className={`${styles.map} ${styles.skeleton}`} aria-hidden>
      <div className={styles.titleBlock}>
        <p className={styles.eyebrow}>
          <span className={ghost}>Traversée · palier 1/5</span>
        </p>
        <h2 className={styles.title}>
          <span className={ghost}>La Traversée</span>
        </h2>
        <p className={styles.tagline}>
          <span className={ghost}>Une route de cinq escales, à boucler.</span>
        </p>
      </div>
    </section>
  );
}
