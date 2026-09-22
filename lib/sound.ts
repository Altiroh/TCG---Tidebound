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
  ambiance: 0.22,
};

/**
 * RÉVISION des fichiers son — À MONTER À CHAQUE FICHIER REMPLACÉ SOUS LE
 * MÊME NOM (`ambiance-menu.mp3`, `card-pioche.mp3`…).
 *
 * `/assets/` est servi depuis deux caches qui gardent un fichier jusqu'à un
 * jour : le service worker (`public/sw.js`, cache d'abord) et le cache HTTP
 * (`next.config`, `max-age=86400`). Même nom = même adresse = l'ANCIEN son.
 * La révision change l'adresse (`?v=`) : les deux caches la voient comme
 * un fichier neuf.
 */
const SOUND_REV = 2;

function soundUrl(src: string): string {
  return `${src}?v=${SOUND_REV}`;
}

/**
 * Chaque effet et SON volume, fichier par fichier. Les fichiers fournis ne
 * sont pas au même niveau (de -30 à -14 dB en moyenne sur la partie
 * audible, mesurés au décodage) : un volume commun ferait crier les uns et
 * chuchoter les autres. Le gain ramène chacun vers une cible DOUCE —
 * « pas trop fort de base » :
 *
 *   interface (clics, panier, récompenses…)   ≈ -27 dB
 *   cartes (pose, pioche, défausse, Cimetière) ≈ -27 dB
 *   impacts et fin de partie                   ≈ -25 dB
 *
 * Mesure d'origine (niveau moyen · durée) en commentaire : un fichier
 * remplacé se remesure, et son gain se recalcule — `10^((cible - niveau)/20)`,
 * plafonné à 1.
 *
 * `offset` (secondes) saute un BLANC en tête de fichier : un son de survol
 * qui attend 0,6 s avant de se faire entendre arrive après le geste.
 *
 * `duration` (secondes, à partir d'`offset`) COUPE la queue d'un fichier
 * trop long — un clic qui traîne quatre secondes couvre tout ce qui suit.
 * La coupe se fait à la lecture, pas dans le fichier : le son d'origine
 * reste intact, et aucun cache n'a à être contourné. Les dernières
 * `CUT_FADE_S` sont fondues, sinon la coupe nette claque.
 */
const SOUNDS = {
  // Clic d'interface général.
  btnInterface1: { src: "/assets/sound/btn-interface.mp3", gain: 0.71 }, // -23.9 dB · 0,05 s
  // Changement d'onglet.
  btnInterface2: { src: "/assets/sound/btn-interface-2.mp3", gain: 1 }, // -27.3 dB · 0,78 s
  // `btn-interface-3.mp3` (-17.2 dB · 1,34 s, gain 0,32) : mis de côté pour l'instant.
  swoosh1: { src: "/assets/sound/swoosh-transition.mp3", gain: 0.28 }, // -18.1 dB · 1,06 s
  swoosh2: { src: "/assets/sound/swoosh-transition-2.mp3", gain: 0.28 }, // -17.3 dB · 1,08 s
  swoosh3: { src: "/assets/sound/swoosh-transition-3.mp3", gain: 0.28 }, // -17.2 dB · 1,06 s
  rewardObtained: { src: "/assets/sound/recompense-obtenu.mp3", gain: 0.46 }, // -20.3 dB · 6 s
  questCompleted: { src: "/assets/sound/quete-fini.mp3", gain: 0.41 }, // -19.2 dB · 6 s
  rewardClaimed: { src: "/assets/sound/claim-reward.mp3", gain: 0.41 }, // -19.2 dB · 6 s
  marketBuy: { src: "/assets/sound/market-buy.mp3", gain: 0.31 }, // -16.9 dB · 1,5 s
  gameStart: { src: "/assets/sound/game-start.mp3", gain: 0.53 }, // -21.5 dB · 0,8 s
  addToCart: { src: "/assets/sound/booster-add-panier.mp3", gain: 1 }, // -27.3 dB · 1 s
  gameLost: { src: "/assets/sound/loose-game.mp3", gain: 0.33 }, // -15.4 dB · 1,3 s
  boosterOpen: { src: "/assets/sound/booster-open.mp3", gain: 0.36 }, // -17.5 dB · 1,7 s
  attackImpact: { src: "/assets/sound/attack-impact.mp3", gain: 0.3 }, // -14.5 dB · 2 s
  magicImpact: { src: "/assets/sound/magic-impact.mp3", gain: 0.35 }, // -16.6 dB · 8 s
  cardDraw: { src: "/assets/sound/card-pioche.mp3", gain: 0.58 }, // -23.3 dB · 0,4 s
  cardPlaced: { src: "/assets/sound/card-placment.mp3", gain: 0.62 }, // -23.8 dB · 0,6 s
  cardToGraveyard: { src: "/assets/sound/card-saborde.mp3", gain: 1 }, // -28.6 dB · 0,5 s
  cardDiscarded: { src: "/assets/sound/card-defausse.mp3", gain: 1 }, // -30.3 dB · 1 s
  // Menu d'accueil (parchemins de la carte marine). Survol plus discret
  // qu'un clic : on le déclenche souvent, en promenant la souris.
  menuCardHover: { src: "/assets/sound/menu-card-hover.mp3", gain: 0.55, offset: 0.55 }, // -26.3 dB · 2,3 s, 0,6 s de blanc
  menuCardClick: { src: "/assets/sound/menu-card-clic.mp3", gain: 1, offset: 0.18, duration: 1 }, // -32.9 dB · 4,5 s, 0,2 s de blanc, coupé à 1 s
} satisfies Record<string, { src: string; gain: number; offset?: number; duration?: number }>;

