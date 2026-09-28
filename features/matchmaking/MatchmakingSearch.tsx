"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRECON_DECKS } from "@/game";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import {
  estimateMatchmakingWait,
  leaveMatchmakingQueue,
  pollMatchmaking,
} from "@/features/matchmaking/actions";
import { PlayTable } from "@/features/match/ModeTable";
import { GameScreen } from "@/features/shell/GameScreen";
import styles from "@/features/matchmaking/MatchmakingSearch.module.css";
import { playButtonClick } from "@/lib/sound";

/** Cadence du sondage : c'est aussi le signe de vie qui garde la place en file (30 s de silence et elle est rendue). */
const POLL_MS = 3000;
/** L'estimation se refait de temps en temps : la file bouge. */
const ESTIMATE_MS = 20000;
/** Rangées de cartes qui défilent derrière, et cartes par rangée. */
const ROWS = 3;
const PER_ROW = 9;

interface MatchmakingSearchProps {
  /** Nom du deck engagé, rappelé pendant l'attente. */
  deckName: string;
  /** Retour à l'écran de choix (recherche annulée ou interrompue). */
  onCancel: (reason?: string) => void;
}

/** Des illustrations de cartes du jeu, mélangées : une rangée chacune. */
function pickReels(): string[][] {
  const ids = [...new Set(PRECON_DECKS.flatMap((deck) => deck.cardIds))];
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
  }
  return Array.from({ length: ROWS }, (_, row) =>
    ids.slice(row * PER_ROW, (row + 1) * PER_ROW),
  );
}

function clock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function estimateLabel(seconds: number | null | undefined): string {
  if (seconds === undefined) return "…";
  if (seconds === null) return "Inconnu";
  if (seconds < 60) return `~ ${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  return `~ ${Math.round(seconds / 60)} min`;
}

/**
 * Recherche d'un adversaire, une fois en file (`joinMatchmakingQueue`).
 *
 * Sur la table de « Jouer » (retour du 28/09/2026) : derrière, des
 * illustrations de cartes défilent, légèrement floues ; devant, « En attente
 * d'un adversaire », le temps passé et le temps estimé
 * (`estimateMatchmakingWait`).
 *
 * Deux façons d'être apparié, et l'écran couvre les deux par le même
 * sondage (`pollMatchmaking`) :
 *   - quelqu'un arrive et nous choisit : il a créé la partie, on la trouve ;
 *   - on arrive en même temps qu'un autre et on s'est manqués : le sondage
 *     retente l'appariement.
 * Chaque sondage est aussi un signe de vie : une page fermée brutalement
 * cesse de sonder, et sa place est rendue au bout de 30 secondes.
 */
export function MatchmakingSearch({
  deckName,
  onCancel,
}: MatchmakingSearchProps) {
  const router = useRouter();
  const [waitedSeconds, setWaitedSeconds] = useState(0);
  /** `undefined` : pas encore reçue ; `null` : rien ne permet d'estimer. */
  const [estimate, setEstimate] = useState<number | null | undefined>(
    undefined,
  );
  const [reels] = useState(pickReels);
  /** Évite deux navigations si deux sondages concluent ensemble. */
  const leaving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const poll = setInterval(async () => {
      if (inFlight || leaving.current) return;
      inFlight = true;
      const result = await pollMatchmaking().catch(() => null);
      inFlight = false;
      if (cancelled || leaving.current || !result) return;
      if (!result.ok) {
        leaving.current = true;
        onCancel(result.error ?? "La recherche s'est interrompue.");
        return;
      }
      if (result.data?.status === "matched") {
        leaving.current = true;
        router.push(`/en-ligne/${result.data.matchId}`);
      } else if (result.data?.status === "idle") {
        leaving.current = true;
        onCancel("Ta place en file a été rendue — relance la recherche.");
      }
    }, POLL_MS);
    const tick = setInterval(() => setWaitedSeconds((s) => s + 1), 1000);

    const refreshEstimate = () =>
      void estimateMatchmakingWait()
        .then(
          (result) =>
            !cancelled &&
            setEstimate(result.ok ? (result.data?.seconds ?? null) : null),
        )
        .catch(() => !cancelled && setEstimate(null));
    refreshEstimate();
    const estimating = setInterval(refreshEstimate, ESTIMATE_MS);

    // Bruit de recherche : à brancher ici, en boucle le temps de l'attente (arrêté au nettoyage).

    // Quitter la page pendant l'attente libère la place tout de suite.
    const release = () => void leaveMatchmakingQueue().catch(() => undefined);
    window.addEventListener("pagehide", release);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
      clearInterval(estimating);
      window.removeEventListener("pagehide", release);
      if (!leaving.current) release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule recherche par montage.
  }, []);

  async function cancel() {
    if (leaving.current) return;
    playButtonClick();
    leaving.current = true;
    await leaveMatchmakingQueue().catch(() => undefined);
    onCancel();
  }

  return (
    <GameScreen
      active="partie"
      nav="minimal"
      backdrop="table"
      // La flèche du bandeau annule la recherche et ramène au réglage de la partie.
      onNavigate={(href) => {
        if (href !== "/") return false;
        void cancel();
        return true;
      }}
    >
      <PlayTable fill>
        <div className={styles.scene}>
          {/* Derrière : les cartes du jeu qui défilent, en rangées alternées, sous un léger flou. */}
          <div className={styles.reelsFrame} aria-hidden>
            <div className={styles.reels}>
              {reels.map((ids, row) => (
                <div
                  key={row}
                  className={styles.reel}
                  data-reverse={row % 2 === 1 || undefined}
                >
                  {/* Deux fois la même suite : le défilement boucle sans raccord visible. */}
                  {[...ids, ...ids].map((id, index) => (
                    // eslint-disable-next-line @next/next/no-img-element -- vignette d'illustration locale
                    <img
                      key={`${id}-${index}`}
                      className={styles.card}
                      src={cardIllustrationThumbUrl(id)}
                      alt=""
                      draggable={false}
                      onError={(event) =>
                        (event.currentTarget.style.visibility = "hidden")
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.veil} aria-hidden />

          {/* Devant : l'attente, le temps passé, le temps estimé. */}
          <section className={styles.panel} role="status" aria-live="polite">
            <h1 className={styles.title}>
              En attente d&apos;un adversaire
              <span className={styles.dots} aria-hidden>
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </h1>
            <div className={styles.sheet}>
              <dl className={styles.times}>
                <div>
                  <dt>Temps passé</dt>
                  <dd aria-label={`${waitedSeconds} secondes d'attente`}>
                    {clock(waitedSeconds)}
                  </dd>
                </div>
                <div>
                  <dt>Temps estimé</dt>
                  <dd>{estimateLabel(estimate)}</dd>
                </div>
              </dl>
              <p className={styles.deck}>
                Deck engagé : <strong>{deckName}</strong>
              </p>
              <p className={styles.hint}>
                Tu peux fermer cette page : ta place est libérée
                automatiquement.
              </p>
            </div>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => void cancel()}
            >
              Annuler la recherche
            </button>
          </section>
        </div>
      </PlayTable>
    </GameScreen>
  );
}
