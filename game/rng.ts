/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Le moteur ne doit jamais appeler `Math.random()` : toute partie doit
 * pouvoir être rejouée à l'identique à partir de son état initial et de
 * son journal d'actions. On stocke donc la graine courante dans le
 * `GameState` et on la fait avancer de façon pure à chaque tirage.
 */
export type RngState = number;

export interface RngResult<T> {
  value: T;
  nextState: RngState;
}

function nextUint32(state: RngState): RngResult<number> {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0);
  return { value, nextState: (state + 0x6d2b79f5) | 0 };
}

/** Retourne un flottant dans [0, 1) et le nouvel état du RNG. */
export function nextFloat(state: RngState): RngResult<number> {
  const { value, nextState } = nextUint32(state);
  return { value: value / 4294967296, nextState };
}

/** Retourne un entier dans [0, max) et le nouvel état du RNG. */
export function nextInt(state: RngState, max: number): RngResult<number> {
  const { value, nextState } = nextFloat(state);
  return { value: Math.floor(value * max), nextState };
}

/**
 * Mélange un tableau (Fisher-Yates) de façon déterministe et immuable :
 * retourne un nouveau tableau ainsi que le nouvel état du RNG.
 */
export function shuffle<T>(items: readonly T[], state: RngState): RngResult<T[]> {
  const result = [...items];
  let rngState = state;

  for (let i = result.length - 1; i > 0; i--) {
    const draw = nextInt(rngState, i + 1);
    rngState = draw.nextState;
    const tmp = result[i]!;
    result[i] = result[draw.value]!;
    result[draw.value] = tmp;
  }

  return { value: result, nextState: rngState };
}

export function createSeed(source?: number): RngState {
  if (source !== undefined) return source | 0;
  // Seed non-déterministe uniquement au moment de créer une toute
  // nouvelle partie ; à partir de là, tout est déterministe.
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
}
