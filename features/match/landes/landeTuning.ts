"use client";

import { useSyncExternalStore } from "react";

/**
 * RÉGLAGES DE SCÈNE d'une Lande — les valeurs que le laboratoire
 * (`/game/lande-preview`, panneau « Réglages ») fait varier en direct.
 *
 * En partie, personne ne les touche : les valeurs par défaut SONT le rendu.
 * Une fois un réglage trouvé au labo, il se recopie ici.
 */
export interface LandeTuning {
  /** Luminosité du sol (`LandeScene.floor`) : 1 = l'image telle quelle. */
  floorBrightness: number;
  /** Opacité de la teinte de scène (`LandeScene.tint`). */
  tintOpacity: number;
  /** Opacité du voile qui assombrit le haut et le bas de la scène. */
  veilOpacity: number;
  /** Opacité du pont du navire quand un sol le remplace. */
  deckOpacity: number;
  /** Opacité du décor de la table (lanternes, tonneaux, barre) quand un sol remplace la mer. */
  decorOpacity: number;
  /** Multiplicateur de taille des pièces de décor (`LandeProps`). */
  propScale: number;
  /** Taille maximale (px) d'une pièce de décor. */
  propMax: number;
  /**
   * 1 : les pièces ne sont plus tenues par la hauteur de leur bande ni par
   * l'interface (elles peuvent la recouvrir) — seulement par `propMax`.
   */
  propFree: number;
}

export const LANDE_TUNING_DEFAULTS: Readonly<LandeTuning> = {
  floorBrightness: 1,
  tintOpacity: 1,
  veilOpacity: 1,
  deckOpacity: 1,
  decorOpacity: 1,
  propScale: 1,
  propMax: 300,
  propFree: 0,
};

let current: LandeTuning = { ...LANDE_TUNING_DEFAULTS };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Labo seulement : change un réglage, la scène suit aussitôt. */
export function setLandeTuning(patch: Partial<LandeTuning>) {
  current = { ...current, ...patch };
  listeners.forEach((listener) => listener());
}

export function useLandeTuning(): LandeTuning {
  return useSyncExternalStore(subscribe, () => current, () => LANDE_TUNING_DEFAULTS as LandeTuning);
}
