"use client";

import { useEffect, useState } from "react";
import type { GameState, PlayerId } from "@/game";
import styles from "@/features/match/CoinToss.module.css";

/** Durée de la scène : la pièce monte en tournant, retombe, le résultat s'affiche. */
export const COIN_TOSS_MS = 2900;
/** Instant où la pièce retombe et où le résultat apparaît. */
const COIN_LANDS_MS = 1500;

type Phase = "pending" | "showing" | "done";

/** Le tirage de la partie, s'il y en a eu un — et s'il est encore temps de le montrer. */
function tossOf(state: GameState): { firstPlayerId: PlayerId } | null {
  // Au plus le 2e tour de table : contre le bot en ligne, son premier tour
  // est déjà joué quand l'écran s'ouvre, la pièce reste à montrer.
  if (state.turnNumber > 2) return null;
  const started = state.eventLog.find((event) => event.type === "GAME_STARTED");
  if (!started || started.type !== "GAME_STARTED" || !started.coinToss) return null;
  return { firstPlayerId: started.firstPlayerId ?? state.players[0].id };
}

const seenKey = (gameId: string) => `tb-pile-ou-face:${gameId}`;

/**
 * PILE OU FACE au début d'une partie (`GAME_STARTED.coinToss`) : une seule
 * fois par partie et par navigateur — recharger la page ne relance pas la
 * pièce. `holding` est vrai tant que la scène n'a pas fini : le bot attend
 * qu'elle soit retombée pour jouer son premier coup.
 */
export function useCoinToss(state: GameState, viewerId: PlayerId | null) {
  const toss = tossOf(state);
  const [phase, setPhase] = useState<Phase>(toss ? "pending" : "done");

  useEffect(() => {
    if (phase !== "pending") return;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(seenKey(state.id)) === "1";
    } catch {
      // Stockage refusé (navigation privée) : la pièce se montre, c'est tout.
    }
    setPhase(seen ? "done" : "showing");
  }, [phase, state.id]);

  // « Vue » seulement une fois la scène finie (ou passée) : marquée dès
  // l'ouverture, le double passage des effets en développement l'annulait.
  const finish = () => {
    try {
      window.sessionStorage.setItem(seenKey(state.id), "1");
    } catch {
      // Sans stockage, rien à retenir.
    }
    setPhase("done");
  };

  useEffect(() => {
    if (phase !== "showing") return;
    const timer = window.setTimeout(finish, COIN_TOSS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `finish` ne lit que `state.id`, stable pour une partie
  }, [phase]);

  const overlay =
    phase === "showing" && toss ? (
      <CoinTossScene
        // Deux joueurs sur le même écran (`viewerId` absent) : la pièce nomme le siège.
        title={viewerId === null ? `Joueur ${state.players[0].id === toss.firstPlayerId ? 1 : 2} commence` : toss.firstPlayerId === viewerId ? "Tu commences !" : "L'adversaire commence"}
        mine={viewerId === null || toss.firstPlayerId === viewerId}
        onSkip={finish}
      />
    ) : null;
  return { holding: phase !== "done", overlay };
}

function CoinTossScene({ title, mine, onSkip }: { title: string; mine: boolean; onSkip: () => void }) {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLanded(true), COIN_LANDS_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={styles.scene} data-tone={mine ? "mine" : "theirs"} onClick={onSkip} role="status" aria-live="polite">
      <div className={styles.coinTrack}>
        <span className={styles.glow} data-landed={landed || undefined} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element -- pièce peinte locale */}
        <img className={styles.coin} src="/assets/menu/carte/piece-2.webp" alt="" draggable={false} />
      </div>
      <p className={styles.result} data-landed={landed || undefined}>
        <span className={styles.eyebrow}>Pile ou face</span>
        <strong>{title}</strong>
        {!mine && <span className={styles.sub}>Tu pioches une carte de plus.</span>}
      </p>
    </div>
  );
}
