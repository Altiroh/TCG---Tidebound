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
  // Le bruitage de l'écran de fin, UNE fois à son entrée (26/09/2026 ; remplace
  // `loose-game.mp3`). La victoire est déjà discrète : gain plafonné à 1.
  endDefeat: { src: "/assets/sound/fin-defaite.mp3", gain: 0.29 }, // -14.3 dB · 1,1 s
  endVictory: { src: "/assets/sound/fin-victoire.mp3", gain: 1 }, // -33.9 dB · 3,9 s
  boosterOpen: { src: "/assets/sound/booster-open.mp3", gain: 0.36 }, // -17.5 dB · 1,7 s
  attackImpact: { src: "/assets/sound/attack-impact.mp3", gain: 0.3 }, // -14.5 dB · 2 s
  magicImpact: { src: "/assets/sound/magic-impact.mp3", gain: 0.35 }, // -16.6 dB · 8 s
  cardDraw: { src: "/assets/sound/card-pioche.mp3", gain: 0.58 }, // -23.3 dB · 0,4 s
  cardPlaced: { src: "/assets/sound/card-placment.mp3", gain: 0.62 }, // -23.8 dB · 0,6 s
  // Dé qui tombe sur la table : le « clac » de la pose de carte, plus bas, en attendant un son de dé.
  diceLanded: { src: "/assets/sound/card-placment.mp3", gain: 0.45 },
  cardToGraveyard: { src: "/assets/sound/card-saborde.mp3", gain: 1 }, // -28.6 dB · 0,5 s
  cardDiscarded: { src: "/assets/sound/card-defausse.mp3", gain: 1 }, // -30.3 dB · 1 s
  // Capacités de Navire, une sonorité par FAMILLE d'effet — pas une par
  // Navire : deux capacités qui font la même chose s'entendent pareil. Le
  // Navire dit laquelle lui revient (`activationSound`, `game/environment/types.ts`).
  shipAbilityHeal: { src: "/assets/sound/healing-sort.mp3", gain: 0.92 }, // -24.3 dB · 8 s, son audible jusqu'à 1,5 s
  shipAbilityProtect: { src: "/assets/sound/protacte-boat.mp3", gain: 0.61 }, // -20.7 dB · 0,8 s
  shipAbilityTide: { src: "/assets/sound/switch-marree.mp3", gain: 0.51 }, // -19.2 dB · 2,2 s
  // Menu d'accueil (parchemins de la carte marine). Survol plus discret
  // qu'un clic : on le déclenche souvent, en promenant la souris.
  menuCardHover: { src: "/assets/sound/menu-card-hover.mp3", gain: 0.55, offset: 0.55 }, // -26.3 dB · 2,3 s, 0,6 s de blanc
  menuCardClick: { src: "/assets/sound/menu-card-clic.mp3", gain: 1, offset: 0.18, duration: 1 }, // -32.9 dB · 4,5 s, 0,2 s de blanc, coupé à 1 s
  // LOT DU 10/10/2026 (liste de fournitures). Mesures au décodage, même
  // méthode que plus haut : niveau moyen de la partie audible · durée.
  // Rythme de la partie.
  // Début de SON tour : la première seconde seulement (le fichier en dure
  // près de cinq), en fondu d'entrée et de sortie (demande du 10/10/2026).
  turnStartMine: { src: "/assets/sound/start-turn.mp3", gain: 0.43, offset: 0.2, duration: 1, fadeIn: 0.12, fadeOut: 0.35 }, // -17.6 dB · 4,75 s, 0,2 s de blanc
  turnStartOpponent: { src: "/assets/sound/adversaire-turn.mp3", gain: 0.081 }, // -5.2 dB · 1,9 s
  combatPhase: { src: "/assets/sound/battle-phase.mp3", gain: 0.54, duration: 1.2 }, // -19.7 dB · 1,75 s, audible jusqu'à 0,95 s
  reactionWindow: { src: "/assets/sound/tu-peux-reagir.mp3", gain: 1, offset: 0.25 }, // -32.2 dB · 2,3 s, 0,25 s de blanc
  // Les deux chronos sont des tic-tac de 8 à 9 s : trois secondes disent l'alerte sans couvrir la partie.
  timerWarning: { src: "/assets/sound/chrono.mp3", gain: 0.9, duration: 3, fadeOut: 0.6 }, // -26.1 dB · 7,7 s
  timerUrgent: { src: "/assets/sound/chrono-2.mp3", gain: 1, duration: 3, fadeOut: 0.6 }, // -34.9 dB · 9 s
  turnTimedOut: { src: "/assets/sound/time-end.mp3", gain: 0.69 }, // -21.8 dB · 1,2 s
  // Carte DÉTRUITE ou Objet brisé : pas encore de fichier ; le son du Cimetière qu'elle faisait déjà.
  cardShattered: { src: null, gain: 1, fallback: "cardToGraveyard" }, // carte-brisee.mp3
  shipHit: { src: "/assets/sound/navire-touche.mp3", gain: 0.45, duration: 1.5 }, // -18.1 dB · 8 s, audible jusqu'à 1,3 s
  actionRefused: { src: "/assets/sound/action-impossible.mp3", gain: 0.38, offset: 0.1 }, // -18.7 dB · 1,25 s, 0,1 s de blanc
  // Effets de jeu.
  cardAwake: { src: "/assets/sound/card-awake.mp3", gain: 0.22, offset: 0.2, duration: 1.1 }, // -11.8 dB · 8 s, audible de 0,2 à 1,15 s
  cardFlip: { src: "/assets/sound/card-flip.mp3", gain: 1, offset: 0.3 }, // -33.1 dB · 1 s, 0,3 s de blanc
  guardIntercept: { src: "/assets/sound/guard-effect.mp3", gain: 1 }, // -29 dB · 1,8 s
  tokenDrop: { src: "/assets/sound/token-pose.mp3", gain: 0.43, offset: 0.15 }, // -19.6 dB · 0,5 s, 0,15 s de blanc
  spellCast: { src: "/assets/sound/effect-magique-capacity.mp3", gain: 0.62, offset: 0.2, duration: 2, fadeOut: 0.4 }, // -20.9 dB · 8 s, audible jusqu'à 4 s
  spellHeal: { src: "/assets/sound/heal-sound.mp3", gain: 0.45, duration: 1.6 }, // -20 dB · 8 s, audible jusqu'à 1,55 s
  spellBuff: { src: "/assets/sound/buff-sound.mp3", gain: 0.45, duration: 1.6 }, // -20 dB · 8 s, audible jusqu'à 1,55 s
  spellMalus: { src: "/assets/sound/malus-sound.mp3", gain: 0.36, duration: 1.1 }, // -18.1 dB · 8 s, audible jusqu'à 1 s
  cannonShot: { src: "/assets/sound/canon-shot.mp3", gain: 1, duration: 3.6 }, // -26.5 dB · 4,6 s
  diceRoll: { src: "/assets/sound/dice-roll.mp3", gain: 1 }, // -27.4 dB · 1,25 s
  tideChange: { src: "/assets/sound/maree-changement.mp3", gain: 1, offset: 0.4 }, // -27.4 dB · 3 s, 0,4 s de blanc
  landeArrival: { src: "/assets/sound/terrain-poser.mp3", gain: 0.36, duration: 1.2 }, // -16.2 dB · 8 s, audible jusqu'à 1,05 s
  // Fin de partie, récompenses, collection.
  endDraw: { src: "/assets/sound/draw-sound.mp3", gain: 0.54, duration: 1.2 }, // -19.7 dB · 1,75 s
  exploitClaimed: { src: "/assets/sound/exploit-claim.mp3", gain: 0.5 }, // -21 dB · 1,5 s
  streakClaimed: { src: "/assets/sound/connect-claim.mp3", gain: 1 }, // -28 dB · 1 s
  levelUp: { src: "/assets/sound/level-up.mp3", gain: 0.52, offset: 0.15 }, // -19.3 dB · 1,3 s, 0,15 s de blanc
  deckAddCard: { src: "/assets/sound/deck-add-card.mp3", gain: 1 }, // -28.6 dB · 0,35 s
  deckRemoveCard: { src: "/assets/sound/card-retiree.mp3", gain: 0.65, offset: 0.15 }, // -23.2 dB · 0,8 s, 0,15 s de blanc
  surplusSell: { src: "/assets/sound/surplus-sell.mp3", gain: 0.68 }, // -23.6 dB · 1,1 s
  // Ouverture de booster.
  boosterEnter: { src: "/assets/sound/packet-enter.mp3", gain: 1, offset: 0.15 }, // -46.7 dB · 0,5 s : très bas même au gain maximal
  boosterCardSpawn: { src: "/assets/sound/packet-out-card.mp3", gain: 1, offset: 0.2 }, // -29.6 dB · 0,5 s, 0,2 s de blanc
  boosterCardFlip: { src: "/assets/sound/card-turn-over.mp3", gain: 0.92, offset: 0.15 }, // -26.3 dB · 0,6 s, 0,15 s de blanc
  boosterRareReveal: { src: "/assets/sound/legendary-drop.mp3", gain: 1, duration: 1.6 }, // -36.1 dB · 4,1 s, audible jusqu'à 1,25 s
  boosterAbyssalReveal: { src: "/assets/sound/abyssal-drop.mp3", gain: 0.19 }, // -10.6 dB · 2 s
} satisfies Record<string, SoundEntry>;

