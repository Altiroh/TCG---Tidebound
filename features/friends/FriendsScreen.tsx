"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addFriendByCode, addFriendFromMatch, answerFriendRequest, declineChallenge, removeFriend } from "@/features/friends/actions";
import { acceptTrade, cancelTrade, declineTrade } from "@/features/friends/tradeActions";
import type { SocialView } from "@/features/friends/friendService";
import type { RecentOpponent } from "@/features/friends/playerCardService";
import type { TradesView } from "@/features/friends/tradeService";
import { TradeSummary } from "@/features/friends/TradeSummary";
import { normalizeFriendCode, PRESENCE_LABEL, type FriendPresence } from "@/features/friends/presence";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/FriendsScreen.module.css";
import { playButtonClick } from "@/lib/sound";
import { useDevMode } from "@/features/admin/useDevMode";
import { friendlyMatchLocked } from "@/features/online/friendlyMatchLock";

const PRESENCE_TAG: Record<FriendPresence, string | undefined> = {
  online: game.tagSuccess,
  in_match: game.tagBrass,
  offline: game.tag,
};

/** Temps restant avant l'expiration d'une offre d'échange. */
function remaining(expiresAt: string): string {
  const hours = Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000));
  return hours >= 1 ? `encore ${hours} h` : "expire bientôt";
}

/**
 * Amis : son code ami, l'ajout par code (ou parmi les adversaires récents),
 * les demandes reçues et envoyées, les défis et offres d'échange reçus, et
 * la liste — présence, fiche (vitrine), « Défier » et « Échanger ».
 *
 * Défier ouvre l'écran Partie en mode « En ligne », ami présélectionné : le
 * joueur y choisit son deck comme pour n'importe quelle partie.
 */
export function FriendsScreen({
  social,
  trades = { incoming: [], outgoing: [] },
  recentOpponents = [],
}: {
  social: SocialView;
  trades?: TradesView;
  recentOpponents?: RecentOpponent[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  // Match amical fermé hors mode Dev (`friendlyMatchLock.ts`) : ni défi à lancer, ni défi reçu à relever.
  const amicalLocked = friendlyMatchLocked(useDevMode());

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
    <GameScreen active="amis">
      <div className={game.content}>
        <div className={`${game.contentInner} ${styles.column}`}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Équipage</p>
              <h1 className={game.title}>Mes amis</h1>
            </div>
            <span className={game.bannerActions}>
              <Link href="/vitrine" className={game.secondary} onClick={() => playButtonClick()}>
                Ma vitrine
              </Link>
              <Link href="/partie?mode=en-ligne" className={game.secondary} onClick={() => playButtonClick()}>
                ← Jouer en ligne
              </Link>
            </span>
          </div>

          {trades.incoming.length > 0 && (
            <section className={`${game.panel} ${styles.section}`} aria-label="Échanges proposés">
              <h2 className={game.sectionTitle}>Échanges proposés</h2>
              {trades.incoming.map((trade) => (
                <div key={trade.id} className={game.banner}>
                  <p className={game.bannerTitle}>
                    {trade.otherName} te propose un échange <span className={game.caption}>({remaining(trade.expiresAt)})</span>
                  </p>
                  <TradeSummary offered={trade.offered} requested={trade.requested} giverLabel="Tu reçois" receiverLabel="Tu donnes" />
                  <div className={game.bannerActions}>
                    <button type="button" className={game.primary} disabled={pending} onClick={() => run(() => acceptTrade(trade.id))}>
                      Accepter l&apos;échange
                    </button>
                    <button type="button" className={game.ghost} disabled={pending} onClick={() => run(() => declineTrade(trade.id))}>
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {!amicalLocked && social.challenges.length > 0 && (
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
                    <Link href={`/amis/${friend.userId}`} className={game.link} onClick={() => playButtonClick()}>
                      {friend.name}
                    </Link>{" "}
                    <span className={PRESENCE_TAG[friend.presence]}>{PRESENCE_LABEL[friend.presence]}</span>
                  </span>
                  <span className={game.bannerActions}>
                    <Link href={`/amis/${friend.userId}/echange`} className={game.secondary} onClick={() => playButtonClick()}>
                      Échanger
                    </Link>
                    {!amicalLocked && (
                      <Link
                        href={`/partie?mode=en-ligne&ami=${friend.userId}`}
                        className={game.primary}
                        onClick={() => playButtonClick()}
                      >
                        Défier
                      </Link>
                    )}
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

          {trades.outgoing.length > 0 && (
            <section className={`${game.panel} ${styles.section}`} aria-label="Échanges envoyés">
              <h2 className={game.sectionTitle}>Échanges envoyés</h2>
              {trades.outgoing.map((trade) => (
                <div key={trade.id} className={game.banner}>
                  <p className={game.bannerTitle}>
                    À {trade.otherName} <span className={game.caption}>({remaining(trade.expiresAt)})</span>
                  </p>
                  <TradeSummary offered={trade.offered} requested={trade.requested} giverLabel="Tu donnes" receiverLabel="Tu reçois" />
                  <div className={game.bannerActions}>
                    <button type="button" className={game.ghost} disabled={pending} onClick={() => run(() => cancelTrade(trade.id))}>
                      Annuler l&apos;offre
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {recentOpponents.length > 0 && (
            <section className={`${game.panel} ${styles.section}`} aria-label="Adversaires récents">
              <h2 className={game.sectionTitle}>Adversaires récents</h2>
              <p className={game.caption}>Croisés en ligne : ajoute-les sans connaître leur code ami.</p>
              {recentOpponents.map((opponent) => (
                <div key={opponent.userId} className={`${game.listRow} ${styles.row}`}>
                  <Link href={`/amis/${opponent.userId}`} className={game.link} onClick={() => playButtonClick()}>
                    {opponent.name}
                  </Link>
                  <button type="button" className={game.secondary} disabled={pending} onClick={() => run(() => addFriendFromMatch(opponent.userId))}>
                    Ajouter en ami
                  </button>
                </div>
              ))}
            </section>
          )}

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
