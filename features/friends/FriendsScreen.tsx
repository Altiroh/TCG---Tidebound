"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addFriendByCode, answerFriendRequest, declineChallenge, removeFriend } from "@/features/friends/actions";
import type { SocialView } from "@/features/friends/friendService";
import { normalizeFriendCode, PRESENCE_LABEL, type FriendPresence } from "@/features/friends/presence";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/FriendsScreen.module.css";
import { playButtonClick } from "@/lib/sound";

const PRESENCE_TAG: Record<FriendPresence, string | undefined> = {
  online: game.tagSuccess,
  in_match: game.tagBrass,
  offline: game.tag,
};

/**
 * Amis : son code ami, l'ajout par code, les demandes reçues et envoyées,
 * les défis reçus, et la liste — présence et bouton « Défier ».
 *
 * Défier ouvre l'écran Partie en mode « En ligne », ami présélectionné : le
 * joueur y choisit son deck comme pour n'importe quelle partie.
 */
export function FriendsScreen({ social }: { social: SocialView }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    playButtonClick();
    setMessage(null);
    startTransition(async () => {
      const result: { ok: boolean; error?: string; message?: string } = await action().catch(() => ({
        ok: false,
        error: "Le serveur est injoignable.",
      }));
      setMessage(result.ok ? (result.message ? { tone: "ok", text: result.message } : null) : { tone: "error", text: result.error ?? "Échec." });
      router.refresh();
    });
  }

  async function copyCode() {
    playButtonClick();
    try {
      await navigator.clipboard.writeText(social.friendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <GameScreen active="partie" nav="minimal">
      <div className={game.content}>
        <div className={`${game.contentInner} ${styles.column}`}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Équipage</p>
              <h1 className={game.title}>Mes amis</h1>
            </div>
            <Link href="/partie?mode=en-ligne" className={game.secondary} onClick={() => playButtonClick()}>
              ← Jouer en ligne
            </Link>
          </div>

          {social.challenges.length > 0 && (
            <section className={`${game.panel} ${styles.section}`} aria-label="Défis reçus">
              <h2 className={game.sectionTitle}>Défis reçus</h2>
              {social.challenges.map((challenge) => (
                <div key={challenge.id} className={game.banner}>
                  <p className={game.bannerTitle}>{challenge.fromName} te défie en match amical</p>
                  <div className={game.bannerActions}>
                    <Link
                      href={`/partie?mode=en-ligne&code=${challenge.inviteCode}`}
                      className={game.primary}
                      onClick={() => playButtonClick()}
                    >
                      Relever le défi
                    </Link>
                    <button type="button" className={game.ghost} disabled={pending} onClick={() => run(() => declineChallenge(challenge.id))}>
                      Décliner
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className={`${game.panel} ${styles.section}`} aria-label="Ajouter un ami">
            <h2 className={game.sectionTitle}>Ajouter un ami</h2>
            <p className={game.muted}>
              Ton code ami :{" "}
              <strong className={`${game.statValueGold} ${styles.code}`}>
                {social.friendCode}
              </strong>{" "}
              <button type="button" className={game.link} onClick={copyCode}>
                {copied ? "Copié !" : "Copier"}
              </button>
            </p>
            <p className={game.caption}>Donne-le à un ami : il l&apos;entre ici, et tu acceptes sa demande.</p>
            <form
              className={game.controlRow}
              onSubmit={(event) => {
                event.preventDefault();
                if (code.length !== 8) return;
                run(async () => {
                  const result = await addFriendByCode(code);
                  if (result.ok) setCode("");
                  return result;
                });
              }}
            >
              <input
                className={game.input}
                value={code}
                onChange={(event) => setCode(normalizeFriendCode(event.target.value))}
                placeholder="Code ami de ton ami"
                aria-label="Code ami"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                style={{ letterSpacing: "0.2em", textTransform: "uppercase" }}
              />
              <button type="submit" className={game.primary} disabled={pending || code.length !== 8}>
                Envoyer la demande
              </button>
            </form>
            {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
          </section>

          {social.incoming.length > 0 && (
            <section className={`${game.panel} ${styles.section}`} aria-label="Demandes reçues">
              <h2 className={game.sectionTitle}>Demandes reçues</h2>
              {social.incoming.map((request) => (
                <div key={request.userId} className={`${game.listRow} ${styles.row}`}>
                  <span>{request.name}</span>
                  <span className={game.bannerActions}>
                    <button type="button" className={game.primary} disabled={pending} onClick={() => run(() => answerFriendRequest(request.userId, true))}>
                      Accepter
                    </button>
                    <button type="button" className={game.ghost} disabled={pending} onClick={() => run(() => answerFriendRequest(request.userId, false))}>
                      Refuser
                    </button>
                  </span>
                </div>
              ))}
            </section>
          )}

          <section className={`${game.panel} ${styles.section}`} aria-label="Amis">
            <h2 className={game.sectionTitle}>Amis ({social.friends.length})</h2>
            {social.friends.length === 0 ? (
              <p className={game.muted}>Pas encore d&apos;ami à bord. Échange ton code ami pour en ajouter.</p>
            ) : (
              social.friends.map((friend) => (
                <div key={friend.userId} className={`${game.listRow} ${styles.row}`}>
                  <span>
                    {friend.name} <span className={PRESENCE_TAG[friend.presence]}>{PRESENCE_LABEL[friend.presence]}</span>
                  </span>
                  <span className={game.bannerActions}>
                    <Link
                      href={`/partie?mode=en-ligne&ami=${friend.userId}`}
                      className={game.primary}
                      onClick={() => playButtonClick()}
                    >
                      Défier
                    </Link>
                    <button
                      type="button"
                      className={game.dangerGhost}
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Retirer ${friend.name} de tes amis ?`)) run(() => removeFriend(friend.userId));
                      }}
                    >
                      Retirer
                    </button>
                  </span>
                </div>
              ))
            )}
          </section>

          {social.outgoing.length > 0 && (
            <section className={`${game.panel} ${styles.section}`} aria-label="Demandes envoyées">
              <h2 className={game.sectionTitle}>Demandes envoyées</h2>
              {social.outgoing.map((request) => (
                <div key={request.userId} className={`${game.listRow} ${styles.row}`}>
                  <span>
                    {request.name} <span className={game.tag}>En attente</span>
                  </span>
                  <button type="button" className={game.ghost} disabled={pending} onClick={() => run(() => removeFriend(request.userId))}>
                    Annuler
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </GameScreen>
  );
}
