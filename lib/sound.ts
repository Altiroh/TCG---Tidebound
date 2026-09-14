"use client";

/**
 * Effets sonores et ambiance — fichiers réels fournis dans
 * `public/assets/sound/` (plus de synthèse Web Audio pour ces catégories,
 * cf. l'ancien `features/match/sound.ts`). Chaque lecture est best-effort :
 * un navigateur qui bloque l'audio (politique d'autoplay, contexte non
 * sécurisé) ne doit jamais faire échouer une action de jeu, d'où les
 * `try/catch`/`.catch()` silencieux partout.
 *
 * Tout passe par ce module : c'est donc ici, et nulle part ailleurs, que
 * les interrupteurs "Musique" / "Effets" des Options (`lib/settings.ts`)
 * sont appliqués — aucun appelant n'a à s'en préoccuper.
 */

import { getAudioSettings, subscribeAudioSettings } from "@/lib/settings";

const VOLUME = {
  click: 0.35,
  draw: 0.4,
  attack: 0.55,
  ambiance: 0.22,
};

const ATTACK_SOUNDS = [
  "/assets/sound/attack.mp3",
  "/assets/sound/attach-2.mp3",
  "/assets/sound/attack-3.mp3",
  "/assets/sound/attack-4.mp3",
  "/assets/sound/attack-5.mp3",
];

/** Une instance `Audio` par lecture (plutôt qu'un élément partagé) : deux effets qui se chevauchent (ex: clics rapides) doivent tous les deux s'entendre, pas s'interrompre l'un l'autre. */
function play(src: string, volume: number): void {
  if (!getAudioSettings().effects) return;
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(() => {
      // Autoplay bloqué ou fichier indisponible : silencieux, jamais bloquant.
    });
  } catch {
    // Best-effort.
  }
}

/** Clic générique — boutons de l'UI (menus, decks, plateau...). */
export function playButtonClick(): void {
  play("/assets/sound/button-click.wav", VOLUME.click);
}

/** Une carte est piochée (pioche → main). */
export function playCardDraw(): void {
  play("/assets/sound/card-pioche.mp3", VOLUME.draw);
}

/** Impact de combat — un des 5 sons fournis, choisi au hasard pour ne pas se répéter identiquement à chaque coup. */
export function playRandomAttackSound(): void {
  const src = ATTACK_SOUNDS[Math.floor(Math.random() * ATTACK_SOUNDS.length)]!;
  play(src, VOLUME.attack);
}

let ambianceEl: HTMLAudioElement | null = null;
/** L'écran qui veut de l'ambiance est-il monté ? Indépendant du réglage "Musique" : c'est la conjonction des deux qui décide si le son tourne. */
let ambianceWanted = false;

/**
 * Aligne l'état réel de l'élément audio sur ce qui est voulu (écran monté ET
 * musique activée dans les Options). Rappelée aussi bien au montage/démontage
 * de l'écran qu'à chaque bascule de l'interrupteur, pour que couper la
 * musique depuis les Options la fasse taire immédiatement — et que la
 * réactiver la relance sans quitter le menu.
 */
function applyAmbiance(): void {
  if (typeof window === "undefined") return;

  if (!ambianceWanted || !getAudioSettings().music) {
    if (ambianceEl) {
      ambianceEl.pause();
      ambianceEl.currentTime = 0;
    }
    return;
  }

  if (!ambianceEl) {
    ambianceEl = new Audio("/assets/sound/ambiance-menu.mp3");
    ambianceEl.loop = true;
    ambianceEl.volume = VOLUME.ambiance;
  }
  const el = ambianceEl;
  el.play().catch(() => {
    // Autoplay bloqué (quasi systématique sans interaction préalable) :
    // on retente au tout premier clic/touche. Le `applyAmbiance()` du retry
    // re-vérifie les conditions — si la musique a été coupée entre-temps,
    // il ne relance rien.
    const retry = () => applyAmbiance();
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
  });
}

if (typeof window !== "undefined") {
  subscribeAudioSettings(applyAmbiance);
}

/** Lance l'ambiance du menu principal en boucle (sauf si la musique est coupée dans les Options). */
export function startMenuAmbiance(): void {
  ambianceWanted = true;
  applyAmbiance();
}

/** Coupe l'ambiance du menu (ex: en quittant l'écran d'accueil). */
export function stopMenuAmbiance(): void {
  ambianceWanted = false;
  applyAmbiance();
}