/** Fondu de fin appliqué à un son coupé par `duration`. */
const CUT_FADE_S = 0.08;

type SoundId = keyof typeof SOUNDS;

const TRANSITION_SOUNDS: readonly SoundId[] = ["swoosh1", "swoosh2", "swoosh3"];

/** Un son de la liste, jamais le même que le précédent de cette liste. */
function pickOther(list: readonly SoundId[], last: SoundId | null): SoundId {
  const others = list.filter((id) => id !== last);
  return others[Math.floor(Math.random() * others.length)]!;
}

let lastTransitionSound: SoundId | null = null;

/**
 * Un geste qui déclenche un son « d'action » (changer de page, ajouter au
 * panier, lancer la partie, ouvrir un booster) joue AUSSI le clic de bouton
 * — avant (le `onClick` joue le clic puis agit) ou après (l'ombre de page
 * intercepte un lien en capture, puis son `onClick` joue le clic). Le clic,
 * immédiat, couvrait le son d'action. Dans les deux ordres, le son d'action
 * REMPLACE le clic : un clic qui le suit se tait, un clic qui le précède est
 * coupé.
 */
let lastActionAt = -Infinity;
let lastClick: { at: number; stop: () => void } | null = null;
const CLICK_REPLACED_BY_ACTION_MS = 120;

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
    pending = fetch(soundUrl(src))
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
    decodedSounds.set(src, pending);
  }
  return pending;
}

/** Arrête une lecture en cours ou à venir — sans effet si elle est déjà finie. */
type StopPlayback = () => void;
const NOTHING_TO_STOP: StopPlayback = () => undefined;

/** Repli historique : un élément `Audio` jetable (Web Audio absent, ou son pas encore décodé). */
function playWithElement(src: string, gain: number, offset = 0, duration?: number): StopPlayback {
  try {
    const audio = new Audio(soundUrl(src));
    audio.volume = gain;
    if (offset > 0) audio.currentTime = offset;
    void audio.play().catch(() => {
      // Autoplay bloqué ou fichier indisponible : silencieux, jamais bloquant.
    });
    // Coupe sans fondu : ce chemin de repli ne sert qu'à la toute première
    // lecture d'un son, avant qu'il ne soit décodé.
    const cut = duration ? window.setTimeout(() => audio.pause(), duration * 1000) : undefined;
    return () => {
      if (cut) window.clearTimeout(cut);
      audio.pause();
    };
  } catch {
    // Best-effort.
    return NOTHING_TO_STOP;
  }
}

function play(src: string, volume: number, offset = 0, duration?: number): StopPlayback {
  const settings = getAudioSettings();
  // Volume à 0 : inutile de lancer une lecture que personne n'entendra.
  if (!settings.effects || settings.effectsVolume === 0) return NOTHING_TO_STOP;
  const gain = volume * settings.effectsVolume;

  const context = getAudioContext();
  if (!context) return playWithElement(src, gain, offset, duration);
  // Suspendu tant qu'aucune interaction n'a eu lieu : un clic le réveille.
  if (context.state === "suspended") void context.resume().catch(() => undefined);

  const decoded = decodedSounds.get(src);
  if (!decoded) {
    // Toute première lecture de ce son : on la joue par l'ancien chemin pour
    // ne pas la perdre, pendant que le décodage se fait pour les suivantes.
    const stop = playWithElement(src, gain, offset, duration);
    void decodeSound(context, src);
    return stop;
  }

  // La lecture démarre à la résolution de la promesse : un arrêt demandé
  // avant doit l'empêcher de partir, un arrêt demandé après doit la couper.
  let stopped = false;
  let stopNow: StopPlayback = NOTHING_TO_STOP;
  void decoded.then((buffer) => {
    if (stopped) return;
    if (!buffer) {
      stopNow = playWithElement(src, gain, offset, duration);
      return;
    }
    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gainNode = context.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode).connect(context.destination);
      if (duration) {
        // Fondu sur la fin de la tranche jouée, puis arrêt : sans lui, la
        // coupe en plein milieu d'une onde s'entend comme un claquement.
        const startedAt = context.currentTime;
        const fadeFrom = Math.max(startedAt, startedAt + duration - CUT_FADE_S);
        gainNode.gain.setValueAtTime(gain, fadeFrom);
        gainNode.gain.linearRampToValueAtTime(0, startedAt + duration);
        source.start(0, offset, duration);
      } else {
        source.start(0, offset);
      }
      stopNow = () => source.stop();
    } catch {
      // Best-effort.
    }
  });
  return () => {
    stopped = true;
    try {
      stopNow();
    } catch {
      // Déjà terminée.
    }
  };
}

