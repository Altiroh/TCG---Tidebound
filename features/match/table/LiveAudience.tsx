"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeMatch, audienceMood, liveAudience } from "@/game/audience";
import type { GameState, PlayerId } from "@/game";
import { fetchMyAudience } from "@/features/audience/actions";
import { AudienceTip } from "@/features/audience/AudienceTip";
import { RollingNumber } from "@/features/audience/RollingNumber";
import { useStockTicker } from "@/features/audience/useStockTicker";
import styles from "@/features/match/table/Table.module.css";

/**
 * Le public, EN DIRECT, dans le coin haut droit de la table : un œil et le
 * nombre de spectateurs, sur une pastille sombre (comme au panneau des
 * Mécènes). Le nombre suit les MOMENTS de la partie (`game/audience/
 * moments.ts`) : un bon coup le fait monter, une mauvaise décision ou une
 * remontée adverse le fait baisser — et il défile comme un cours de bourse,
 * vert en montant, rouge en baissant, puis revient au blanc.
 *
 * Recalculé seulement quand le journal s'allonge. L'humeur de la salle
 * (spectacle du moment) se lit au survol.
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

  // Le journal ne fait que s'allonger : sa longueur suffit à savoir s'il a changé.
  const logLength = state.eventLog.length;
  const spectacle = useMemo(
    () => analyzeMatch(state, viewerId).spectacle,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logLength, state.status, viewerId]
  );
  const target = useMemo(
    () => (base === null ? null : liveAudience(base, state, viewerId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, logLength, viewerId]
  );
  const { shown, trend } = useStockTicker(target);
  const mood = audienceMood(spectacle);

  return (
    <AudienceTip mood={mood} placement="below">
      <span className={styles.liveAudience} data-trend={trend ?? undefined} aria-label={`Public : ${mood.toLowerCase()}`}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={1.8} />
        </svg>
        {shown !== null && <RollingNumber value={shown} className={styles.liveAudienceCount} />}
      </span>
    </AudienceTip>
  );
}
