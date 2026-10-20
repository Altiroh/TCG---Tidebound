"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addFriendFromMatch, answerFriendRequest } from "@/features/friends/actions";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { PlayerIdentity } from "@/features/friends/PlayerIdentity";
import { ShowcaseShelf } from "@/features/friends/ShowcaseShelf";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/Social.module.css";
import { playButtonClick } from "@/lib/sound";
import { useDevMode } from "@/features/admin/useDevMode";
import { friendlyMatchLocked } from "@/features/online/friendlyMatchLock";

const RELATION_LABEL: Record<PlayerCardView["relation"], string> = {
  self: "C'est toi",
  friend: "Ami",
  request_sent: "Demande envoyée",
  request_received: "Te demande en ami",
  opponent: "Adversaire croisé",
};

interface PlayerSheetProps {
  player: PlayerCardView;
  onBack: () => void;
  /** Ouvre la proposition d'échange (amis seulement). */
  onTrade: () => void;
  /** Une action a changé le lien : la fiche et le tableau se relisent. */
  onChanged: () => void;
  /** Un lien quitte le panneau (défi). */
  onLeave: () => void;
}

/**
 * FICHE d'un joueur lié, dans le panneau Amis : identité, vitrine, et ce
 * qu'on peut faire avec lui — défier et échanger (ami), répondre (demande
 * reçue), ajouter (adversaire croisé en ligne).
 */
export function PlayerSheet({ player, onBack, onTrade, onChanged, onLeave }: PlayerSheetProps) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const amicalLocked = friendlyMatchLocked(useDevMode());

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    playButtonClick();
    setMessage(null);
    startTransition(async () => {
      const result: { ok: boolean; error?: string; message?: string } = await action().catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
      setMessage(result.ok ? (result.message ? { tone: "ok", text: result.message } : null) : { tone: "error", text: result.error ?? "Échec." });
      onChanged();
    });
  }

  const showcaseEmpty = player.showcase.every((card) => card === null);

  return (
    <div className={styles.column}>
      <div className={styles.row}>
        <p className={game.eyebrow}>{RELATION_LABEL[player.relation]}</p>
        <button type="button" className={game.secondary} onClick={onBack}>
          ← Mes amis
        </button>
      </div>

      <section className={`${game.panel} ${styles.section}`} aria-label="Identité">
        <PlayerIdentity player={player} />
        <span className={game.bannerActions}>
          {player.relation === "friend" && (
            <>
              <button
                type="button"
                className={game.secondary}
                onClick={() => {
                  playButtonClick();
                  onTrade();
                }}
              >
                Proposer un échange
              </button>
              {!amicalLocked && (
                <Link
                  href={`/partie?mode=en-ligne&ami=${player.userId}`}
                  className={game.primary}
                  onClick={() => {
                    playButtonClick();
                    onLeave();
                  }}
                >
                  Défier
                </Link>
              )}
            </>
          )}
          {player.relation === "request_received" && (
            <button type="button" className={game.primary} disabled={pending} onClick={() => run(() => answerFriendRequest(player.userId, true))}>
              Accepter sa demande
            </button>
          )}
          {player.relation === "opponent" && (
            <button type="button" className={game.primary} disabled={pending} onClick={() => run(() => addFriendFromMatch(player.userId))}>
              Ajouter en ami
            </button>
          )}
        </span>
        {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
      </section>

      <section className={`${game.panel} ${styles.section}`} aria-label="Vitrine">
        <h3 className={game.sectionTitle}>Vitrine</h3>
        {showcaseEmpty ? (
          <p className={game.muted}>{player.name} n&apos;expose encore aucune carte.</p>
        ) : (
          <ShowcaseShelf showcase={player.showcase} emptyLabel="" narrow />
        )}
      </section>
    </div>
  );
}
