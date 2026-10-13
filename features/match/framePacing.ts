import type { GameState } from "@/game";
import { ARRIVAL_DELAY_MS, deriveEffectVolley, volleyLandingMs } from "@/features/match/effectPresentation";
import { ATTACK_TOTAL_MS, deriveAttack } from "@/features/match/useAttackPresentation";
import { dieHoldMs, freshDieRoll } from "@/features/match/dicePresentation";
import { abyssalArrivals } from "@/features/match/abyssalArrival";

/**
 * CADENCE D'UN TOUR QU'ON REGARDE — combien de temps laisser à un coup de
 * l'adversaire (le bot d'une partie arbitrée, un joueur en ligne) avant
 * d'afficher le suivant.
 *
 * Le rejeu tenait un rythme FIXE (550 ms par coup). Or une attaque se joue
 * en ~750 ms (soulèvement, élan, frappe, retour), un sort lancé en plus
 * d'une seconde (orbe, vol, impact), un dé le temps de rouler : le coup
 * suivant arrivait au milieu de l'animation et la coupait — en partie
 * réelle, « on ne voit pas les attaques » (retour de partie du 12/10/2026).
 *
 * Ici, chaque coup obtient le temps de SA mise en scène, lue sur les mêmes
 * dérivations que le plateau (`deriveAttack`, `deriveEffectVolley`,
 * `freshDieRoll`), plus un souffle pour la lire. Jamais moins que le
 * rythme de base : un coup sans animation se voit quand même passer.
 */

/** Un coup qui ne montre rien de particulier (changer de phase, passer une fenêtre) : de quoi le voir passer. */
export const BASE_FRAME_MS = 650;
/** Après la fin d'une mise en scène, le temps de lire ce qu'elle a fait. */
export const READ_AFTER_MS = 350;
/** Une carte posée glisse jusqu'à sa place avant que la suite n'arrive. */
const PLAY_CARD_MS = ARRIVAL_DELAY_MS + 420;
/** Un nouveau tour s'annonce (bandeau « Tour de l'adversaire ») : on le laisse se lire. */
const TURN_BANNER_MS = 1100;
/** Une Abyssale arrive : la carte atterrit, la table tremble, le voile passe (`AbyssalArrivalFx`). */
const ABYSSAL_ARRIVAL_MS = ARRIVAL_DELAY_MS + 1500;
/** Garde-fou : aucun coup ne retient l'écran plus longtemps. */
const MAX_FRAME_MS = 4500;

/** Temps à laisser après l'affichage de `next` (venu de `previous`) avant d'afficher l'état suivant. */
export function framePaceMs(previous: GameState, next: GameState): number {
  const events = next.eventLog.slice(previous.eventLog.length);
  if (events.length === 0) return BASE_FRAME_MS;
  const holds = [BASE_FRAME_MS];

  // Un dé roule d'abord ; ce qui suit son issue se met en scène ensuite.
  const die = freshDieRoll(events, previous);
  const dieMs = die ? dieHoldMs(die) : 0;
  if (dieMs > 0) holds.push(dieMs + READ_AFTER_MS);

  const attack = deriveAttack(events, next, 0);
  if (attack) holds.push(dieMs + ATTACK_TOTAL_MS + READ_AFTER_MS);

  const volley = deriveEffectVolley(events, previous, next, 0);
  if (volley) holds.push(dieMs + volleyLandingMs(volley) + READ_AFTER_MS);

  if (events.some((event) => event.type === "PLAY_CARD")) holds.push(PLAY_CARD_MS);
  if (abyssalArrivals(events).length > 0) holds.push(ABYSSAL_ARRIVAL_MS);
  if (events.some((event) => event.type === "TURN_STARTED")) holds.push(TURN_BANNER_MS);

  return Math.min(MAX_FRAME_MS, Math.max(...holds));
}