interface SoundEntry {
  /** `null` : emplacement prêt, fichier pas encore fourni. */
  src: string | null;
  gain: number;
  offset?: number;
  duration?: number;
  /** Montée en volume au départ (secondes) : un son coupé en plein milieu ne claque pas à l'entrée. */
  fadeIn?: number;
  /** Fondu de la fin d'un son coupé par `duration` (secondes), au lieu de `CUT_FADE_S`. */
  fadeOut?: number;
  /** Joué à la place tant que `src` est `null`. */
  fallback?: string;
}

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

/**
 * Relance un contexte qui ne tourne plus. Deux états l'arrêtent :
 * `suspended` (aucun geste du joueur encore, ou suspension explicite) et
 * `interrupted`, propre à Safari iOS — posé après un appel entrant, une
 * alarme ou un passage en arrière-plan, et que le contexte ne quitte pas
 * tout seul. Sans cette relance, plus aucun effet ne sonnait au retour dans
 * l'app. Best-effort : hors geste du joueur, iOS peut refuser, et le
 * prochain son (déclenché par un geste) retentera.
 */
function wakeAudioContext(context: AudioContext): void {
  const state = context.state as AudioContextState | "interrupted";
  if (state === "suspended" || state === "interrupted") void context.resume().catch(() => undefined);
}

