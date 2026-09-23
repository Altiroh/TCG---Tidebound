import type { CardInstance, ChromaticColor, StatModifier } from "@/game/cards/types";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import { availableSignalSources, isSentinel, signalKey } from "@/game/rules/chromatic";
import { markOncePerTurnUsed } from "@/game/state/oncePerTurn";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * CE QUE FONT LES SIGNAUX QUI RÉAGISSENT À UN FAIT (Lot 15).
 *
 * Rouge et Jaune sont des bonus continus, lus avec les statistiques
 * (`game/cards/stats.ts`). Bleu, Vert et Violet, eux, répondent à un fait de
 * jeu, « la première fois à chaque tour » — une fois par ÉMETTEUR, puisque
 * les Signaux se cumulent : deux Porteurs de Jade rendent 2 Raison.
 *
 *  - Bleu — « la première fois à chaque tour qu'une autre Sentinelle attaque
 *    une unité adverse, cette unité adverse perd 1 Puissance jusqu'à votre
 *    prochain tour », jamais plus de 1 par attaque. Appliqué au COMBAT, avant
 *    les dégâts : la riposte en tient compte (`applyBlueSignal`).
 *  - Vert — « la première fois pendant chacun de vos tours que vous jouez une
 *    autre Sentinelle, récupérez 1 Raison ».
 *  - Violet — « la première fois à chaque tour qu'une autre Sentinelle est
 *    ciblée par un effet adverse, piochez 1 carte puis défaussez-en 1 ».
 *
 * Vert et Violet se lisent dans le journal de l'action qui vient de se
 * résoudre (`processChromaticSignals`, appelée par `dispatch`) : la carte
 * jouée est alors posée, la cible désignée connue. Plusieurs émetteurs d'un
 * coup se résolvent en UN geste (« récupérez 2 Raison », « piochez 2 puis
 * défaussez-en 2 ») : deux défausses successives se marcheraient dessus.
 */

/** Inscrit « ce Signal a servi ce tour » sur chacun de ces émetteurs. */
function marquerEmetteurs(state: GameState, emetteurs: readonly CardInstance[], color: ChromaticColor, turnNumber: number): GameState {
  const ids = new Set(emetteurs.map((u) => u.instanceId));
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      board: p.board.map((u) => (ids.has(u.instanceId) ? markOncePerTurnUsed(u, signalKey(color), turnNumber) : u)),
    })) as [PlayerState, PlayerState],
  };
}

const vert = (n: number): EffectDefinition[] => [
  { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: n } },
];

const violet = (n: number): EffectDefinition[] => [
  { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: n } },
  { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: n } },
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
      const emetteurs = availableSignalSources(posee, "vert", player.board, turnNumber);
      if (emetteurs.length === 0) continue;
      next = marquerEmetteurs(next, emetteurs, "vert", turnNumber);
      const resolved = resolveEffectSequence(next, vert(emetteurs.length), {
        controllerId: player.id,
        sourceInstanceId: emetteurs[0]!.instanceId,
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
      const emetteurs = availableSignalSources(cible, "violet", owner.board, turnNumber);
      if (emetteurs.length === 0) continue;
      // Une question est déjà posée (l'effet adverse en attend une réponse) :
      // la défausse du Signal l'écraserait. Les émetteurs restent disponibles
      // pour la prochaine fois qu'on vise une de ces Sentinelles.
      if (next.pendingChoice) continue;
      next = marquerEmetteurs(next, emetteurs, "violet", turnNumber);
      const resolved = resolveEffectSequence(next, violet(emetteurs.length), {
        controllerId: owner.id,
        sourceInstanceId: emetteurs[0]!.instanceId,
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
 * cible perd 1 Puissance par émetteur disponible, jusqu'au prochain tour de
 * l'attaquant. Appliqué avant les dégâts — c'est la riposte qu'il affaiblit.
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
  // PLAFONNÉ à -1 par attaque (arbitrage du 23/09/2026) : un seul émetteur
  // répond, les autres restent disponibles pour les attaques suivantes du
  // tour. Cumulé, le Bleu retirait toute la riposte d'un coup.
  const emetteurs = availableSignalSources(attacker, "bleu", player.board, turnNumber).slice(0, 1);
  if (emetteurs.length === 0) return { state, events: [] };
  const malus: StatModifier = {
    id: `mod_${Math.random().toString(36).slice(2, 8)}`,
    source: emetteurs[0]!.cardId,
    attack: -emetteurs.length,
    health: 0,
    // « jusqu'à VOTRE prochain tour » : celui de l'attaquant (`appliedBy`).
    duration: "untilYourNextTurn",
    appliedBy: attackerPlayerId,
  };
  let next = marquerEmetteurs(state, emetteurs, "bleu", turnNumber);
  next = {
    ...next,
    players: next.players.map((p) => ({
      ...p,
      board: p.board.map((u) => (u.instanceId === defender.instanceId ? { ...u, modifiers: [...u.modifiers, malus] } : u)),
    })) as [PlayerState, PlayerState],
  };
  return {
    state: next,
    events: [
      { type: "DEBUFF_APPLIED", targetInstanceId: defender.instanceId, attack: -emetteurs.length, health: 0, turnNumber, timestamp: Date.now() },
    ],
  };
}
