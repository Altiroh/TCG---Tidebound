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
  // Mesuré : un peu moins fort que le clic en moyenne (-17 dB contre -14),
  // mais trois fois plus long (1 s) — il s'entend donc davantage. Réglé sous
  // le clic pour rester un souffle, pas un effet qui couvre l'interface.
  transition: 0.28,
  ambiance: 0.22,
};

const ATTACK_SOUNDS = [
  "/assets/sound/attack.mp3",
  "/assets/sound/attach-2.mp3",
  "/assets/sound/attack-3.mp3",
  "/assets/sound/attack-4.mp3",
  "/assets/sound/attack-5.mp3",
];

const TRANSITION_SOUNDS = [
  "/assets/sound/swoosh-transition.mp3",
  "/assets/sound/swoosh-transition-2.mp3",
  "/assets/sound/swoosh-transition-3.mp3",
];
let lastTransitionSound = -1;
/**
 * Instant du dernier swoosh. Un lien qui lance la transition déclenche AUSSI
 * le clic de bouton (son `onClick`), juste après : le clic, immédiat et
 * franc, couvrait le swoosh, qui ne monte qu'après ~150 ms. Dans cette
 * fenêtre, le swoosh REMPLACE le clic.
 */
let lastTransitionAt = -Infinity;
const CLICK_REPLACED_BY_SWOOSH_MS = 120;

/**
 * Effets joués par Web Audio, à partir de sons DÉCODÉS UNE FOIS et gardés en
 * mémoire. Auparavant chaque lecture créait un `new Audio(src)` : le
 * navigateur rechargeait (au mieux depuis son cache) et redécodait le
 * fichier à chaque clic, d'où un léger retard sur un son censé répondre au
 * quart de tour. Chaque lecture reste une source indépendante : deux effets
 * qui se chevauchent (clics rapides) s'entendent tous les deux.
 */
let audioContext: AudioContext | null | undefined;
const decodedSounds = new Map<string, Promise<AudioBuffer | null>>();

/** Contexte partagé, créé au premier son. `null` si Web Audio est indisponible. */
function getAudioContext(): AudioContext | null {
  if (audioContext !== undefined) return audioContext;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioContext = Ctor ? new Ctor() : null;
  } catch {
    audioContext = null;
  }
  return audioContext;
}

function decodeSound(context: AudioContext, src: string): Promise<AudioBuffer | null> {
  let pending = decodedSounds.get(src);
  if (!pending) {
    pending = fetch(src)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
    decodedSounds.set(src, pending);
  }
  return pending;
}

/** Repli historique : un élément `Audio` jetable (Web Audio absent, ou son pas encore décodé). */
function playWithElement(src: string, gain: number): void {
  try {
    const audio = new Audio(src);
    audio.volume = gain;
    void audio.play().catch(() => {
      // Autoplay bloqué ou fichier indisponible : silencieux, jamais bloquant.
    });
  } catch {
    // Best-effort.
  }
}

function play(src: string, volume: number): void {
  const settings = getAudioSettings();
  // Volume à 0 : inutile de lancer une lecture que personne n'entendra.
  if (!settings.effects || settings.effectsVolume === 0) return;
  const gain = volume * settings.effectsVolume;

  const context = getAudioContext();
  if (!context) {
    playWithElement(src, gain);
    return;
  }
  // Suspendu tant qu'aucune interaction n'a eu lieu : un clic le réveille.
  if (context.state === "suspended") void context.resume().catch(() => undefined);

  const decoded = decodedSounds.get(src);
  if (!decoded) {
    // Toute première lecture de ce son : on la joue par l'ancien chemin pour
    // ne pas la perdre, pendant que le décodage se fait pour les suivantes.
    playWithElement(src, gain);
    void decodeSound(context, src);
    return;
  }

  void decoded.then((buffer) => {
    if (!buffer) {
      playWithElement(src, gain);
      return;
    }
    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gainNode = context.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode).connect(context.destination);
      source.start();
    } catch {
      // Best-effort.
    }
  });
}

/** Clic générique — boutons de l'UI (menus, decks, plateau...). */
export function playButtonClick(): void {
  if (performance.now() - lastTransitionAt < CLICK_REPLACED_BY_SWOOSH_MS) return;
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

/**
 * Souffle de l'ombre de changement de page (`PageTransition`) — un des trois,
 * jamais deux fois le même d'affilée. Joué au DÉPART de l'ombre : le pic des
 * trois fichiers tombe entre 300 et 450 ms, soit au moment où l'écran est
 * couvert et commence à se découvrir.
 */
export function playTransitionSwoosh(): void {
  const others = TRANSITION_SOUNDS.map((_, i) => i).filter((i) => i !== lastTransitionSound);
  const index = others[Math.floor(Math.random() * others.length)]!;
  lastTransitionSound = index;
  lastTransitionAt = performance.now();
  play(TRANSITION_SOUNDS[index]!, VOLUME.transition);
}

/**
 * Décode les swooshes à l'avance : sans cela, le PREMIER passe par un
 * élément `Audio` qui doit d'abord charger le fichier, et arrive en retard.
 * Un contexte encore suspendu (aucun geste du joueur) décode quand même.
 */
export function preloadTransitionSounds(): void {
  const context = getAudioContext();
  if (!context) return;
  for (const src of TRANSITION_SOUNDS) void decodeSound(context, src);
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
  const settings = getAudioSettings();

  // Le volume, lui, s'applique même quand la musique tourne déjà : bouger le
  // curseur doit s'entendre tout de suite, sans couper puis relancer la piste.
  if (ambianceEl) ambianceEl.volume = VOLUME.ambiance * settings.musicVolume;

  if (!ambianceWanted || !settings.music) {
    if (ambianceEl) {
      ambianceEl.pause();
      ambianceEl.currentTime = 0;
    }
    return;
  }

  if (!ambianceEl) {
    ambianceEl = new Audio("/assets/sound/ambiance-menu.mp3");
    ambianceEl.loop = true;
    ambianceEl.volume = VOLUME.ambiance * settings.musicVolume;
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
