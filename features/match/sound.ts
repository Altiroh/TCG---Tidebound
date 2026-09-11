"use client";

/**
 * Sons de plateau synthétisés à la volée (Web Audio API) — aucun fichier
 * audio n'est fourni par le projet à ce jour, donc plutôt que d'inventer un
 * chemin d'asset qui n'existerait pas, chaque effet est généré
 * procéduralement (bruit filtré + oscillateurs courts). Volontairement
 * discret et best-effort : un navigateur qui bloque l'audio (politique
 * d'autoplay, contexte non sécurisé) ne doit jamais faire échouer une
 * action de jeu, d'où les `try/catch` silencieux partout.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedContext) sharedContext = new Ctor();
    if (sharedContext.state === "suspended") void sharedContext.resume();
    return sharedContext;
  } catch {
    return null;
  }
}

/** Bruit blanc filtré, court et sourd — sert de base à l'impact et à la destruction. */
function playThud(ctx: AudioContext, { volume = 0.35, cutoff = 900, duration = 0.22 }: { volume?: number; cutoff?: number; duration?: number } = {}) {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start();
  noise.stop(ctx.currentTime + duration);
}

/** Petit "clang" métallique bref (coque/arme) superposé au thud pour l'impact de combat. */
function playClang(ctx: AudioContext, volume = 0.18) {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(520, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.18);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

/** Impact de combat (unité contre unité, ou contre le Navire) : thud sourd + clang métallique bref. */
export function playAttackImpactSound(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    playThud(ctx, { volume: 0.4, cutoff: 700, duration: 0.28 });
    playClang(ctx, 0.16);
  } catch {
    // Best-effort : jamais bloquant pour le jeu.
  }
}

/** Bruit sourd plus grave et plus long, sans le clang — destruction d'une carte. */
export function playDestroySound(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    playThud(ctx, { volume: 0.32, cutoff: 350, duration: 0.4 });
  } catch {
    // Best-effort.
  }
}
