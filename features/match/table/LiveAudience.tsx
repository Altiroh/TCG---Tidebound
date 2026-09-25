"use client";

import { useMemo } from "react";
import { analyzeMatch, audienceMood } from "@/game/audience";
import type { GameState, PlayerId } from "@/game";
import styles from "@/features/match/table/Table.module.css";

/**
 * Le public, EN DIRECT, dans le coin haut droit de la table — volontairement
 * discret : un œil dont la lueur suit l'humeur de la salle, rien d'autre.
 * Pas de chiffre, pas d'alerte, pas d'animation qui réclame l'attention : le
 * joueur joue sans s'en soucier ; celui qui veut savoir survole l'œil.
 *
 * Même moteur que le verdict de fin de partie (`game/audience/`), lu sur
 * l'état courant — recalculé seulement quand le journal s'allonge.
 */
export function LiveAudience({ state, viewerId }: { state: GameState; viewerId: PlayerId }) {
  const spectacle = useMemo(
    () => analyzeMatch(state, viewerId).spectacle,
    // Le journal ne fait que s'allonger : sa longueur suffit à savoir s'il a changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.eventLog.length, state.status, viewerId]
  );
  const level = spectacle >= 70 ? "hot" : spectacle >= 45 ? "warm" : spectacle >= 25 ? "calm" : "cold";
  return (
    <span className={styles.liveAudience} data-level={level} title={`${audienceMood(spectacle)}.`} aria-label={`Public : ${audienceMood(spectacle).toLowerCase()}`}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={1.6} />
      </svg>
    </span>
  );
}
