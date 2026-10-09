"use client";

import { fetchPreferences, savePreferences } from "@/features/settings/preferencesActions";

/**
 * PRÉFÉRENCES DU JOUEUR — sur le COMPTE, avec une copie sur l'appareil
 * (10/10/2026).
 *
 * Son, volumes, raccourcis du bandeau, niveau du bot, dernier deck, filtres
 * et tris des écrans… vivaient en `localStorage` seulement : ils ne suivaient
 * pas le joueur d'un navigateur à l'autre. Ils vivent désormais en base
 * (`player_preferences`, `features/settings/preferencesActions.ts`) :
 *
 *  - LECTURE SYNCHRONE : mémoire, sinon copie locale. `lib/sound.ts` doit
 *    savoir « je joue ou pas » sans attendre le réseau, et un écran doit
 *    pouvoir s'afficher tout de suite avec les réglages de la dernière fois ;
 *  - au premier écran, `hydratePreferences` relit le compte : ses valeurs
 *    l'emportent sur la copie locale, et tout le monde est prévenu
 *    (`subscribePreferences`) ;
 *  - ce que l'appareil connaît et que le compte n'a pas encore (réglages
 *    d'avant cette version) est VERSÉ sur le compte, une fois : rien n'est
 *    perdu au passage ;
 *  - ÉCRITURE : mémoire et copie locale aussitôt, compte un instant après,
 *    par lots (`FLUSH_DELAY_MS`). Sans session (pages publiques), le compte
 *    refuse et la copie locale suffit.
 *
 * Les clés sont celles du `localStorage` d'avant (`tidebound:…`) : les
 * valeurs déjà retenues sur l'appareil restent lisibles. Ce qui dépend de
 * l'APPAREIL (encart d'installation, anti-boucle de rechargement, outils de
 * diagnostic) ne passe pas par ici et reste en `localStorage` direct.
 */

/** Clés suivies par le compte, en plus de toute la famille `tidebound:filtres:`. */
const SYNCED_KEYS = new Set([
  "tidebound:audio-settings",
  "tidebound:interface-settings",
  "tidebound:nouvelle-partie:niveau-bot",
  "tidebound:nouvelle-partie:dernier-deck",
  "tb:streak-popup-day",
  "tb:sponsors-seen",
]);

/** Les favoris de decks ont déjà leur table (`player_deck_favorites`) : la copie locale n'y est qu'un repli. */
const NOT_SYNCED = new Set(["tidebound:filtres:decks:favoris"]);

export function isSyncedPreference(key: string): boolean {
  if (NOT_SYNCED.has(key)) return false;
  return SYNCED_KEYS.has(key) || key.startsWith("tidebound:filtres:");
}

/** Origine d'un changement : un geste sur cet appareil, ou la relecture du compte. */
export type PreferenceOrigin = "local" | "account";

type Listener = (key: string, origin: PreferenceOrigin) => void;

const values = new Map<string, unknown>();
const listeners = new Set<Listener>();
/** Écrites sur cet appareil depuis le chargement : elles priment sur une relecture du compte arrivée après. */
const touched = new Set<string>();
const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hydration: Promise<boolean> | null = null;
let hydrated = false;

const FLUSH_DELAY_MS = 800;

/**
 * Relit une valeur de la copie locale. Les anciennes versions écrivaient
 * certaines valeurs brutes (un id de deck, un niveau de bot) et d'autres en
 * JSON : ce qui ne se lit pas en JSON est rendu tel quel.
 */
function readLocal(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    if (value === undefined || value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible (navigation privée stricte) ou plein : la mémoire et le compte suffisent.
  }
}

/** Valeur de la préférence `key`, ou `undefined` si le joueur n'en a jamais choisi. Synchrone. */
export function getPreference(key: string): unknown {
  if (values.has(key)) return values.get(key);
  if (typeof window === "undefined") return undefined;
  const local = readLocal(key);
  values.set(key, local);
  return local;
}

function notify(key: string, origin: PreferenceOrigin): void {
  for (const listener of listeners) listener(key, origin);
}

/** Retient `value` (`undefined`/`null` : retour à la valeur par défaut). Compte mis à jour un instant après. */
export function setPreference(key: string, value: unknown): void {
  const clean = value === null ? undefined : value;
  values.set(key, clean);
  writeLocal(key, clean);
  if (isSyncedPreference(key)) {
    touched.add(key);
    pending.set(key, clean ?? null);
    scheduleFlush();
  }
  notify(key, "local");
}

export function subscribePreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scheduleFlush(): void {
  if (flushTimer !== null || typeof window === "undefined") return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPreferences();
  }, FLUSH_DELAY_MS);
}

/** Envoie au compte ce qui attend. Sans session, le compte refuse : la copie locale garde la valeur. */
export async function flushPreferences(): Promise<void> {
  if (pending.size === 0) return;
  const batch = Object.fromEntries(pending);
  pending.clear();
  try {
    await savePreferences(batch);
  } catch {
    // Hors ligne : on retentera au prochain changement, la copie locale tient la valeur d'ici là.
  }
}

/** Clés suivies déjà connues de la copie locale (réglages d'avant cette version, ou d'une session sans compte). */
function localSyncedKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && isSyncedPreference(key)) keys.push(key);
    }
  } catch {
    // Stockage indisponible : rien à verser.
  }
  return keys;
}

/**
 * Relit les préférences du compte. Une fois réussie, elle ne se refait pas ;
 * sans session (page de connexion), elle rend `false` et pourra être
 * retentée après la connexion (`PreferencesSync`).
 */
export function hydratePreferences(): Promise<boolean> {
  if (hydrated) return Promise.resolve(true);
  if (hydration) return hydration;
  hydration = (async () => {
    let account: Record<string, unknown> | null = null;
    try {
      account = await fetchPreferences();
    } catch {
      account = null;
    }
    if (!account) return false;

    // Ce que l'appareil connaît et que le compte n'a pas : versé, une fois.
    for (const key of localSyncedKeys()) {
      if (key in account || touched.has(key)) continue;
      const local = getPreference(key);
      if (local !== undefined) pending.set(key, local);
    }

    for (const [key, value] of Object.entries(account)) {
      if (!isSyncedPreference(key) || touched.has(key)) continue;
      values.set(key, value);
      writeLocal(key, value);
      notify(key, "account");
    }

    hydrated = true;
    if (pending.size > 0) scheduleFlush();
    return true;
  })().finally(() => {
    hydration = null;
  });
  return hydration;
}
