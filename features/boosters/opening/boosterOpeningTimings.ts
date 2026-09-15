import type { BoosterOpeningRarity } from "@/features/boosters/opening/types";

/**
 * Rythme de la scène — SEULE source de vérité des durées. Le contrôleur
 * (`BoosterOpeningScene`) s'en sert pour enchaîner les phases, et les
 * pousse en variables CSS (`--t-*`) pour que les keyframes restent
 * synchronisées avec lui. Toutes les valeurs sont en millisecondes.
 */
export interface BoosterOpeningTimings {
  backdropIn: number;
  /** Arrivée du paquet au centre. */
  packEnter: number;
  /** Paquet immobile (léger flottement) avant qu'il n'attende le geste d'ouverture. */
  packHold: number;
  /** Petite compression du paquet juste avant la découpe. */
  tension: number;
  /** Fondu paquet fermé → paquet découpé (masque le raccord des deux visuels). */
  crossfade: number;
  /** Déchirure : la bande se décolle en plusieurs à-coups, attachée côté droit. */
  tear: number;
  /** Envol de la bande une fois qu'elle a cédé. */
  topFly: number;
  /** Depuis la rupture de la bande : moment où la première carte commence à monter. */
  spawnAfterSnap: number;
  cardStagger: number;
  /** Montée d'une carte à l'intérieur du sachet, jusqu'à la sortie. */
  cardRise: number;
  /** Trajet de la sortie du sachet jusqu'à la place finale. */
  cardPlace: number;
  /** Retrait du paquet vide une fois la dernière carte sortie. */
  packRetreat: number;
  /** Pause d'anticipation avant le retournement, par palier. */
  revealPause: Record<BoosterOpeningRarity, number>;
  flip: Record<BoosterOpeningRarity, number>;
  /** Durée de l'impact lumineux après retournement. */
  revealImpact: Record<BoosterOpeningRarity, number>;
  /** Abyssale révélée : vol de la rangée jusqu'au centre de l'écran, pour le gros plan. */
  showcaseIn: number;
  /** Retour du gros plan à sa place dans la rangée. */
  showcaseOut: number;
  uiIn: number;
  sceneOut: number;
}

export const BOOSTER_OPENING_TIMINGS: BoosterOpeningTimings = {
  backdropIn: 320,
  packEnter: 480,
  packHold: 420,
  tension: 170,
  crossfade: 70,
  tear: 720,
  topFly: 580,
  spawnAfterSnap: 180,
  cardStagger: 150,
  cardRise: 380,
  cardPlace: 540,
  packRetreat: 620,
  revealPause: { common: 0, uncommon: 0, rare: 200, epic: 280, legendary: 420, abyssal: 520 },
  flip: { common: 440, uncommon: 450, rare: 500, epic: 540, legendary: 600, abyssal: 640 },
  revealImpact: { common: 700, uncommon: 800, rare: 1000, epic: 1150, legendary: 1500, abyssal: 1600 },
  showcaseIn: 720,
  showcaseOut: 520,
  uiIn: 380,
  sceneOut: 300,
};

/**
 * `prefers-reduced-motion` : tout est fortement raccourci mais rien n'est
 * supprimé — le paquet s'ouvre toujours, et chaque carte se retourne encore.
 */
export const BOOSTER_OPENING_TIMINGS_REDUCED: BoosterOpeningTimings = {
  backdropIn: 120,
  packEnter: 160,
  packHold: 140,
  tension: 0,
  crossfade: 60,
  tear: 180,
  topFly: 220,
  spawnAfterSnap: 40,
  cardStagger: 50,
  cardRise: 150,
  cardPlace: 200,
  packRetreat: 200,
  revealPause: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, abyssal: 0 },
  flip: { common: 220, uncommon: 220, rare: 220, epic: 220, legendary: 240, abyssal: 240 },
  revealImpact: { common: 300, uncommon: 300, rare: 400, epic: 400, legendary: 500, abyssal: 500 },
  showcaseIn: 200,
  showcaseOut: 160,
  uiIn: 140,
  sceneOut: 120,
};

/** Instant (depuis le début de la phase opening) où la bande commence à se déchirer. */
export function tearStartAt(timings: BoosterOpeningTimings): number {
  return timings.tension + timings.crossfade / 2;
}

/** Instant (depuis le début de la phase opening) où la bande cède et s'envole. */
export function tearSnapAt(timings: BoosterOpeningTimings): number {
  return tearStartAt(timings) + timings.tear;
}

/** Instant (depuis le début de la sortie des cartes) où la dernière carte a franchi l'ouverture. */
export function lastCardExitAt(timings: BoosterOpeningTimings, cardCount: number): number {
  return Math.max(0, cardCount - 1) * timings.cardStagger + timings.cardRise;
}

/** Instant (depuis le début de la sortie des cartes) où toutes les cartes sont posées ET le paquet retiré. */
export function cardsSettledAt(timings: BoosterOpeningTimings, cardCount: number): number {
  const lastCardLanded = lastCardExitAt(timings, cardCount) + timings.cardPlace;
  const packGone = lastCardExitAt(timings, cardCount) + PACK_RETREAT_GAP_MS + timings.packRetreat;
  return Math.max(lastCardLanded, packGone);
}

/** Marge entre la sortie de la dernière carte et le début du retrait du paquet. */
export const PACK_RETREAT_GAP_MS = 80;