function playSound(id: SoundId): StopPlayback {
  const sound: { src: string; gain: number; offset?: number; duration?: number } = SOUNDS[id];
  return play(sound.src, sound.gain, sound.offset, sound.duration);
}

/** Son d'ACTION : prend la place du clic de bouton qui l'accompagne (cf. `lastActionAt`). */
function playActionSound(id: SoundId): void {
  lastActionAt = performance.now();
  if (lastClick && lastActionAt - lastClick.at < CLICK_REPLACED_BY_ACTION_MS) lastClick.stop();
  lastClick = null;
  playSound(id);
}

function playClick(id: SoundId): void {
  if (performance.now() - lastActionAt < CLICK_REPLACED_BY_ACTION_MS) return;
  lastClick = { at: performance.now(), stop: playSound(id) };
}

/** Clic générique — boutons et éléments de l'UI (menus, decks, plateau...). */
export function playButtonClick(): void {
  playClick("btnInterface1");
}

/** Changement d'ONGLET : bandeau (Cartes, Decks…), rayons du Market, onglets du profil, familles de decks. */
export function playTabClick(): void {
  playClick("btnInterface2");
}

/** Survol d'un parchemin du menu d'accueil. */
export function playMenuCardHover(): void {
  playSound("menuCardHover");
}

/** Clic sur un parchemin du menu d'accueil — il remplace le clic d'interface. */
export function playMenuCardClick(): void {
  playSound("menuCardClick");
}

/** Une carte est piochée (pioche → main). */
export function playCardDraw(): void {
  playSound("cardDraw");
}

/** Une carte est jouée : elle se pose sur le plateau. */
export function playCardPlaced(): void {
  playSound("cardPlaced");
}

/** Une carte part au Cimetière depuis le plateau (sabordée, détruite, brisée, expirée). */
export function playCardToGraveyard(): void {
  playSound("cardToGraveyard");
}

/** Une carte est défaussée de la main — accompagne son mouvement vers le Cimetière. */
export function playCardDiscarded(): void {
  playSound("cardDiscarded");
}

/** Impact PHYSIQUE : une unité frappe une cible au contact. */
export function playAttackImpact(): void {
  playSound("attackImpact");
}

/** Impact NON physique : tir de Navire (Canon), dégâts infligés par un effet. */
export function playMagicImpact(): void {
  playSound("magicImpact");
}

/** Une récompense se révèle (profil : « voici ce que tu as obtenu »). */
export function playRewardObtained(): void {
  playSound("rewardObtained");
}

/** Fin de partie : la jauge d'une quête arrive au bout. */
export function playQuestCompleted(): void {
  playSound("questCompleted");
}

/** Une récompense est encaissée (quête, palier, succès). */
export function playRewardClaimed(): void {
  playSound("rewardClaimed");
}

/** Le panier du Market est validé et l'achat a réussi. */
export function playMarketBuy(): void {
  playSound("marketBuy");
}

/** Un article rejoint le panier du Market. */
export function playAddToCart(): void {
  playActionSound("addToCart");
}

/** Appui sur le lancement d'une partie. */
export function playGameStart(): void {
  playActionSound("gameStart");
}

/** La partie est perdue. */
export function playGameLost(): void {
  playSound("gameLost");
}

/** La partie supérieure d'un booster est arrachée. */
export function playBoosterOpen(): void {
  playActionSound("boosterOpen");
}

/**
 * Souffle de l'ombre de changement de page (`PageTransition`) — un des trois,
 * jamais deux fois le même d'affilée. Joué au DÉPART de l'ombre : le pic des
 * trois fichiers tombe entre 300 et 450 ms, soit au moment où l'écran est
 * couvert et commence à se découvrir.
 */
export function playTransitionSwoosh(): void {
  const id = pickOther(TRANSITION_SOUNDS, lastTransitionSound);
  lastTransitionSound = id;
  playActionSound(id);
}

/**
 * Décode les sons d'interface à l'avance : sans cela, le PREMIER de chacun
 * passe par un élément `Audio` qui doit d'abord charger le fichier, et
 * arrive en retard. Un contexte encore suspendu (aucun geste du joueur)
 * décode quand même.
 */
export function preloadInterfaceSounds(): void {
  const context = getAudioContext();
  if (!context) return;
  for (const id of [...TRANSITION_SOUNDS, "btnInterface1", "btnInterface2", "menuCardHover", "menuCardClick"] as const) void decodeSound(context, SOUNDS[id].src);
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
    ambianceEl = new Audio(soundUrl("/assets/sound/ambiance-menu.mp3"));
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
