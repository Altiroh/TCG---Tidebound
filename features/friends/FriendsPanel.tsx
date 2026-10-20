"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchFriendsBoard } from "@/features/friends/actions";
import { FriendsBoard, type FriendsBoardProps } from "@/features/friends/FriendsBoard";
import { SidePanel } from "@/features/shell/SidePanel";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/FriendsScreen.module.css";
import { playButtonClick } from "@/lib/sound";

type BoardData = Pick<FriendsBoardProps, "social" | "trades" | "recentOpponents">;

/**
 * AMIS en panneau — ce qu'ouvre l'icône Amis du bandeau, à droite de
 * l'enveloppe : consultable de partout, comme le Courrier et les Options.
 * Le même tableau que la page `/amis` (`FriendsBoard`), relu après chaque
 * action ; un lien vers une fiche, un échange ou un défi referme le panneau.
 */
export function FriendsPanel({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<BoardData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetchFriendsBoard()
      .then((board) => {
        setData(board);
        setFailed(board === null);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  return (
    <SidePanel title="Amis" onClose={onClose}>
      <div className={styles.column}>
        <span className={game.bannerActions}>
          <Link
            href="/vitrine"
            className={game.secondary}
            onClick={() => {
              playButtonClick();
              onClose();
            }}
          >
            Ma vitrine
          </Link>
          <Link
            href="/amis"
            className={game.secondary}
            onClick={() => {
              playButtonClick();
              onClose();
            }}
          >
            Page Amis →
          </Link>
        </span>
        {data ? (
          <FriendsBoard
            {...data}
            onChanged={() => {
              load();
              onChanged?.();
            }}
            onLeave={onClose}
          />
        ) : failed ? (
          <p className={game.error}>Amis indisponibles pour le moment.</p>
        ) : (
          <p className={game.muted}>Chargement de l&apos;équipage…</p>
        )}
      </div>
    </SidePanel>
  );
}
