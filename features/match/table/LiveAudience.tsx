"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeMatch, audienceMood, readMoments, type AudienceMoment } from "@/game/audience";
import type { GameState, PlayerId } from "@/game";
import { fetchMyAudience } from "@/features/audience/actions";
import { AudienceTip } from "@/features/audience/AudienceTip";
import { RollingNumber } from "@/features/audience/RollingNumber";
import styles from "@/features/match/table/Table.module.css";

/** Durée d'affichage de la réaction de la salle sous le compteur. */
const CAPTION_MS = 2400;
/** Seuil (en points de spectacle) sous lequel un moment ne mérite pas qu'on l'écrive : la jauge suffit. */
const CAPTION_MIN_WEIGHT = 2;
/** Durée de la lueur verte ou rouge quand la salle change d'humeur. */
const MOOD_FLASH_MS = 1400;

/** Les cinq humeurs de la salle, de 20 en 20 points de spectacle (`audienceMood`). */
function moodStep(spectacle: number): number {
  return spectacle >= 80 ? 4 : spectacle >= 60 ? 3 : spectacle >= 40 ? 2 : spectacle >= 20 ? 1 : 0;
}

/**
 * Le public, EN DIRECT, dans le coin haut droit de la table : un œil, le
 * nombre de spectateurs, et l'HUMEUR de la salle en cinq crans.
 *
 * Le nombre, c'est votre public TEL QU'IL EST : il ne bouge pas pendant la
 * partie. Il ne se décide qu'à la fin, et l'écran de fin le montre changer.
 * La projection du 26/09 le faisait bouger, mais elle mentait deux fois : elle
 * s'ouvrait en baisse (le rythme et la victoire ne se comptent qu'une fois la
 * partie finie), puis basculait d'un coup à la dernière action (audit du
 * 27/09/2026).
 *
 * Ce qui vit en direct, c'est l'humeur : un bon coup la fait monter, une
 * mauvaise décision la fait baisser, et la pastille s'éclaire en vert ou en
 * rouge quand elle change de cran. Un moment qui compte s'écrit aussi, un
 * instant, sous la pastille — « Une bordée au Navire adverse » : le joueur
 * sait POURQUOI la salle a bougé.
 *
 * Recalculé seulement quand le journal s'allonge.
 */
export function LiveAudience({ state, viewerId }: { state: GameState; viewerId: PlayerId }) {
  const [audience, setAudience] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMyAudience()
      .then((value) => !cancelled && setAudience(value))
      .catch(() => !cancelled && setAudience(0));
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
  const latest = useMemo(
    () => {
      const moments = readMoments(state, viewerId);
      return moments[moments.length - 1] ?? null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logLength, viewerId]
  );
  const caption = useMomentCaption(latest);
  const mood = audienceMood(spectacle);
  const step = moodStep(spectacle);
  const trend = useMoodFlash(step);

  return (
    <AudienceTip mood={mood} placement="below">
      <span className={styles.liveAudience} data-live-audience="" data-trend={trend ?? undefined} aria-label={`Public : ${mood.toLowerCase()}`}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={1.8} />
        </svg>
        {audience !== null && <RollingNumber value={audience} className={styles.liveAudienceCount} />}
        {/* L'humeur en cinq crans : s'ennuie, s'impatiente, suit, captivé, debout. */}
        <span className={styles.liveAudienceMood} aria-hidden>
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className={styles.liveAudiencePip} data-on={index <= step || undefined} />
          ))}
        </span>
        {caption && (
          <span key={caption.index} className={styles.liveAudienceCaption} data-sign={caption.weight > 0 ? "up" : "down"} role="status">
            {caption.label}
          </span>
        )}
      </span>
    </AudienceTip>
  );
}

/** Vert quand la salle gagne un cran d'humeur, rouge quand elle en perd un, le temps d'une lueur. */
function useMoodFlash(step: number): "up" | "down" | null {
  const previous = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = step;
    if (before === null || before === step) return undefined;
    setFlash(step > before ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), MOOD_FLASH_MS);
    return () => clearTimeout(timer);
  }, [step]);
  return flash;
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
