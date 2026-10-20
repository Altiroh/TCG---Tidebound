"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFriendFromMatch, answerFriendRequest } from "@/features/friends/actions";
import { inviteToBattle } from "@/features/friends/lobbyActions";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { PlayerProfileCard } from "@/features/friends/PlayerProfileCard";
import { useShowcaseEditing } from "@/features/friends/useShowcaseEditing";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/Social.module.css";
import { playButtonClick } from "@/lib/sound";

const RELATION_LABEL: Record<PlayerCardView["relation"], string> = {
  self: "Mon profil",
  friend: "Ami",
  request_sent: "Demande envoyée",
  request_received: "Te demande en ami",
  opponent: "Adversaire croisé",
};

/** Pastille près du nom : le lien déjà noué. */
const RELATION_BADGE: Partial<Record<PlayerCardView["relation"], string>> = {
  friend: "Ami",
  request_sent: "Demande envoyée",
};

interface PlayerSheetProps {
  player: PlayerCardView;
  onBack: () => void;
  /** Ouvre la proposition d'échange (amis seulement). */
  onTrade: () => void;
  /** Une action a changé le lien : la fiche et le tableau se relisent. */
  onChanged: () => void;
  /** On quitte le panneau (vers le salon de combat). */
  onLeave: () => void;
}

/**
 * FICHE d'un joueur dans le panneau Amis (`PlayerProfileCard`), avec ce
 * qu'on peut faire avec lui : l'ajouter (adversaire croisé), accepter sa
 * demande, ou — ami — lui proposer un combat ou un échange. Sur sa propre
 * fiche, le « + » d'un emplacement vide mène à la Collection, où l'on expose.
 */
export function PlayerSheet({ player, onBack, onTrade, onChanged, onLeave }: PlayerSheetProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const self = player.relation === "self";
  // Sa vitrine s'arrange sur place : chaque geste s'affiche tout de suite et s'enregistre derrière.
  const editing = useShowcaseEditing(self ? player.showcase : null);

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    playButtonClick();
    setMessage(null);
    startTransition(async () => {
      const result: { ok: boolean; error?: string; message?: string } = await action().catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
      setMessage(result.ok ? (result.message ? { tone: "ok", text: result.message } : null) : { tone: "error", text: result.error ?? "Échec." });
      onChanged();
    });
  }

  /** On expose ses cartes depuis la Collection : le « + » d'un emplacement vide y mène. */
  function openCollection() {
    onLeave();
    router.push("/collection");
  }

  function challenge() {
    playButtonClick();
    setMessage(null);
    startTransition(async () => {
      const result = await inviteToBattle(player.userId).catch(() => ({ ok: false as const, error: "Le serveur est injoignable." }));
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      onLeave();
      router.push(`/en-ligne/salon/${result.lobbyId}`);
    });
  }

  const actions =
    player.relation === "friend" ? (
      <>
        <button type="button" className={game.primary} disabled={pending} onClick={challenge}>
          Proposer un combat
        </button>
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
      </>
    ) : player.relation === "request_received" ? (
      <button type="button" className={game.primary} disabled={pending} onClick={() => run(() => answerFriendRequest(player.userId, true))}>
        Accepter sa demande
      </button>
    ) : player.relation === "opponent" ? (
      <button type="button" className={game.primary} disabled={pending} onClick={() => run(() => addFriendFromMatch(player.userId))}>
        Ajouter en ami
      </button>
    ) : null;

  return (
    <div className={styles.column}>
      <div className={styles.row}>
        <p className={game.eyebrow}>{RELATION_LABEL[player.relation]}</p>
        <button type="button" className={game.secondary} onClick={onBack}>
          ← Mes amis
        </button>
      </div>
      <PlayerProfileCard
        player={self && editing.showcase ? { ...player, showcase: editing.showcase } : player}
        actions={actions}
        badge={RELATION_BADGE[player.relation] ?? null}
        onAddCard={self ? openCollection : undefined}
        onShowcaseChange={self ? (next) => void editing.commit(next) : undefined}
        saveStatus={editing.status}
        saveError={editing.error}
      />
      {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
    </div>
  );
}
