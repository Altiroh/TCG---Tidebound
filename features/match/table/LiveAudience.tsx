"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeMatch, audienceMood, nextAudience } from "@/game/audience";
import type { GameState, PlayerId } from "@/game";
import { fetchMyAudience } from "@/features/audience/actions";
import { AudienceTip } from "@/features/audience/AudienceTip";
import { RollingNumber } from "@/features/audience/RollingNumber";
import styles from "@/features/match/table/Table.module.css";

/**
 * Le public, EN DIRECT, dans le coin haut droit de la table : un œil dont
 * la lueur suit l'humeur de la salle, et le nombre de spectateurs dont les
 * chiffres roulent au fil de la partie. Aucune alerte, rien à cliquer : le
 * joueur joue sans s'en soucier ; celui qui veut savoir survole.
 *
 * Le nombre, c'est l'audience que la partie laisserait si elle s'arrêtait
 * maintenant (`nextAudience` sur le spectacle du moment) : il part de
 * l'audience du joueur et monte ou descend avec ce qui se passe.
 *
 * Même moteur que le verdict de fin de partie (`game/audience/`), lu sur
 * l'état courant — recalculé seulement quand le journal s'allonge.
 */
export function LiveAudience({ state, viewerId }: { state: GameState; viewerId: PlayerId }) {
  const [base, setBase] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMyAudience()
      .then((audience) => !cancelled && setBase(audience))
      .catch(() => !cancelled && setBase(0));
    return () => {
      cancelled = true;
    };
  }, []);

  const spectacle = useMemo(
    () => analyzeMatch(state, viewerId).spectacle,
    // Le journal ne fait que s'allonger : sa longueur suffit à savoir s'il a changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.eventLog.length, state.status, viewerId]
  );
  const level = spectacle >= 70 ? "hot" : spectacle >= 45 ? "warm" : spectacle >= 25 ? "calm" : "cold";
  const mood = audienceMood(spectacle);
  const live = base === null ? null : nextAudience(base, spectacle);

  // La lampe : à chaque variation du nombre, un éclat vert (le public monte) ou rouge (il descend).
  const previous = useRef<number | null>(null);
  const [flash, setFlash] = useState<{ trend: "up" | "down"; id: number } | null>(null);
  useEffect(() => {
    if (live === null) return;
    const before = previous.current;
    previous.current = live;
    if (before === null || before === live) return;
    setFlash((current) => ({ trend: live > before ? "up" : "down", id: (current?.id ?? 0) + 1 }));
  }, [live]);

  return (
    <AudienceTip mood={mood} placement="below">
      <span className={styles.liveAudience} data-level={level} data-trend={flash?.trend} aria-label={`Public : ${mood.toLowerCase()}`}>
        <span className={styles.liveAudienceEye}>
          {flash && <span key={flash.id} className={styles.liveAudienceFlash} data-trend={flash.trend} aria-hidden />}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={1.6} />
          </svg>
        </span>
        {live !== null && <RollingNumber value={live} className={styles.liveAudienceCount} />}
      </span>
    </AudienceTip>
  );
}
