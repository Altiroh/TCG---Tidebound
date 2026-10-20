"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { answerFriendRequest, fetchSocialMail } from "@/features/friends/actions";
import { answerBattleInvitation } from "@/features/friends/lobbyActions";
import { requestFriendsPanel } from "@/features/friends/friendsPanelBus";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/Social.module.css";
import { playButtonClick } from "@/lib/sound";

type SocialMailData = NonNullable<Awaited<ReturnType<typeof fetchSocialMail>>>;

/**
 * Le volet social du COURRIER, en tête de la boîte de réception : les
 * invitations au combat (Rejoindre → le salon), les demandes d'ami
 * (Accepter / Refuser) et les offres d'échange (Voir → panneau Amis).
 * Rien hors volet social (`socialLock.ts`) : le serveur ne rend rien.
 */
export function SocialMail({ onLeave }: { onLeave: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<SocialMailData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchSocialMail()
      .then(setData)
      .catch(() => setData(null));
  }, []);
  useEffect(load, [load]);

  async function act(action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    playButtonClick();
    setBusy(true);
    setError(null);
    const result = await action().catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Échec.");
      load();
      return;
    }
    // Les pastilles du bandeau se relisent.
    notifyProgressionChanged();
    if (after) after();
    else load();
  }

  if (!data || data.invitations.length + data.requests.length + data.trades.length === 0) return null;

  return (
    <section className={styles.mailSocial} aria-label="Équipage">
      <h3 className={styles.mailSocialTitle}>Équipage</h3>
      {data.invitations.map((invitation) => (
        <div key={invitation.id} className={styles.mailSocialItem} data-kind="combat">
          <span className={styles.mailSocialText}>
            <strong>{invitation.fromName}</strong> te propose un combat
          </span>
          <span className={game.bannerActions}>
            <button
              type="button"
              className={game.primary}
              disabled={busy}
              onClick={() =>
                void act(
                  () => answerBattleInvitation(invitation.id, true),
                  () => {
                    onLeave();
                    router.push(`/en-ligne/salon/${invitation.id}`);
                  }
                )
              }
            >
              Rejoindre
            </button>
            <button type="button" className={game.ghost} disabled={busy} onClick={() => void act(() => answerBattleInvitation(invitation.id, false))}>
              Refuser
            </button>
          </span>
        </div>
      ))}
      {data.requests.map((request) => (
        <div key={request.userId} className={styles.mailSocialItem}>
          <span className={styles.mailSocialText}>
            <strong>{request.name}</strong> veut devenir ton ami
          </span>
          <span className={game.bannerActions}>
            <button type="button" className={game.primary} disabled={busy} onClick={() => void act(() => answerFriendRequest(request.userId, true))}>
              Accepter
            </button>
            <button type="button" className={game.ghost} disabled={busy} onClick={() => void act(() => answerFriendRequest(request.userId, false))}>
              Refuser
            </button>
          </span>
        </div>
      ))}
      {data.trades.map((trade) => (
        <div key={trade.id} className={styles.mailSocialItem}>
          <span className={styles.mailSocialText}>
            <strong>{trade.fromName}</strong> te propose un échange de cartes
          </span>
          <button
            type="button"
            className={game.secondary}
            onClick={() => {
              playButtonClick();
              onLeave();
              requestFriendsPanel();
            }}
          >
            Voir l&apos;offre
          </button>
        </div>
      ))}
      {error && <p className={game.error}>{error}</p>}
    </section>
  );
}