if (typeof document !== "undefined") {
  // Retour au premier plan : on réveille le contexte s'il existe déjà (on
  // n'en crée pas un pour autant — il naît au premier son).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audioContext) wakeAudioContext(audioContext);
  });
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

/** Fondus d'un son (secondes) : entrée, et sortie d'un son coupé par `duration`. */
interface Fades {
  fadeIn?: number;
  fadeOut?: number;
}

function play(src: string, volume: number, offset = 0, duration?: number, fades: Fades = {}): StopPlayback {
  const settings = getAudioSettings();
  // Volume à 0 : inutile de lancer une lecture que personne n'entendra.
  if (!settings.effects || settings.effectsVolume === 0) return NOTHING_TO_STOP;
  const gain = volume * settings.effectsVolume;

  const context = getAudioContext();
  if (!context) return playWithElement(src, gain, offset, duration);
  // Suspendu tant qu'aucune interaction n'a eu lieu : un clic le réveille.
  wakeAudioContext(context);

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
      const startedAt = context.currentTime;
      if (fades.fadeIn) {
        gainNode.gain.setValueAtTime(0, startedAt);
        gainNode.gain.linearRampToValueAtTime(gain, startedAt + fades.fadeIn);
      } else {
        gainNode.gain.value = gain;
      }
      source.connect(gainNode).connect(context.destination);
      if (duration) {
        // Fondu sur la fin de la tranche jouée, puis arrêt : sans lui, la
        // coupe en plein milieu d'une onde s'entend comme un claquement.
        const fadeFrom = Math.max(startedAt + (fades.fadeIn ?? 0), startedAt + duration - (fades.fadeOut ?? CUT_FADE_S));
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
  const sound: SoundEntry = SOUNDS[id];
  if (sound.src === null) return sound.fallback ? playSound(sound.fallback as SoundId) : NOTHING_TO_STOP;
  return play(sound.src, sound.gain, sound.offset, sound.duration, sound);
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

/** Un dé lancé retombe sur la table (`TableDice`). */
export function playDiceLanded(): void {
  playSound("diceLanded");
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

/** Impact NON physique : dégâts infligés par un effet (le tir du Canon, lui, sonne comme un coup porté). */
export function playMagicImpact(): void {
  playSound("magicImpact");
}

/**
 * Familles de sons des capacités de Navire. Le Navire nomme la sienne dans
 * sa définition (`activationSound`) : aucun appelant n'a à savoir quel
 * Navire fait quoi.
 */
const SHIP_ABILITY_SOUNDS = {
  heal: "shipAbilityHeal",
  protect: "shipAbilityProtect",
  tide: "shipAbilityTide",
} as const satisfies Record<string, SoundId>;

export type ShipAbilitySoundKind = keyof typeof SHIP_ABILITY_SOUNDS;

/** Début de tour : le sien, ou celui de l'adversaire (bannière de phase). */
export function playTurnStart(mine: boolean): void {
  playSound(mine ? "turnStartMine" : "turnStartOpponent");
}

/** Passage en phase de combat (bannière de phase). */
export function playCombatPhase(): void {
  playSound("combatPhase");
}

/** Une fenêtre de réaction s'ouvre pour le joueur qui regarde. */
export function playReactionWindow(): void {
  playSound("reactionWindow");
}

/** Chrono de tour : palier d'alerte franchi (`attention`, puis `urgence`). */
export function playTimerAlert(level: "attention" | "urgence"): void {
  playSound(level === "attention" ? "timerWarning" : "timerUrgent");
}

/** Le chrono est arrivé au bout : le tour (ou la fenêtre) passe. */
export function playTurnTimedOut(): void {
  playSound("turnTimedOut");
}

/** Une carte DÉTRUITE (ou un Objet brisé) vole en éclats. */
export function playCardShattered(): void {
  playSound("cardShattered");
}

/** Le Navire encaisse : dégâts, perte d'Ancrage, Déraison. */
export function playShipHit(): void {
  playSound("shipHit");
}

/** Le jeu refuse un geste (message d'erreur de partie). */
export function playActionRefused(): void {
  playSound("actionRefused");
}

/** Une carte se RÉVEILLE : elle déclenche sa capacité, ou se soulève pour attaquer. */
export function playCardAwake(): void {
  playSound("cardAwake");
}

/** Une carte se retourne face visible (Structure révélée). */
export function playCardFlip(): void {
  playSound("cardFlip");
}

/** La Garde intercepte une attaque. */
export function playGuardIntercept(): void {
  playSound("guardIntercept");
}

/** Un jeton tombe sur le plateau. */
export function playTokenDrop(): void {
  playSound("tokenDrop");
}

/** Un sort part de sa carte (l'orbe se forme avant de filer vers ses cibles). */
export function playSpellCast(): void {
  playSound("spellCast");
}

/** Familles de sorts à l'arrivée sur leur cible : soin, renfort, malus. */
const SPELL_IMPACT_SOUNDS = {
  heal: "spellHeal",
  buff: "spellBuff",
  malus: "spellMalus",
} as const satisfies Record<string, SoundId>;

export type SpellImpactKind = keyof typeof SPELL_IMPACT_SOUNDS;

/** Un sort atteint sa cible. */
export function playSpellImpact(kind: SpellImpactKind): void {
  playSound(SPELL_IMPACT_SOUNDS[kind]);
}

/** Tir du Canon (capacité de Navire). */
export function playCannonShot(): void {
  playSound("cannonShot");
}

/** Un dé est lancé et roule sur la table. */
export function playDiceRoll(): void {
  playSound("diceRoll");
}

/** La Marée change d'état (Calme, Houle, Tempête, Abysses). */
export function playTideChange(): void {
  playSound("tideChange");
}

/** Une Lande arrive en jeu. */
export function playLandeArrival(): void {
  playSound("landeArrival");
}

/** Un exploit est réclamé. */
export function playExploitClaimed(): void {
  playSound("exploitClaimed");
}

/** La récompense de la série de connexion est réclamée. */
export function playStreakClaimed(): void {
  playSound("streakClaimed");
}

/** Le niveau du joueur monte. */
export function playLevelUp(): void {
  playSound("levelUp");
}

/** Une carte rejoint le deck en cours d'édition. */
export function playDeckAddCard(): void {
  playSound("deckAddCard");
}

/** Une carte quitte le deck en cours d'édition. */
export function playDeckRemoveCard(): void {
  playSound("deckRemoveCard");
}

/** Le surplus de la collection est revendu. */
export function playSurplusSell(): void {
  playSound("surplusSell");
}

/** Sons de l'ouverture de booster, moment par moment. */
const BOOSTER_SOUNDS = {
  enter: "boosterEnter",
  cardSpawn: "boosterCardSpawn",
  cardFlip: "boosterCardFlip",
  rareReveal: "boosterRareReveal",
  abyssalReveal: "boosterAbyssalReveal",
} as const satisfies Record<string, SoundId>;

export type BoosterSoundKind = keyof typeof BOOSTER_SOUNDS;

/** Un moment de l'ouverture de booster. */
export function playBoosterSound(kind: BoosterSoundKind): void {
  playSound(BOOSTER_SOUNDS[kind]);
}

/** Activation d'une capacité de Navire (soin, protection, bascule de Marée). */
export function playShipAbility(kind: ShipAbilitySoundKind): void {
  playSound(SHIP_ABILITY_SOUNDS[kind]);
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

/** L'écran de fin de partie s'ouvre : son bruitage, une fois. */
export function playMatchEnd(outcome: "victory" | "defeat" | "draw"): void {
  playSound(outcome === "victory" ? "endVictory" : outcome === "draw" ? "endDraw" : "endDefeat");
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
  for (const id of [...TRANSITION_SOUNDS, "btnInterface1", "btnInterface2", "menuCardHover", "menuCardClick"] as const) {
    const src: string | null = SOUNDS[id].src;
    if (src) void decodeSound(context, src);
  }
}

/** Sons de partie décodés à l'avance, au montage de la table : le premier de chacun arrive à l'heure, avec ses fondus. */
const MATCH_SOUNDS: readonly SoundId[] = [
  "turnStartMine",
  "turnStartOpponent",
  "combatPhase",
  "reactionWindow",
  "cardAwake",
  "cardFlip",
  "guardIntercept",
  "tokenDrop",
  "spellCast",
  "spellHeal",
  "spellBuff",
  "spellMalus",
  "shipHit",
  "actionRefused",
  "cardPlaced",
  "cardDraw",
  "cardToGraveyard",
  "attackImpact",
];

export function preloadMatchSounds(): void {
  const context = getAudioContext();
  if (!context) return;
  for (const id of MATCH_SOUNDS) {
    const src: string | null = SOUNDS[id].src;
    if (src) void decodeSound(context, src);
  }
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

/**
 * Écrans qui veulent l'ambiance (compteur) et écrans qui l'interdisent (une
 * table de partie montée). L'ambiance joue s'il y a au moins un demandeur
 * et AUCUN interdit : le menu la garde partout, sauf en partie.
 */
let ambianceRequests = 0;
let ambianceSilencers = 0;

function syncAmbianceWanted(): void {
  ambianceWanted = ambianceRequests > 0 && ambianceSilencers === 0;
  applyAmbiance();
}

/** Lance l'ambiance du menu en boucle (sauf si la musique est coupée dans les Options). */
export function startMenuAmbiance(): void {
  ambianceRequests += 1;
  syncAmbianceWanted();
}

/** Retire une demande d'ambiance. */
export function stopMenuAmbiance(): void {
  ambianceRequests = Math.max(0, ambianceRequests - 1);
  syncAmbianceWanted();
}

/** Une partie commence à l'écran : l'ambiance du menu se tait tant qu'elle est montée. */
export function silenceMenuAmbiance(): () => void {
  ambianceSilencers += 1;
  syncAmbianceWanted();
  return () => {
    ambianceSilencers = Math.max(0, ambianceSilencers - 1);
    syncAmbianceWanted();
  };
}

/*
 * LE THÈME DE L'ÉCRAN DE FIN — une musique de fond en boucle, À PEINE
 * AUDIBLE (demande du 26/09/2026 : « très léger »), tant que l'écran de
 * victoire ou de défaite est monté. Il suit l'interrupteur « Musique » et son
 * curseur, comme l'ambiance du menu (qu'une partie fait déjà taire).
 *
 * Gains mesurés au décodage (niveau moyen de la partie audible) et ramenés
 * vers -42 dB : environ 8 dB SOUS l'ambiance du menu (-20,4 dB × 0,22 ≈
 * -33,6 dB), pour rester un fond, jamais une musique qu'on écoute.
 */
const END_THEMES = {
  victory: { src: "/assets/sound/theme-fin-victoire.mp3", gain: 0.068 }, // -18.6 dB · 4 min 20
  defeat: { src: "/assets/sound/theme-fin-defaite.mp3", gain: 0.035 }, // -12.8 dB · 2 min 05
  draw: { src: "/assets/sound/draw-theme.mp3", gain: 0.257 }, // -30.2 dB · 1 min
} as const;

/** Montée et retombée du thème : il s'installe sous le bruitage, il ne claque pas. */
const END_THEME_FADE_IN_MS = 2500;
const END_THEME_FADE_OUT_MS = 600;

let endThemeEl: HTMLAudioElement | null = null;
let endThemeGain = 0;
/** 0 → 1 : le fondu en cours, multiplié au gain et au curseur « Musique ». */
let endThemeFade = 0;
let endThemeFadeTimer: number | null = null;

function endThemeVolume(): number {
  return endThemeGain * getAudioSettings().musicVolume * endThemeFade;
}

function fadeEndTheme(to: number, durationMs: number, done?: () => void): void {
  if (endThemeFadeTimer !== null) window.clearInterval(endThemeFadeTimer);
  const from = endThemeFade;
  const start = performance.now();
  endThemeFadeTimer = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    endThemeFade = from + (to - from) * t;
    if (endThemeEl) endThemeEl.volume = Math.min(1, endThemeVolume());
    if (t >= 1) {
      if (endThemeFadeTimer !== null) window.clearInterval(endThemeFadeTimer);
      endThemeFadeTimer = null;
      done?.();
    }
  }, 50);
}

/** Aligne le thème sur les Options : coupé si la musique l'est, volume suivant le curseur. */
function applyEndTheme(): void {
  if (!endThemeEl) return;
  const settings = getAudioSettings();
  if (!settings.music) {
    endThemeEl.pause();
    return;
  }
  endThemeEl.volume = Math.min(1, endThemeVolume());
  const el = endThemeEl;
  if (el.paused) {
    el.play().catch(() => {
      // Autoplay bloqué : on retente au premier geste, si le thème est encore voulu.
      const retry = () => applyEndTheme();
      window.addEventListener("pointerdown", retry, { once: true });
      window.addEventListener("keydown", retry, { once: true });
    });
  }
}

if (typeof window !== "undefined") {
  subscribeAudioSettings(applyEndTheme);
}

/**
 * Lance le thème de l'écran de fin (fondu d'entrée) ; la fonction rendue
 * l'arrête (fondu de sortie). Un seul thème à la fois : en lancer un autre
 * coupe le précédent.
 */
export function startEndTheme(outcome: keyof typeof END_THEMES): () => void {
  if (typeof window === "undefined") return () => undefined;
  const theme = END_THEMES[outcome];
  if (endThemeEl) endThemeEl.pause();
  const el = new Audio(soundUrl(theme.src));
  el.loop = true;
  endThemeEl = el;
  endThemeGain = theme.gain;
  endThemeFade = 0;
  el.volume = 0;
  applyEndTheme();
  fadeEndTheme(1, END_THEME_FADE_IN_MS);

  return () => {
    if (endThemeEl !== el) return;
    fadeEndTheme(0, END_THEME_FADE_OUT_MS, () => {
      el.pause();
      if (endThemeEl === el) endThemeEl = null;
    });
  };
}

/*
 * L'AMBIANCE DE PARTIE — quatre boucles SUPERPOSÉES (demande du 10/10/2026) :
 * la mer, le pont qui craque et le vent, très bas, sous une musique légère.
 * Elles suivent l'interrupteur « Musique » et son curseur, comme l'ambiance du
 * menu (qu'une table montée fait taire, cf. `silenceMenuAmbiance`).
 *
 * Gains ramenés sous l'ambiance du menu (≈ -33,6 dB) : la musique vers
 * -38 dB, la mer vers -42, le pont et le vent vers -44. Ensemble, un fond
 * qu'on sent plus qu'on ne l'écoute, sous les effets de jeu. Les boucles ont
 * des durées différentes (30 s à 1 min 20) : leurs raccords ne tombent
 * jamais ensemble, le fond ne « recommence » pas.
 */
const MATCH_AMBIANCE_LAYERS = [
  { src: "/assets/sound/ambiance-party-music.mp3", gain: 0.117 }, // -19.4 dB · 30 s
  { src: "/assets/sound/ambiance-party-sea.mp3", gain: 0.101 }, // -22.1 dB · 1 min 19
  { src: "/assets/sound/ambiance-party-pont-crack.mp3", gain: 0.158 }, // -28 dB · 1 min
  { src: "/assets/sound/ambiance-party-wind.mp3", gain: 0.3 }, // -33.5 dB · 43 s
] as const;

const MATCH_AMBIANCE_FADE_IN_MS = 3000;
const MATCH_AMBIANCE_FADE_OUT_MS = 800;

let matchAmbianceEls: HTMLAudioElement[] = [];
/** 0 → 1 : le fondu en cours, multiplié au gain de chaque piste et au curseur « Musique ». */
let matchAmbianceFade = 0;
let matchAmbianceFadeTimer: number | null = null;

function matchAmbianceVolume(index: number): number {
  return Math.min(1, MATCH_AMBIANCE_LAYERS[index]!.gain * getAudioSettings().musicVolume * matchAmbianceFade);
}

/** Aligne les pistes sur les Options : coupées si la musique l'est, volume suivant le curseur. */
function applyMatchAmbiance(): void {
  if (matchAmbianceEls.length === 0) return;
  const settings = getAudioSettings();
  matchAmbianceEls.forEach((el, index) => {
    if (!settings.music) {
      el.pause();
      return;
    }
    el.volume = matchAmbianceVolume(index);
    if (el.paused) {
      el.play().catch(() => {
        // Autoplay bloqué : on retente au premier geste, si l'ambiance est encore voulue.
        const retry = () => applyMatchAmbiance();
        window.addEventListener("pointerdown", retry, { once: true });
        window.addEventListener("keydown", retry, { once: true });
      });
    }
  });
}

if (typeof window !== "undefined") {
  subscribeAudioSettings(applyMatchAmbiance);
}

function fadeMatchAmbiance(to: number, durationMs: number, done?: () => void): void {
  if (matchAmbianceFadeTimer !== null) window.clearInterval(matchAmbianceFadeTimer);
  const from = matchAmbianceFade;
  const start = performance.now();
  matchAmbianceFadeTimer = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    matchAmbianceFade = from + (to - from) * t;
    matchAmbianceEls.forEach((el, index) => (el.volume = matchAmbianceVolume(index)));
    if (t >= 1) {
      if (matchAmbianceFadeTimer !== null) window.clearInterval(matchAmbianceFadeTimer);
      matchAmbianceFadeTimer = null;
      done?.();
    }
  }, 50);
}

/**
 * Lance l'ambiance de partie (fondu d'entrée) ; la fonction rendue l'arrête
 * (fondu de sortie). Une seule à la fois : la relancer pendant sa sortie
 * reprend les mêmes pistes là où elles en étaient.
 */
export function startMatchAmbiance(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (matchAmbianceEls.length === 0) {
    matchAmbianceEls = MATCH_AMBIANCE_LAYERS.map((layer) => {
      const el = new Audio(soundUrl(layer.src));
      el.loop = true;
      el.volume = 0;
      return el;
    });
  }
  const els = matchAmbianceEls;
  applyMatchAmbiance();
  fadeMatchAmbiance(1, MATCH_AMBIANCE_FADE_IN_MS);
  return () => {
    if (matchAmbianceEls !== els) return;
    fadeMatchAmbiance(0, MATCH_AMBIANCE_FADE_OUT_MS, () => {
      if (matchAmbianceEls !== els || matchAmbianceFade > 0) return;
      els.forEach((el) => el.pause());
      matchAmbianceEls = [];
    });
  };
}
