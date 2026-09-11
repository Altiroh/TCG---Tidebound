"use client";

/**
 * Effets sonores et ambiance — fichiers réels fournis dans
 * `public/assets/sound/` (plus de synthèse Web Audio pour ces catégories,
 * cf. l'ancien `features/match/sound.ts`). Chaque lecture est best-effort :
 * un navigateur qui bloque l'audio (politique d'autoplay, contexte non
 * sécurisé) ne doit jamais faire échouer une action de jeu, d'où les
 * `try/catch`/`.catch()` silencieux partout.
 */

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

/**
 * Lance l'ambiance du menu principal en boucle. Si l'autoplay est bloqué
 * (quasi systématique sans interaction préalable), retente automatiquement
 * au tout premier clic/touche appuyée n'importe où sur la page.
 */
export function startMenuAmbiance(): void {
  if (typeof window === "undefined") return;
  if (!ambianceEl) {
    ambianceEl = new Audio("/assets/sound/ambiance-menu.mp3");
    ambianceEl.loop = true;
    ambianceEl.volume = VOLUME.ambiance;
  }
  const el = ambianceEl;
  el.play().catch(() => {
    const retry = () => void el.play().catch(() => {});
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
  });
}

/** Coupe l'ambiance du menu (ex: en quittant l'écran d'accueil). */
export function stopMenuAmbiance(): void {
  if (!ambianceEl) return;
  ambianceEl.pause();
  ambianceEl.currentTime = 0;
}
