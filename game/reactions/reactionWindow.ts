import { collectReactionCandidates } from "@/game/triggers/triggerBus";
import type { TriggerEvent } from "@/game/triggers/types";
import type { GameEvent } from "@/game/events/types";
import { findCardInstance, type GameState, type PendingReactionState, type PlayerId } from "@/game/state/types";

/**
 * Traduit les `GameEvent` (faits déjà résolus) qu'une action vient de
 * produire vers les `TriggerEvent` (points d'accroche des capacités,
 * `game/triggers/types.ts`) auxquels une capacité `mode: "optional"`
 * pourrait vouloir réagir. Volontairement partiel : seuls les types
 * d'événements pour lesquels une réaction facultative a un sens concret
 * sont mappés (cadrage Notion "Moteur de partie" — combat et fin de tour
 * inclus : "le combat n'exclut pas l'activation d'effet, ex. dégât reçu").
 */
export function deriveReactionTriggerEvents(state: GameState, events: GameEvent[]): TriggerEvent[] {
  const derived: TriggerEvent[] = [];

  for (const event of events) {
    switch (event.type) {
      case "PLAY_CARD":
        derived.push({ trigger: "onCardPlayed", playerId: event.playerId, cardId: event.cardId, sourceInstanceId: event.instanceId });
        break;
      case "SUMMON":
        derived.push({ trigger: "onEnterPlay", playerId: event.playerId, cardId: event.cardId, sourceInstanceId: event.instanceId });
        break;
      case "ATTACK":
        derived.push({ trigger: "onAttack", playerId: event.playerId, sourceInstanceId: event.attackerInstanceId });
        break;
      case "DAMAGE": {
        if (!event.targetInstanceId) break;
        // La cible doit encore être en jeu pour réagir à ses propres
        // dégâts (une carte détruite par ces mêmes dégâts n'a plus de
        // capacité "personnelle" active — cohérent avec `isInactive`/le
        // retrait du board avant `onDeath`).
        const found = findCardInstance(state, event.targetInstanceId);
        if (!found || found.zone !== "board") break;
        derived.push({ trigger: "onDamaged", playerId: found.owner.id, cardId: found.card.cardId, sourceInstanceId: event.targetInstanceId });
        break;
      }
      case "TURN_STARTED":
        derived.push({ trigger: "startOfTurn", playerId: event.playerId });
        break;
      case "END_TURN":
        derived.push({ trigger: "endOfTurn", playerId: event.playerId });
        break;
      case "TIDE_ADVANCED":
        if (event.stateChanged) derived.push({ trigger: "onTideStateEntered", tideState: event.tideState });
        break;
      default:
        break;
    }
  }

  return derived;
}

export function candidateKey(sourceInstanceId: string, abilityIndex: number): string {
  return `${sourceInstanceId}:${abilityIndex}`;
}

/** Candidats éligibles pour `playerId`, moins ceux déjà activés pendant cette fenêtre (`usedCandidateKeys`). */
export function eligibleCandidatesFor(
  state: GameState,
  triggerEvents: TriggerEvent[],
  playerId: PlayerId,
  turnNumber: number,
  usedCandidateKeys: readonly string[]
) {
  return collectReactionCandidates(state, triggerEvents, playerId, turnNumber).filter(
    (c) => !usedCandidateKeys.includes(candidateKey(c.sourceInstanceId, c.abilityIndex))
  );
}

/**
 * Construit l'ordre de priorité pour une nouvelle fenêtre de réaction :
 * joueur actif d'abord puis l'adversaire (même convention que les
 * déclenchements automatiques simultanés, `playersActiveFirst` dans
 * `triggerBus.ts`), ne retient que ceux ayant au moins une réaction
 * éligible et pas déjà utilisée pendant cette fenêtre.
 */
function eligiblePriorityOrder(
  state: GameState,
  triggerEvents: TriggerEvent[],
  turnNumber: number,
  usedCandidateKeys: readonly string[]
): PlayerId[] {
  const order = [state.activePlayerId, ...state.players.map((p) => p.id).filter((id) => id !== state.activePlayerId)];
  return order.filter(
    (playerId) => eligibleCandidatesFor(state, triggerEvents, playerId, turnNumber, usedCandidateKeys).length > 0
  );
}

/**
 * Ouvre une fenêtre de réaction si les `events` produits par l'action qui
 * vient de se résoudre rendent au moins une capacité facultative éligible
 * pour au moins un joueur. Retourne `undefined` sinon (cas normal, tant
 * qu'aucune carte en jeu ne porte de capacité `optional`).
 */
export function openReactionWindowIfEligible(
  state: GameState,
  events: GameEvent[],
  turnNumber: number
): PendingReactionState | undefined {
  const triggerEvents = deriveReactionTriggerEvents(state, events);
  if (triggerEvents.length === 0) return undefined;

  const queue = eligiblePriorityOrder(state, triggerEvents, turnNumber, []);
  if (queue.length === 0) return undefined;

  return { events: triggerEvents, awaitingPlayerId: queue[0]!, priorityQueue: queue.slice(1), usedCandidateKeys: [], turnNumber };
}

/**
 * Recalcule la fenêtre de réaction courante après une étape (activation
 * ou passe) : reconstruit la file de priorité à partir des MÊMES
 * événements déclencheurs, en ne retenant que les joueurs encore
 * éligibles maintenant (l'activation qui vient d'avoir lieu peut avoir
 * consommé la seule capacité éligible d'un joueur, ou au contraire en
 * avoir rendu une nouvelle éligible pour un autre — "une réaction activée
 * peut elle-même déclencher de nouvelles réactions"). Retourne
 * `undefined` si plus personne n'a rien à offrir : la chaîne est
 * totalement résolue.
 */
export function recomputePendingReaction(
  state: GameState,
  previous: PendingReactionState
): PendingReactionState | undefined {
  const queue = eligiblePriorityOrder(state, previous.events, previous.turnNumber, previous.usedCandidateKeys);
  if (queue.length === 0) return undefined;
  return {
    events: previous.events,
    awaitingPlayerId: queue[0]!,
    priorityQueue: queue.slice(1),
    usedCandidateKeys: previous.usedCandidateKeys,
    turnNumber: previous.turnNumber,
  };
}
