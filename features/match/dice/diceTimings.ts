import type { DieSize } from "@/game";

/**
 * LA MANIÈRE DE CHAQUE SOLIDE, une fois sur la table.
 *  - D6 : un quart de tour par bascule ; il rebondit franchement et roule
 *    deux ou trois fois, puis se cale d'un léger balancement.
 *  - D4 : pointu et lourd, il se PLANTE : un petit rebond, une seule bascule
 *    (109,5°, lourde), et il oscille sur sa base avant de s'immobiliser.
 *  - D8 : presque rond, il ROULE loin, en petites bascules de 70,5° de plus
 *    en plus lentes, sans presque rebondir.
 * `pivot` : de combien son centre se soulève en passant par-dessus l'arête.
 */
export const LANCER: Record<DieSize, { airMs: number; spinTurns: number; rolls: number; rollMs: number[]; hops: number[]; pivot: number; wobbleDeg: number; wobbleMs: number }> = {
  6: { airMs: 520, spinTurns: 1.25, rolls: 3, rollMs: [200, 240, 330], hops: [34, 10, 0], pivot: 0.2, wobbleDeg: 3, wobbleMs: 280 },
  4: { airMs: 480, spinTurns: 0.85, rolls: 1, rollMs: [330], hops: [12], pivot: 0.1, wobbleDeg: 8, wobbleMs: 460 },
  8: { airMs: 520, spinTurns: 1.25, rolls: 5, rollMs: [140, 155, 175, 210, 290], hops: [20, 6, 0, 0, 0], pivot: 0.1, wobbleDeg: 2, wobbleMs: 220 },
};

/**
 * Temps que met un dé lancé à se poser : la légende et les gestes attendent
 * qu'il soit immobile, et le plateau qu'il ait montré sa face
 * (`dicePresentation.ts`) avant d'en afficher les effets.
 */
export function dieSettleMs(die: DieSize): number {
  const geste = LANCER[die];
  return geste.airMs + geste.rollMs.slice(0, geste.rolls).reduce((a, b) => a + b, 0) + geste.wobbleMs;
}
