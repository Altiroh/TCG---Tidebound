"use client";

/**
 * Sons de l'ouverture de booster — architecture prête, fichiers pas encore
 * produits. Tant qu'une entrée de `BOOSTER_SOUND_FILES` est `null`, la
 * fonction correspondante ne fait strictement rien (pas même une requête
 * réseau vers un fichier absent). Pour brancher un son : déposer le fichier
 * dans `public/assets/sound/` et renseigner son chemin ici.
 *
 * Comme tous les autres sons du jeu, ceux-ci sont soumis à l'interrupteur
 * et au volume "Effets" des Options (`lib/settings.ts`).
 */

import { playBoosterOpen, playCardDraw } from "@/lib/sound";
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
  const settings = getAudioSettings();
  if (!settings.effects || settings.effectsVolume === 0) return;
  try {
    const audio = new Audio(src);
    audio.volume = BOOSTER_SOUND_VOLUME[key] * settings.effectsVolume;
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

/**
 * Début de la déchirure : la bande se décolle en plusieurs à-coups.
 * `booster-open.mp3` (1,7 s) couvre la déchirure ET l'envol de la bande :
 * il passe par `lib/sound` (volume mesuré, décodage partagé), et
 * `packOpen` reste sans fichier pour ne pas doubler le son.
 */
export function playPackTearSound(): void {
  playBoosterOpen();
}

/** La bande cède et s'envole. */
export function playPackOpenSound(): void {
  playBoosterSound("packOpen");
}

export function playCardSpawnSound(): void {
  playBoosterSound("cardSpawn");
}

/**
 * La carte se retourne. En attendant un son propre à l'ouverture, c'est
 * celui de la PIOCHE (`card-pioche.mp3`, 0,4 s) : c'est déjà le bruit
 * d'une carte manipulée dans ce jeu, il est court — une ouverture en
 * retourne cinq à la suite — et le retournement était jusqu'ici muet, ce
 * qui laissait le geste sans réponse (retour du 22/09).
 *
 * Même montage que `playPackTearSound` : il passe par `lib/sound` (volume
 * mesuré, décodage partagé) et `cardFlip` reste sans fichier propre pour
 * ne pas jouer deux sons.
 */
export function playCardFlipSound(): void {
  playCardDraw();
}

export function playRareRevealSound(): void {
  playBoosterSound("rareReveal");
}

export function playAbyssalRevealSound(): void {
  playBoosterSound("abyssalReveal");
}
