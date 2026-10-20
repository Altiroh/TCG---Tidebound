"use client";

import { useEffect, useRef, useState } from "react";
import { fetchMatchVersus } from "@/features/online/actions";
import { addFriendFromMatch } from "@/features/friends/actions";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { PlayerIdentity } from "@/features/friends/PlayerIdentity";
import { ShowcaseShelf } from "@/features/friends/ShowcaseShelf";
import styles from "@/features/online/VersusIntro.module.css";
import { playButtonClick } from "@/lib/sound";

/** Durée de la présentation, une fois les fiches arrivées : assez pour lire un nom et voir une vitrine. */
export const VERSUS_MS = 4500;
/** Fiches toujours pas arrivées au bout de ce délai : on entre en partie sans présentation. */
const FETCH_TIMEOUT_MS = 3000;

/**
 * PRÉSENTATION d'une partie en ligne (retour du 20/10/2026 : « qui on
 * combat avant d'entrer dans la partie »). Les deux capitaines face à face —
 * illustration, pseudo, niveau, titre, vitrine — puis la partie, et sa pièce
 * de pile ou face. Passable d'un clic ; « Ajouter en ami » si l'adversaire
 * n'est pas encore lié.
 */
export function VersusIntro({ matchId, onDone }: { matchId: string; onDone: () => void }) {
  const [players, setPlayers] = useState<{ me: PlayerCardView; opponent: PlayerCardView } | null>(null);
  const [friendState, setFriendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const giveUp = window.setTimeout(() => !cancelled && doneRef.current(), FETCH_TIMEOUT_MS);
    void fetchMatchVersus(matchId)
      .then((result) => {
        if (cancelled) return;
        window.clearTimeout(giveUp);
        if (result.ok && result.data) setPlayers(result.data);
        else doneRef.current();
      })
      .catch(() => !cancelled && doneRef.current());
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
    };
  }, [matchId]);

  useEffect(() => {
    if (!players) return;
    const timer = window.setTimeout(() => doneRef.current(), VERSUS_MS);
    return () => window.clearTimeout(timer);
  }, [players]);

  async function addFriend(opponentId: string) {
    playButtonClick();
    setFriendState("sending");
    const result = await addFriendFromMatch(opponentId).catch(() => ({ ok: false }));
    setFriendState(result.ok ? "sent" : "error");
  }

  if (!players) {
    return (
      <main className={styles.scene} aria-busy>
        <p className={styles.loading}>Les capitaines prennent place…</p>
      </main>
    );
  }

  const { me, opponent } = players;
  return (
    <main className={styles.scene} role="dialog" aria-label={`${me.name} contre ${opponent.name}`}>
      <div className={styles.stage}>
        <section className={`${styles.side} ${styles.sideMe}`} aria-label="Toi">
          <PlayerIdentity player={me} />
          <ShowcaseShelf showcase={me.showcase} compact emptyLabel="" />
        </section>

        <span className={styles.versus} aria-hidden>
          VS
        </span>

        <section className={`${styles.side} ${styles.sideOpponent}`} aria-label="Ton adversaire">
          <PlayerIdentity player={opponent} />
          <ShowcaseShelf showcase={opponent.showcase} compact emptyLabel="" />
          {opponent.relation === "friend" && <span className={styles.tag}>Ami</span>}
          {opponent.relation === "opponent" && (
            <button type="button" className={styles.friend} disabled={friendState !== "idle"} onClick={() => void addFriend(opponent.userId)}>
              {friendState === "sent" ? "Demande envoyée" : friendState === "error" ? "Demande impossible" : "Ajouter en ami"}
            </button>
          )}
          {opponent.relation === "request_sent" && <span className={styles.tag}>Demande envoyée</span>}
        </section>
      </div>

      <button
        type="button"
        className={styles.enter}
        onClick={() => {
          playButtonClick();
          onDone();
        }}
      >
        Entrer en partie
      </button>
      <span className={styles.timer} style={{ animationDuration: `${VERSUS_MS}ms` }} aria-hidden />
    </main>
  );
}
