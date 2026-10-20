"use client";

import { useState } from "react";
import { cardArtworkThumbUrl } from "@/features/decks/cardArtUrl";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import styles from "@/features/friends/Social.module.css";

/** Illustration (carte d'avatar), pseudo, niveau et titre d'un joueur. */
export function PlayerIdentity({ player, className }: { player: Pick<PlayerCardView, "name" | "level" | "titleName" | "avatarCardId" | "avatarArtwork">; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`${styles.identity}${className ? ` ${className}` : ""}`}>
      <span className={styles.avatar}>
        {player.avatarCardId && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette d'illustration locale
          <img src={cardArtworkThumbUrl(player.avatarCardId, player.avatarArtwork)} alt="" draggable={false} onError={() => setBroken(true)} />
        ) : (
          <span className={styles.avatarEmpty} aria-hidden>
            {player.name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className={styles.identityText}>
        <span className={styles.name}>{player.name}</span>
        <span className={styles.subtitle}>
          Niveau {player.level}
          {player.titleName && ` · ${player.titleName}`}
        </span>
      </span>
    </div>
  );
}
