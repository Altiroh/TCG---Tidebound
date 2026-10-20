"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFriendsBoard, fetchPlayerCard } from "@/features/friends/actions";
import { fetchTradeTable } from "@/features/friends/tradeActions";
import { FriendsBoard, type FriendsBoardProps } from "@/features/friends/FriendsBoard";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import type { TradeableCard } from "@/features/friends/tradeService";
import { PlayerSheet } from "@/features/friends/PlayerSheet";
import { TradeComposer } from "@/features/friends/TradeComposer";
import { SidePanel } from "@/features/shell/SidePanel";
import game from "@/features/shell/GameScreen.module.css";

type BoardData = Pick<FriendsBoardProps, "social" | "trades" | "recentOpponents">;

/** Ce que montre le panneau : le tableau, la fiche d'un joueur, ou un échange en préparation. */
type View = { kind: "board" } | { kind: "player"; userId: string } | { kind: "trade"; userId: string };

/**
 * AMIS — tout le volet social tient dans ce panneau, ouvert par l'icône du
 * bandeau à droite de l'enveloppe (comme le Courrier et les Options), ou par
 * le signal `requestFriendsPanel`. Il n'y a pas de page Amis : le tableau,
 * la fiche d'un joueur (vitrine comprise) et la proposition d'échange s'y
 * succèdent. Sa propre vitrine se compose au profil.
 */
export function FriendsPanel({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [view, setView] = useState<View>({ kind: "board" });
  const [board, setBoard] = useState<BoardData | null>(null);
  const [player, setPlayer] = useState<PlayerCardView | null>(null);
  const [table, setTable] = useState<{ mine: TradeableCard[]; theirs: TradeableCard[] } | null>(null);
  const [failed, setFailed] = useState(false);

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
  const userId = view.kind === "board" ? null : view.userId;
  const loadPlayer = useCallback(() => {
    if (!userId) return;
    fetchPlayerCard(userId)
      .then((card) => {
        setPlayer(card);
        setFailed(card === null);
      })
      .catch(() => setFailed(true));
  }, [userId]);

  useEffect(() => {
    setPlayer(null);
    setTable(null);
    setFailed(false);
    if (!userId) return;
    loadPlayer();
    if (view.kind === "trade") {
      fetchTradeTable(userId)
        .then((data) => {
          setTable(data);
          setFailed(data === null);
        })
        .catch(() => setFailed(true));
    }
  }, [userId, view.kind, loadPlayer]);

  function changed() {
    loadBoard();
    onChanged?.();
  }

  const loading = <p className={game.muted}>Chargement de l&apos;équipage…</p>;
  const error = <p className={game.error}>Amis indisponibles pour le moment.</p>;
  const backToBoard = () => setView({ kind: "board" });

  let content;
  if (failed) {
    content = (
      <>
        {error}
        {view.kind !== "board" && (
          <button type="button" className={game.secondary} onClick={backToBoard}>
            ← Mes amis
          </button>
        )}
      </>
    );
  } else if (view.kind === "board") {
    content = board ? (
      <FriendsBoard
        {...board}
        onChanged={changed}
        onLeave={onClose}
        onOpenPlayer={(id) => setView({ kind: "player", userId: id })}
        onOpenTrade={(id) => setView({ kind: "trade", userId: id })}
      />
    ) : (
      loading
    );
  } else if (view.kind === "player") {
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
    <SidePanel title="Amis" onClose={onClose}>
      {content}
    </SidePanel>
  );
}
