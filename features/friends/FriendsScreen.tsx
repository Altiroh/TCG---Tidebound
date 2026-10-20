"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SocialView } from "@/features/friends/friendService";
import type { RecentOpponent } from "@/features/friends/playerCardService";
import type { TradesView } from "@/features/friends/tradeService";
import { FriendsBoard } from "@/features/friends/FriendsBoard";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/FriendsScreen.module.css";
import { playButtonClick } from "@/lib/sound";

/**
 * Page Amis : le tableau des amis (`FriendsBoard`, aussi ouvert en panneau
 * depuis l'icône du bandeau), avec l'accès à sa vitrine et au jeu en ligne.
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
          <FriendsBoard social={social} trades={trades} recentOpponents={recentOpponents} onChanged={() => router.refresh()} />
        </div>
      </div>
    </GameScreen>
  );
}
