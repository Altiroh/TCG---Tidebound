"use client";

/**
 * Sons de l'ouverture de booster — architecture prête, fichiers pas encore
 * produits. Tant qu'une entrée de `BOOSTER_SOUND_FILES` est `null`, la
 * fonction correspondante ne fait strictement rien (pas même une requête
 * réseau vers un fichier absent). Pour brancher un son : déposer le fichier
 * dans `public/assets/sound/` et renseigner son chemin ici.
 *
 * Comme tous les autres sons du jeu, ceux-ci sont soumis à l'interrupteur
 * "Effets" des Options (`lib/settings.ts`).
 */

import { getAudioSettings } from "@/lib/settings";

type BoosterSoundKey = "enter" | "packTear" | "packOpen" | "cardSpawn" | "cardFlip" | "rareReveal" | "abyssalReveal";

const BOOSTER_SOUND_FILES: Record<BoosterSoundKey, string | null> = {
  enter: null,
  packTear: null,
  packOpen: null,
  cardSpawn: null,
  cardFlip: null,
  rareReveal: null,
  abyssalReveal: null,
};

const BOOSTER_SOUND_VOLUME: Record<BoosterSoundKey, number> = {
  enter: 0.35,
  packTear: 0.45,
  packOpen: 0.5,
  cardSpawn: 0.25,
  cardFlip: 0.35,
  rareReveal: 0.45,
  abyssalReveal: 0.55,
};

function playBoosterSound(key: BoosterSoundKey): void {
  const src = BOOSTER_SOUND_FILES[key];
  if (!src || typeof window === "undefined") return;
  if (!getAudioSettings().effects) return;
  try {
    const audio = new Audio(src);
    audio.volume = BOOSTER_SOUND_VOLUME[key];
    void audio.play().catch(() => {
      // Autoplay bloqué ou fichier indisponible : silencieux, jamais bloquant.
    });
  } catch {
    // Best-effort.
  }
}

export function playBoosterEnterSound(): void {
  playBoosterSound("enter");
}

/** Début de la déchirure : la bande se décolle en plusieurs à-coups. */
export function playPackTearSound(): void {
  playBoosterSound("packTear");
}

/** La bande cède et s'envole. */
export function playPackOpenSound(): void {
  playBoosterSound("packOpen");
}

export function playCardSpawnSound(): void {
  playBoosterSound("cardSpawn");
}

export function playCardFlipSound(): void {
  playBoosterSound("cardFlip");
}

export function playRareRevealSound(): void {
  playBoosterSound("rareReveal");
}

export function playAbyssalRevealSound(): void {
  playBoosterSound("abyssalReveal");
}
