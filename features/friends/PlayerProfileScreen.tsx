"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addFriendFromMatch, answerFriendRequest } from "@/features/friends/actions";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { PlayerIdentity } from "@/features/friends/PlayerIdentity";
import { ShowcaseShelf } from "@/features/friends/ShowcaseShelf";
import { GameScreen } from "@/features/shell/GameScreen";
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

/**
 * Fiche d'un joueur lié : identité, vitrine, et ce qu'on peut faire avec
 * lui — défier et échanger (ami), répondre (demande reçue), ajouter
 * (adversaire croisé en ligne).
 */
export function PlayerProfileScreen({ player }: { player: PlayerCardView }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const amicalLocked = friendlyMatchLocked(useDevMode());

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    playButtonClick();
    setMessage(null);
    startTransition(async () => {
      const result: { ok: boolean; error?: string; message?: string } = await action().catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
      setMessage(result.ok ? (result.message ? { tone: "ok", text: result.message } : null) : { tone: "error", text: result.error ?? "Échec." });
      router.refresh();
    });
  }

  const showcaseEmpty = player.showcase.every((card) => card === null);

  return (
    <GameScreen active="partie" nav="minimal">
      <div className={game.content}>
        <div className={`${game.contentInner} ${styles.column}`}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>{RELATION_LABEL[player.relation]}</p>
              <h1 className={game.title}>Fiche de capitaine</h1>
            </div>
            <Link href="/amis" className={game.secondary} onClick={() => playButtonClick()}>
              ← Mes amis
            </Link>
          </div>

          <section className={`${game.panel} ${styles.section}`} aria-label="Identité">
            <div className={styles.row}>
              <PlayerIdentity player={player} />
              <span className={game.bannerActions}>
                {player.relation === "friend" && (
                  <>
                    {!amicalLocked && (
                      <Link href={`/partie?mode=en-ligne&ami=${player.userId}`} className={game.primary} onClick={() => playButtonClick()}>
                        Défier
                      </Link>
                    )}
                    <Link href={`/amis/${player.userId}/echange`} className={game.secondary} onClick={() => playButtonClick()}>
                      Proposer un échange
                    </Link>
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
                {player.relation === "self" && (
                  <Link href="/vitrine" className={game.primary} onClick={() => playButtonClick()}>
                    Composer ma vitrine
                  </Link>
                )}
              </span>
            </div>
            {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
          </section>

          <section className={`${game.panel} ${styles.section}`} aria-label="Vitrine">
            <h2 className={game.sectionTitle}>Vitrine</h2>
            {showcaseEmpty ? (
              <p className={game.muted}>{player.relation === "self" ? "Ta vitrine est vide : expose tes plus belles cartes." : `${player.name} n'expose encore aucune carte.`}</p>
            ) : (
              <ShowcaseShelf showcase={player.showcase} emptyLabel="" />
            )}
          </section>
        </div>
      </div>
    </GameScreen>
  );
}
