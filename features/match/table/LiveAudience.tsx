"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeMatch, audienceMood, nextAudienceWeighted, readMoments, type AudienceMoment } from "@/game/audience";
import type { GameState, PlayerId } from "@/game";
import { fetchLiveAudienceContext } from "@/features/audience/actions";
import { AudienceTip } from "@/features/audience/AudienceTip";
import { RollingNumber } from "@/features/audience/RollingNumber";
import { useStockTicker } from "@/features/audience/useStockTicker";
import styles from "@/features/match/table/Table.module.css";

/** Durée d'affichage de la réaction de la salle sous le compteur. */
const CAPTION_MS = 2400;
/** Seuil (en points de spectacle) sous lequel un moment ne mérite pas qu'on l'écrive : le compteur suffit. */
const CAPTION_MIN_WEIGHT = 2;

/**
 * Le public, EN DIRECT, dans le coin haut droit de la table : un œil et le
 * nombre de spectateurs, sur une pastille sombre (comme au panneau des
 * Mécènes). Le nombre est l'audience qu'aurait le joueur si la partie
 * s'arrêtait là (`projectedAudience` : spectacle courant, formule et poids
 * d'adversaire du verdict) — à la fin, c'est EXACTEMENT ce que le serveur
 * écrit. Les moments infléchissent le spectacle : un bon coup le fait
 * monter, une mauvaise décision le fait baisser, et il défile comme un
 * cours de bourse, vert en montant, rouge en baissant, puis revient au blanc.
 * Contre un bot facile, la partie pèse peu : le compteur bouge peu.
 *
 * Un moment qui compte s'écrit aussi, un instant, sous la pastille — « Une
 * bordée au Navire adverse », « Une attaque mal engagée » : le joueur sait
 * POURQUOI la salle a bougé.
 *
 * Recalculé seulement quand le journal s'allonge. L'humeur de la salle
 * (spectacle du moment) se lit au survol.
 */
export function LiveAudience({ state, viewerId, matchId }: { state: GameState; viewerId: PlayerId; matchId?: string }) {
  const [base, setBase] = useState<{ audience: number; weight: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchLiveAudienceContext(matchId)
      .then((context) => !cancelled && setBase(context))
      .catch(() => !cancelled && setBase({ audience: 0, weight: 0 }));
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // Le journal ne fait que s'allonger : sa longueur suffit à savoir s'il a changé.
  const logLength = state.eventLog.length;
  const spectacle = useMemo(
    () => analyzeMatch(state, viewerId).spectacle,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logLength, state.status, viewerId]
  );
  const target = base === null ? null : nextAudienceWeighted(base.audience, spectacle, base.weight);
  const latest = useMemo(
    () => {
      const moments = readMoments(state, viewerId);
      return moments[moments.length - 1] ?? null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logLength, viewerId]
  );
  const caption = useMomentCaption(latest);
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
        {caption && (
          <span key={caption.index} className={styles.liveAudienceCaption} data-sign={caption.weight > 0 ? "up" : "down"} role="status">
            {caption.label}
          </span>
        )}
      </span>
    </AudienceTip>
  );
}

/**
 * Le dernier moment qui compte, le temps de le lire. Seuls les moments
 * NOUVEAUX s'écrivent : à l'arrivée sur la table (ou au rechargement), la
 * salle ne rejoue pas le dernier coup déjà vu.
 */
function useMomentCaption(latest: AudienceMoment | null): AudienceMoment | null {
  const seenIndex = useRef<number | null>(null);
  const [caption, setCaption] = useState<AudienceMoment | null>(null);
  useEffect(() => {
    const index = latest?.index ?? -1;
    if (seenIndex.current === null) {
      seenIndex.current = index;
      return;
    }
    if (!latest || index <= seenIndex.current) return;
    seenIndex.current = index;
    if (Math.abs(latest.weight) < CAPTION_MIN_WEIGHT) return;
    setCaption(latest);
    const timer = setTimeout(() => setCaption(null), CAPTION_MS);
    return () => clearTimeout(timer);
  }, [latest]);
  return caption;
}
