"use client";

import { useState } from "react";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/quests/VoyagePanel.module.css";
import { claimVoyageTier, type VoyageBoard, type VoyageView } from "@/features/quests/voyageActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick, playRewardClaimed } from "@/lib/sound";
import type { VoyageReward } from "@/game/quests";

/** Une récompense de palier, en une ligne courte : « 250 XP · 1 booster ». */
function rewardText(reward: VoyageReward): string {
  return [`${reward.xp} XP`, reward.tides > 0 ? `${reward.tides} Tides` : "", reward.boosterId ? "1 booster" : ""].filter(Boolean).join(" · ");
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

/**
 * TRAVERSÉES — la suite de quêtes à paliers, en tête de l'onglet Quêtes du profil.
 *
 * Une route de cinq escales façon carte marine : les escales faites sont
 * des bouées allumées, l'escale en cours porte sa jauge, celles à venir
 * attendent dans le brouillard. Chaque escale bouclée monte d'un palier ;
 * le palier se réclame d'un bouton, toujours le suivant — c'est la base qui
 * le vérifie (`claim_voyage_tier`).
 *
 * Les trois Traversées se choisissent au-dessus de la route : une bouclée
 * reste consultable (et réclamable si on y a laissé des paliers), une
 * verrouillée montre ce qui attend sans pouvoir avancer.
 */
export function VoyagePanel({ board, onChanged }: { board: VoyageBoard; /** Relit Traversées et profil après une réclamation. */ onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState(() => initialVoyageId(board.voyages));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const voyage = board.voyages.find((entry) => entry.id === selectedId) ?? board.voyages[0];
  if (!board.available || !voyage) return null;

  function handleClaim() {
    if (!voyage) return;
    playButtonClick();
    setMessage(null);
    setBusy(true);
    void claimVoyageTier(voyage.id)
      .then((result) => {
        if (!result.ok) {
          setMessage({ tone: "error", text: result.error ?? "Réclamation impossible." });
          return;
        }
        playRewardClaimed();
        const gains = [
          result.xpGained ? `+${result.xpGained} XP` : "",
          result.tidesGained ? `+${result.tidesGained} Tides` : "",
          result.boosterId ? "+1 booster" : "",
        ].filter(Boolean);
        setMessage({ tone: "success", text: `Palier ${result.tier} : ${gains.join(" · ")}` });
        notifyProgressionChanged();
        onChanged();
      })
      .finally(() => setBusy(false));
  }

  const done = voyage.status === "done";
  const locked = voyage.status === "locked";

  return (
    <section className={`${game.panel} ${styles.panel}`} data-status={voyage.status} aria-label="Traversées">
      <header className={styles.head}>
        <div className={styles.titleBlock}>
          <p className={game.eyebrow}>
            Traversée {voyage.numeral} · palier {voyage.tier} / {voyage.steps.length}
          </p>
          <h2 className={styles.title}>{voyage.name}</h2>
          <p className={styles.tagline}>{voyage.tagline}</p>
        </div>

        <div className={styles.voyageTabs} role="tablist" aria-label="Choisir une Traversée">
          {board.voyages.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === voyage.id}
              className={styles.voyageTab}
              data-status={entry.status}
              data-selected={entry.id === voyage.id || undefined}
              data-claimable={entry.claimableTier !== null || undefined}
              title={`Traversée ${entry.numeral} — ${entry.name}${entry.status === "locked" ? " (verrouillée)" : ""}`}
              aria-label={`Traversée ${entry.numeral} — ${entry.name}${entry.status === "locked" ? ", verrouillée" : ""}${entry.claimableTier !== null ? ", un palier à réclamer" : ""}`}
              onClick={() => {
                playButtonClick();
                setMessage(null);
                setSelectedId(entry.id);
              }}
            >
              {entry.numeral}
            </button>
          ))}
        </div>
      </header>

      <ol className={styles.route} aria-label={`Escales de la Traversée ${voyage.numeral}`}>
        {voyage.steps.map((step, index) => {
          const ratio = step.target > 0 ? Math.min(1, step.progress / step.target) : 0;
          // Le palier qui attend d'être réclamé : c'est lui que le bouton encaisse.
          const claimable = voyage.claimableTier === index + 1;
          return (
            <li
              key={step.code}
              className={styles.stop}
              data-state={step.state}
              data-claimed={step.claimed || undefined}
              data-claimable={claimable || undefined}
            >
              <span className={styles.buoy} style={{ "--ratio": ratio } as React.CSSProperties} aria-hidden>
                <span className={styles.buoyNumber}>{index + 1}</span>
              </span>
              <span className={styles.stopName}>{step.name}</span>
              <span className={styles.stopLabel}>{step.label}</span>
              {step.state === "current" && (
                <span className={styles.stopCount}>
                  {step.progress} / {step.target}
                </span>
              )}
              <span className={styles.stopReward}>{step.claimed ? "Réclamé" : claimable ? `À réclamer · ${rewardText(step.reward)}` : rewardText(step.reward)}</span>
            </li>
          );
        })}
      </ol>

      <footer className={styles.foot}>
        {message ? (
          <p className={message.tone === "success" ? game.success : game.error} role="status">
            {message.text}
          </p>
        ) : (
          <p className={game.muted}>
            {locked
              ? "Boucle la Traversée précédente pour lever l'ancre."
              : done
                ? "Traversée bouclée : son titre t'attend dans ton profil."
                : "Chaque escale bouclée monte la Traversée d'un palier. Une partie n'en boucle qu'une à la fois."}
          </p>
        )}
        {voyage.claimableTier !== null && (
          <button type="button" className={game.primary} onClick={handleClaim} disabled={busy}>
            {busy ? "…" : `Réclamer le palier ${voyage.claimableTier}`}
          </button>
        )}
      </footer>
    </section>
  );
}
