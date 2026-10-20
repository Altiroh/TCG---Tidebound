"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFriendFromMatch, answerFriendRequest } from "@/features/friends/actions";
import { inviteToBattle } from "@/features/friends/lobbyActions";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { PlayerProfileCard } from "@/features/friends/PlayerProfileCard";
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
  /** Sa propre fiche : choisir la carte d'un emplacement de vitrine. */
  onEditSlot?: (slot: number) => void;
}

/**
 * FICHE d'un joueur dans le panneau Amis (`PlayerProfileCard`), avec ce
 * qu'on peut faire avec lui : l'ajouter (adversaire croisé), accepter sa
 * demande, ou — ami — lui proposer un combat ou un échange. Sur sa propre
 * fiche, la vitrine se compose d'un toucher sur un emplacement.
 */
export function PlayerSheet({ player, onBack, onTrade, onChanged, onLeave, onEditSlot }: PlayerSheetProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    playButtonClick();
    setMessage(null);
    startTransition(async () => {
      const result: { ok: boolean; error?: string; message?: string } = await action().catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
      setMessage(result.ok ? (result.message ? { tone: "ok", text: result.message } : null) : { tone: "error", text: result.error ?? "Échec." });
      onChanged();
    });
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
      <PlayerProfileCard player={player} actions={actions} badge={RELATION_BADGE[player.relation] ?? null} onEditSlot={player.relation === "self" ? onEditSlot : undefined} />
      {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
    </div>
  );
}
