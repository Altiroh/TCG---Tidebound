"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { leaveMatchmakingQueue, pollMatchmaking } from "@/features/matchmaking/actions";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

/** Cadence du sondage : c'est aussi le signe de vie qui garde la place en file (30 s de silence et elle est rendue). */
const POLL_MS = 3000;

interface MatchmakingSearchProps {
  /** Nom du deck engagé, rappelé pendant l'attente. */
  deckName: string;
  /** Retour à l'écran de choix (recherche annulée ou interrompue). */
  onCancel: (reason?: string) => void;
}

/**
 * Recherche d'un adversaire, une fois en file (`joinMatchmakingQueue`).
 *
 * Deux façons d'être apparié, et l'écran couvre les deux par le même
 * sondage (`pollMatchmaking`) :
 *   - quelqu'un arrive et nous choisit : il a créé la partie, on la trouve ;
 *   - on arrive en même temps qu'un autre et on s'est manqués : le sondage
 *     retente l'appariement.
 * Chaque sondage est aussi un signe de vie : une page fermée brutalement
 * cesse de sonder, et sa place est rendue au bout de 30 secondes.
 */
export function MatchmakingSearch({ deckName, onCancel }: MatchmakingSearchProps) {
  const router = useRouter();
  const [waitedSeconds, setWaitedSeconds] = useState(0);
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

    // Quitter la page pendant l'attente libère la place tout de suite.
    const release = () => void leaveMatchmakingQueue().catch(() => undefined);
    window.addEventListener("pagehide", release);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("pagehide", release);
      if (!leaving.current) release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule recherche par montage.
  }, []);

  async function cancel() {
    playButtonClick();
    leaving.current = true;
    await leaveMatchmakingQueue().catch(() => undefined);
    onCancel();
  }

  const minutes = Math.floor(waitedSeconds / 60);
  const seconds = String(waitedSeconds % 60).padStart(2, "0");

  return (
    <GameScreen active="partie" nav="minimal">
      <div className={game.content}>
        <div className={game.contentInner}>
          <section className={`${game.panel} ${game.empty}`} role="status" aria-live="polite">
            <p className={game.eyebrow}>Recherche rapide</p>
            <h1 className={game.title}>Recherche d&apos;un adversaire…</h1>
            <p className={game.statValue} aria-label={`${waitedSeconds} secondes d'attente`}>
              {minutes}:{seconds}
            </p>
            <p className={game.muted}>
              Deck engagé : <strong>{deckName}</strong>. Le premier capitaine en file sera ton adversaire.
            </p>
            <p className={game.caption}>Tu peux fermer cette page : ta place est libérée automatiquement.</p>
            <button type="button" className={game.secondary} onClick={cancel}>
              Annuler la recherche
            </button>
          </section>
        </div>
      </div>
    </GameScreen>
  );
}
