"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchFriendsBoard, fetchMyPlayerCard, fetchPlayerCard } from "@/features/friends/actions";
import { inviteToBattle } from "@/features/friends/lobbyActions";
import { fetchTradeTable } from "@/features/friends/tradeActions";
import { FriendsBoard, type FriendsBoardProps } from "@/features/friends/FriendsBoard";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import type { TradeableCard } from "@/features/friends/tradeService";
import { PlayerSheet } from "@/features/friends/PlayerSheet";
import { TradeComposer } from "@/features/friends/TradeComposer";
import { SidePanel } from "@/features/shell/SidePanel";
import game from "@/features/shell/GameScreen.module.css";

type BoardData = Pick<FriendsBoardProps, "social" | "trades" | "recentOpponents">;

/**
 * Ce que montre le panneau : le tableau, une fiche (la sienne ou celle d'un
 * autre), ou un échange en préparation.
 */
type View =
  | { kind: "board" }
  | { kind: "player"; userId: string }
  | { kind: "me" }
  | { kind: "trade"; userId: string };

/**
 * AMIS — tout le volet social tient dans ce panneau, ouvert par l'icône du
 * bandeau à droite de l'enveloppe (comme le Courrier et les Options), ou par
 * le signal `requestFriendsPanel`. Pas de page : le tableau, les fiches de
 * capitaine (`PlayerProfileCard`, vitrine comprise) et la proposition
 * d'échange s'y succèdent ; sa vitrine se compose depuis la Collection. « Combat »
 * invite l'ami dans un salon, et y mène.
 */
export function FriendsPanel({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "board" });
  const [board, setBoard] = useState<BoardData | null>(null);
  const [player, setPlayer] = useState<PlayerCardView | null>(null);
  const [table, setTable] = useState<{ mine: TradeableCard[]; theirs: TradeableCard[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  const loadBoard = useCallback(() => {
    fetchFriendsBoard()
      .then((data) => {
        setBoard(data);
        setFailed(data === null);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(loadBoard, [loadBoard]);

  // La fiche (et la table d'échange) se lisent à l'ouverture de leur vue.
  const target = view.kind === "player" || view.kind === "trade" ? view.userId : view.kind === "me" ? "me" : null;
  const loadPlayer = useCallback(() => {
    if (!target) return;
    (target === "me" ? fetchMyPlayerCard() : fetchPlayerCard(target))
      .then((card) => {
        setPlayer(card);
        setFailed(card === null);
      })
      .catch(() => setFailed(true));
  }, [target]);

  useEffect(() => {
    setPlayer(null);
    setTable(null);
    setFailed(false);
    if (!target) return;
    loadPlayer();
    if (view.kind === "trade") {
      fetchTradeTable(view.userId)
        .then((data) => {
          setTable(data);
          setFailed(data === null);
        })
        .catch(() => setFailed(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la vue d'échange se relit avec sa cible
  }, [target, view.kind, loadPlayer]);

  function changed() {
    loadBoard();
    onChanged?.();
  }

  /** Combat : l'invitation part dans le Courrier de l'ami, et le salon s'ouvre ici. */
  async function challenge(friendId: string) {
    setChallengeError(null);
    const result = await inviteToBattle(friendId).catch(() => ({ ok: false as const, error: "Le serveur est injoignable." }));
    if (!result.ok) {
      setChallengeError(result.error);
      return;
    }
    onClose();
    router.push(`/en-ligne/salon/${result.lobbyId}`);
  }

  const loading = <p className={game.muted}>Chargement de l&apos;équipage…</p>;
  const backToBoard = () => setView({ kind: "board" });

  let content;
  if (failed) {
    content = (
      <>
        <p className={game.error}>Amis indisponibles pour le moment.</p>
        {view.kind !== "board" && (
          <button type="button" className={game.secondary} onClick={backToBoard}>
            ← Mes amis
          </button>
        )}
      </>
    );
  } else if (view.kind === "board") {
    content = board ? (
      <>
        {challengeError && <p className={game.error}>{challengeError}</p>}
        <FriendsBoard
          {...board}
          onChanged={changed}
          onLeave={onClose}
          onOpenPlayer={(id) => setView({ kind: "player", userId: id })}
          onOpenTrade={(id) => setView({ kind: "trade", userId: id })}
          onOpenMe={() => setView({ kind: "me" })}
          onChallenge={(id) => void challenge(id)}
        />
      </>
    ) : (
      loading
    );
  } else if (view.kind === "player" || view.kind === "me") {
    content = player ? (
      <PlayerSheet
        player={player}
        onBack={backToBoard}
        onTrade={() => setView({ kind: "trade", userId: player.userId })}
        onChanged={() => {
          loadPlayer();
          changed();
        }}
        onLeave={onClose}
      />
    ) : (
      loading
    );
  } else {
    content =
      player && table ? (
        <TradeComposer
          friend={{ userId: player.userId, name: player.name }}
          mine={table.mine}
          theirs={table.theirs}
          onBack={() => setView({ kind: "player", userId: player.userId })}
          onSent={() => {
            changed();
            backToBoard();
          }}
        />
      ) : (
        loading
      );
  }

  return (
    <SidePanel title="Amis" iconSrc="/assets/ui/icons/amis.webp" onClose={onClose}>
      {content}
    </SidePanel>
  );
}
