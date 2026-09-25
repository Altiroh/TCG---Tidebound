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
  /**
   * Multiplicateurs 0→1 appliqués PAR-DESSUS le volume propre de chaque son
   * (`VOLUME` dans `lib/sound.ts`) : à 1, rien ne change par rapport au
   * mixage d'origine ; en dessous, tout baisse dans les mêmes proportions.
   * Indépendants de l'interrupteur — baisser le volume à 0 n'éteint pas
   * l'interrupteur, et le rallumer retrouve le volume réglé.
   */
  musicVolume: number;
  effectsVolume: number;
}

/** Référence stable — sert aussi de `getServerSnapshot` (le rendu serveur ne connaît pas le `localStorage` du joueur). */
const DEFAULTS: AudioSettings = { music: true, effects: true, musicVolume: 1, effectsVolume: 1 };

const STORAGE_KEY = "tidebound:audio-settings";

let cached: AudioSettings | null = null;
const listeners = new Set<() => void>();

/** Un volume relu du stockage peut être n'importe quoi (édition manuelle, ancienne version) : on le ramène toujours dans 0→1. */
function readVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

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
        musicVolume: readVolume(parsed?.musicVolume, DEFAULTS.musicVolume),
        effectsVolume: readVolume(parsed?.effectsVolume, DEFAULTS.effectsVolume),
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
  const clean = typeof value === "number" ? (readVolume(value, 1) as AudioSettings[K]) : value;
  const next = { ...read(), [key]: clean };
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

/* ── Interface ────────────────────────────────────────────────────── */

/** Préférences d'affichage, même principe que l'audio : sur l'appareil, pas sur le compte. */
export interface InterfaceSettings {
  /**
   * Raccourcis flottants vers les récompenses à réclamer, sous le bloc du
   * compte (`RewardShortcuts`). Oui par défaut (décision du 25/09/2026).
   */
  rewardShortcuts: boolean;
}

const INTERFACE_DEFAULTS: InterfaceSettings = { rewardShortcuts: true };
const INTERFACE_KEY = "tidebound:interface-settings";
let interfaceCached: InterfaceSettings | null = null;
const interfaceListeners = new Set<() => void>();

function readInterface(): InterfaceSettings {
  if (interfaceCached) return interfaceCached;
  if (typeof window === "undefined") return INTERFACE_DEFAULTS;
  interfaceCached = INTERFACE_DEFAULTS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INTERFACE_KEY) ?? "null") as Partial<InterfaceSettings> | null;
    interfaceCached = {
      rewardShortcuts: typeof parsed?.rewardShortcuts === "boolean" ? parsed.rewardShortcuts : INTERFACE_DEFAULTS.rewardShortcuts,
    };
  } catch {
    // Stockage indisponible ou JSON corrompu : valeurs par défaut.
  }
  return interfaceCached;
}

export function setInterfaceSetting<K extends keyof InterfaceSettings>(key: K, value: InterfaceSettings[K]): void {
  const next = { ...readInterface(), [key]: value };
  interfaceCached = next;
  try {
    window.localStorage.setItem(INTERFACE_KEY, JSON.stringify(next));
  } catch {
    // Appliqué pour la session, simplement pas retenu.
  }
  for (const listener of interfaceListeners) listener();
}

function subscribeInterfaceSettings(listener: () => void): () => void {
  interfaceListeners.add(listener);
  return () => interfaceListeners.delete(listener);
}

export function useInterfaceSettings(): InterfaceSettings {
  return useSyncExternalStore(subscribeInterfaceSettings, readInterface, () => INTERFACE_DEFAULTS);
}
