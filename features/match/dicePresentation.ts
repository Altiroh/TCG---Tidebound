import { pendingDieRoll, type CardInstance, type DieSize, type GameEvent, type GameState } from "@/game";
import { dieSettleMs } from "@/features/match/dice/diceTimings";

/**
 * Mise en scène d'un JET DE DÉ résolu d'office — la partie pure.
 *
 * Un jet que plus rien ne peut changer se ferme dans la même action que son
 * tirage (`game/rules/dice.ts`) : le moteur applique aussitôt les effets de
 * l'issue. Sans retenue, le plateau les montrait pendant que le dé roulait
 * encore (retour du 06/10/2026). Le plateau affiche donc un état
 * INTERMÉDIAIRE tant que le dé vole, puis le temps qu'on lise sa face ;
 * l'état réel (et sa mise en scène d'effets) n'arrive qu'après.
 *
 * Un jet OUVERT (la Chaîne) n'est pas concerné : le dé est déjà posé quand
 * le joueur valide, ses effets peuvent suivre tout de suite.
 */

/** Temps de lecture de la face posée, avant que ses effets ne s'appliquent. */
export const DIE_READ_MS = 650;

export interface DieHold {
  /** Rang, dans le lot, du `DIE_RESOLVED` qui partage le lot en « avant le jet » / « issue ». */
  index: number;
  die: DieSize;
}

/** Le premier jet du lot à mettre en scène, s'il est apparu ET s'est fermé dans ce lot. */
export function freshDieRoll(events: GameEvent[], before: GameState): DieHold | null {
  // Le jet était déjà ouvert : son dé est posé depuis longtemps.
  if (pendingDieRoll(before)) return null;
  const index = events.findIndex((event) => event.type === "DIE_RESOLVED");
  const event = events[index];
  if (!event || event.type !== "DIE_RESOLVED") return null;
  return { index, die: event.die as DieSize };
}

/** Durée de la retenue : le dé se pose, puis on lit sa face. */
export function dieHoldMs(hold: DieHold): number {
  return dieSettleMs(hold.die) + DIE_READ_MS;
}

/**
 * État AFFICHÉ pendant le jet : l'état d'avant le lot, où la carte jouée
 * avant le jet est déjà sortie de la main (posée à sa place si elle reste en
 * jeu) et payée. L'issue — dégâts, gains, pioche, invocations — attend.
 *
 * La carte posée reprend sa version de la main : un bonus que lui donne son
 * propre jet (« gagne +X/+0 ») n'apparaît pas avant la face.
 *
 * Affichage seulement — rien ne doit décider sur cet état.
 */
export function beforeDieDisplay(before: GameState, after: GameState, events: GameEvent[], hold: DieHold): GameState {
  const prior = events.slice(0, hold.index);
  const played = new Set(prior.flatMap((event) => (event.type === "PLAY_CARD" ? [event.instanceId] : [])));

  const players = before.players.map((player) => {
    const reason = prior.reduce(
      (total, event) => (event.type === "REASON_CHANGED" && event.playerId === player.id ? total + event.delta : total),
      player.reason
    );
    if (played.size === 0) return { ...player, reason };

    const leaving = player.hand.filter((card) => played.has(card.instanceId));
    let board: CardInstance[] = player.board;
    const liveBoard = after.players.find((p) => p.id === player.id)?.board ?? [];
    for (const card of leaving) {
      const at = liveBoard.findIndex((unit) => unit.instanceId === card.instanceId);
      if (at < 0) continue;
      const place = Math.min(at, board.length);
      board = [...board.slice(0, place), card, ...board.slice(place)];
    }
    return { ...player, reason, board, hand: player.hand.filter((card) => !played.has(card.instanceId)) };
  }) as GameState["players"];

  return { ...before, players, eventLog: [...before.eventLog, ...prior] };
}
