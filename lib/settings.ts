"use client";

import { useSyncExternalStore } from "react";

/**
 * Réglages joueur persistés sur l'appareil (pas sur le compte) : ce sont
 * des préférences de confort liées au poste de jeu — couper la musique sur
 * l'ordinateur du salon n'a aucune raison de couper le son sur le
 * téléphone. Stockés en `localStorage`, lus de façon synchrone par
 * `lib/sound.ts` (qui doit pouvoir décider "je joue ou pas" sans passer par
 * React) et exposés aux composants via `useAudioSettings()`.
 */

export interface AudioSettings {
  /** Ambiance musicale de fond (menu principal pour l'instant). */
  music: boolean;
  /** Tous les autres sons : clics de boutons, pioche, impacts de combat, ouverture de boosters. */
  effects: boolean;
}

/** Référence stable — sert aussi de `getServerSnapshot` (le rendu serveur ne connaît pas le `localStorage` du joueur). */
const DEFAULTS: AudioSettings = { music: true, effects: true };

const STORAGE_KEY = "tidebound:audio-settings";

let cached: AudioSettings | null = null;
const listeners = new Set<() => void>();

function read(): AudioSettings {
  if (cached) return cached;
  if (typeof window === "undefined") return DEFAULTS;

  cached = DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioSettings> | null;
      cached = {
        music: typeof parsed?.music === "boolean" ? parsed.music : DEFAULTS.music,
        effects: typeof parsed?.effects === "boolean" ? parsed.effects : DEFAULTS.effects,
      };
    }
  } catch {
    // Stockage indisponible (navigation privée stricte) ou JSON corrompu :
    // on retombe sur les valeurs par défaut, jamais d'erreur au joueur.
  }
  return cached;
}

/** Lecture synchrone, utilisable hors React (cf. `lib/sound.ts`). */
export function getAudioSettings(): AudioSettings {
  return read();
}

export function setAudioSetting<K extends keyof AudioSettings>(key: K, value: AudioSettings[K]): void {
  const next = { ...read(), [key]: value };
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Préférence appliquée pour la session en cours, simplement pas retenue.
  }
  for (const listener of listeners) listener();
}

export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Version React des réglages audio — re-rend le composant à chaque changement. */
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings, () => DEFAULTS);
}
