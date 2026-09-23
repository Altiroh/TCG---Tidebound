import type { CardInstance, ChromaticColor, StatModifier } from "@/game/cards/types";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import { benefitsFromSignal, isSentinel, markSignalUsed, signalAvailable, signalEmitter } from "@/game/rules/chromatic";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * CE QUE FONT LES SIGNAUX QUI RÉAGISSENT À UN FAIT (Lot 15).
 *
 * Rouge et Jaune sont des bonus continus, lus avec les statistiques
 * (`game/cards/stats.ts`). Bleu, Vert et Violet, eux, répondent à un fait de
 * jeu, « la première fois à chaque tour » — une fois par JOUEUR et par
 * couleur, puisque deux Signaux de même couleur ne se cumulent pas :
 *
 *  - Bleu — « la première fois à chaque tour qu'une Sentinelle d'une autre
 *    couleur attaque une unité adverse, cette unité adverse perd
 *    1 Puissance jusqu'à votre prochain tour ». Appliqué au COMBAT, avant
 *    les dégâts : la riposte en tient compte (`applyBlueSignal`).
 *  - Vert — « la première fois pendant chacun de vos tours que vous jouez une
 *    Sentinelle d'une autre couleur, récupérez 1 Raison ».
 *  - Violet — « la première fois à chaque tour qu'une Sentinelle d'une autre
 *    couleur est ciblée par un effet adverse, piochez 1 carte puis
 *    défaussez-en 1 ».
 *
 * Vert et Violet se lisent dans le journal de l'action qui vient de se
 * résoudre (`processChromaticSignals`, appelée par `dispatch`) : la carte
 * jouée est alors posée, la cible désignée connue.
 */

function replacePlayer(state: GameState, player: PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player.id ? player : p)) as [PlayerState, PlayerState] };
}

function withSignalUsed(state: GameState, playerId: PlayerId, color: ChromaticColor, turnNumber: number): GameState {
  const player = state.players.find((p) => p.id === playerId);
  return player ? replacePlayer(state, markSignalUsed(player, color, turnNumber)) : state;
}

const VERT: EffectDefinition[] = [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }];

const VIOLET: EffectDefinition[] = [
  { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
  { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
];

/** Signaux Vert et Violet, lus dans les événements d'une action. */
export function processChromaticSignals(
  state: GameState,
  events: readonly GameEvent[],
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  let next = state;
  const produced: GameEvent[] = [];

  for (const event of events) {
    if (event.type === "PLAY_CARD") {
      const player = next.players.find((p) => p.id === event.playerId);
      const posee = player?.board.find((u) => u.instanceId === event.instanceId);
      if (!player || !posee || !isSentinel(posee)) continue;
      // « pendant chacun de VOS tours » : une carte ne se joue que pendant
      // son propre tour, mais la garde dit ce que le texte dit.
      if (next.activePlayerId !== player.id) continue;
      if (!signalAvailable(player, "vert", turnNumber) || !benefitsFromSignal(posee, "vert", player.board)) continue;
      next = withSignalUsed(next, player.id, "vert", turnNumber);
      const resolved = resolveEffectSequence(next, VERT, {
        controllerId: player.id,
        sourceInstanceId: signalEmitter(posee, "vert", player.board)?.instanceId,
        turnNumber,
      });
      next = resolved.state;
      produced.push(...resolved.events);
      continue;
    }

    if (event.type === "UNIT_TARGETED") {
      const owner = next.players.find((p) => p.board.some((u) => u.instanceId === event.instanceId));
      const cible = owner?.board.find((u) => u.instanceId === event.instanceId);
      if (!owner || !cible || event.byPlayerId === owner.id) continue;
      if (!signalAvailable(owner, "violet", turnNumber) || !benefitsFromSignal(cible, "violet", owner.board)) continue;
      // Une question est déjà posée (l'effet adverse en attend une réponse) :
      // la défausse du Signal l'écraserait. Le Signal attend, sans être
      // consommé, la prochaine fois qu'on vise une de ces Sentinelles.
      if (next.pendingChoice) continue;
      next = withSignalUsed(next, owner.id, "violet", turnNumber);
      const resolved = resolveEffectSequence(next, VIOLET, {
        controllerId: owner.id,
        sourceInstanceId: signalEmitter(cible, "violet", owner.board)?.instanceId,
        turnNumber,
      });
      next = resolved.state;
      produced.push(...resolved.events);
    }
  }

  return { state: next, events: produced };
}

/**
 * Signal Bleu, au moment où une Sentinelle attaque une UNITÉ adverse : la
 * cible perd 1 Puissance jusqu'au prochain tour de l'attaquant, une fois par
 * tour. Appliqué avant les dégâts — c'est la riposte qu'il affaiblit.
 */
export function applyBlueSignal(
  state: GameState,
  attackerPlayerId: PlayerId,
  attacker: CardInstance,
  defender: CardInstance,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const player = state.players.find((p) => p.id === attackerPlayerId);
  if (!player || !isSentinel(attacker)) return { state, events: [] };
  if (!signalAvailable(player, "bleu", turnNumber) || !benefitsFromSignal(attacker, "bleu", player.board)) {
    return { state, events: [] };
  }
  const malus: StatModifier = {
    id: `mod_${Math.random().toString(36).slice(2, 8)}`,
    source: signalEmitter(attacker, "bleu", player.board)?.cardId ?? attacker.cardId,
    attack: -1,
    health: 0,
    // « jusqu'à VOTRE prochain tour » : celui de l'attaquant (`appliedBy`).
    duration: "untilYourNextTurn",
    appliedBy: attackerPlayerId,
  };
  let next = withSignalUsed(state, attackerPlayerId, "bleu", turnNumber);
  next = {
    ...next,
    players: next.players.map((p) => ({
      ...p,
      board: p.board.map((u) => (u.instanceId === defender.instanceId ? { ...u, modifiers: [...u.modifiers, malus] } : u)),
    })) as [PlayerState, PlayerState],
  };
  return {
    state: next,
    events: [{ type: "DEBUFF_APPLIED", targetInstanceId: defender.instanceId, attack: -1, health: 0, turnNumber, timestamp: Date.now() }],
  };
}
