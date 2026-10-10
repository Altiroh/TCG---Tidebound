"use client";

/**
 * Sons de l'ouverture de booster, moment par moment. Ils passent tous par
 * `lib/sound` (volume mesuré par fichier, décodage partagé, interrupteur et
 * volume "Effets" des Options) : la scène n'appelle que ces noms de moments,
 * le choix des fichiers et leur niveau vivent dans `lib/sound.ts`.
 */

import { playBoosterOpen, playBoosterSound } from "@/lib/sound";

export function playBoosterEnterSound(): void {
  playBoosterSound("enter");
}

/**
 * Début de la déchirure : la bande se décolle en plusieurs à-coups.
 * `booster-open.mp3` (1,7 s) couvre la déchirure ET l'envol de la bande,
 * d'où un `playPackOpenSound` muet : un second son doublerait le premier.
 */
export function playPackTearSound(): void {
  playBoosterOpen();
}

/**
 * La bande cède et s'envole. Volontairement muet (cf. `playPackTearSound`) ;
 * le point d'accroche reste dans la scène si un son propre à l'envol vient
 * un jour remplacer la fin de `booster-open.mp3`.
 */
export function playPackOpenSound(): void {}

export function playCardSpawnSound(): void {
  playBoosterSound("cardSpawn");
}

/**
 * La carte se retourne. Une ouverture en retourne cinq à la suite : le son
 * (`card-turn-over.mp3`) est court pour ne pas se marcher dessus.
 */
export function playCardFlipSound(): void {
  playBoosterSound("cardFlip");
}

/** Révélation d'une carte rare, épique ou légendaire (pas l'Abyssale). */
export function playRareRevealSound(): void {
  playBoosterSound("rareReveal");
}

export function playAbyssalRevealSound(): void {
  playBoosterSound("abyssalReveal");
}
