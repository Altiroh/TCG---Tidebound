import { collectReactionCandidates } from "@/game/triggers/triggerBus";
import { shipWindowAbilityFor } from "@/game/state/shipAbility";
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
      // Une arrivée REJOUÉE (Colombina) rouvre aussi les capacités
      // facultatives d'arrivée de la carte visée : c'est tout l'intérêt.
      case "ENTER_EFFECTS_REPEATED":
        derived.push({ trigger: "onEnterPlay", playerId: event.playerId, cardId: event.cardId, sourceInstanceId: event.instanceId });
        break;
      case "ATTACK": {
        // Même contenu que le déclenchement automatique (`attack.ts`) :
        // l'attaquant a pu mourir au combat, on retombe alors sur un
        // événement sans `cardId` — les filtres par identité ne matchent
        // simplement pas, plutôt que de mentir sur qui a attaqué.
        const attacker = findCardInstance(state, event.attackerInstanceId);
        derived.push({
          trigger: "onAttack",
          playerId: event.playerId,
          sourceInstanceId: event.attackerInstanceId,
          cardId: attacker?.card.cardId,
        });
        break;
      }
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
      // Une mort ouvre une fenêtre comme le reste : la carte morte peut
      // proposer sa propre réaction depuis le cimetière (Pulcinella
      // Gonflé), et ses observateurs encore en jeu la leur (Plongeur des
      // Épaves, Mécanicien aux Mains Noires). Décision du 17/09/2026 :
      // « jamais automatique, le joueur choisit ».
      case "DESTROY": {
        // L'identité du défunt n'est pas portée par l'événement : on la
        // relit dans le cimetière, où `processDeaths` vient de le poser.
        const found = findCardInstance(state, event.instanceId);
        if (!found) break;
        derived.push({
          trigger: "onDeath",
          playerId: found.owner.id,
          cardId: found.card.cardId,
          sourceInstanceId: event.instanceId,
        });
        break;
      }
      // Un Sabordage émet TOUJOURS `DESTROY` juste après (cf.
      // `processDeaths`) : les deux déclencheurs du texte sont couverts,
      // et `collectReactionCandidates` dédoublonne par capacité.
      case "SABORDED": {
        const found = findCardInstance(state, event.instanceId);
        derived.push({
          trigger: "onSaborde",
          playerId: found?.owner.id ?? event.playerId,
          cardId: event.cardId ?? found?.card.cardId,
          sourceInstanceId: event.instanceId,
        });
        break;
      }
      case "OBJECT_BROKEN":
        derived.push({ trigger: "onObjectBroken", playerId: event.playerId, cardId: event.cardId, sourceInstanceId: event.instanceId });
        break;
      case "TURN_STARTED":
        derived.push({ trigger: "startOfTurn", playerId: event.playerId });
        break;
      case "END_TURN":
        derived.push({ trigger: "endOfTurn", playerId: event.playerId });
        break;
      case "TIDE_ADVANCED":
        if (event.stateChanged) derived.push({ trigger: "onTideStateEntered", tideState: event.tideState });
        break;
      case "STRUCTURE_REVEALED": {
        // La Structure doit encore être en jeu pour réagir à sa propre
        // apparition (même garde que pour `onDamaged`).
        const found = findCardInstance(state, event.instanceId);
        if (!found || found.zone !== "board") break;
        derived.push({ trigger: "onBecomeVisible", playerId: event.playerId, cardId: event.cardId, sourceInstanceId: event.instanceId });
        break;
      }
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
 * Fenêtre de capacité de NAVIRE correspondant à ces déclencheurs, s'il en
 * existe une. Le Navire n'est pas une carte : il n'apparaît donc jamais
 * dans `collectReactionCandidates`, et c'est cette table — une seule
 * entrée à ce jour — qui dit quelle fenêtre du moteur l'invite à répondre.
 */
function shipWindowFor(triggerEvents: readonly TriggerEvent[]): "tideAnnounced" | undefined {
  return triggerEvents.some((event) => event.trigger === "onTideAnnounced") ? "tideAnnounced" : undefined;
}

/**
 * Ce joueur a-t-il une capacité de NAVIRE à proposer dans cette fenêtre ?
 *
 * Contrairement aux cartes, rien n'est « déjà utilisé pendant cette
 * fenêtre » à retenir : les réserves de la capacité (par tour, par partie)
 * sont consommées à l'activation, donc elle cesse d'elle-même d'être
 * éligible dès qu'elle a servi.
 */
export function shipReactionEligible(
  state: GameState,
  triggerEvents: readonly TriggerEvent[],
  playerId: PlayerId
): boolean {
  const window = shipWindowFor(triggerEvents);
  return window !== undefined && shipWindowAbilityFor(state, playerId, window) !== undefined;
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
    (playerId) =>
      shipReactionEligible(state, triggerEvents, playerId) ||
      eligibleCandidatesFor(state, triggerEvents, playerId, turnNumber, usedCandidateKeys).length > 0
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
  return ouvrirFenetrePour(state, triggerEvents, turnNumber);
}

/**
 * Ouvre une fenêtre pour des déclencheurs NOMMÉS, sans passer par le
 * journal d'événements.
 *
 * `openReactionWindowIfEligible` déduit ses déclencheurs des `GameEvent`
 * déjà produits, à la fin de `dispatch` — trop tard pour une fenêtre qui
 * doit s'intercaler AU MILIEU d'une action : l'interception d'une attaque
 * avant qu'elle ne porte, l'annonce d'une Marée avant que ses effets ne
 * tombent. Ces fenêtres-là se déclarent, et c'est cette fonction qui les
 * ouvre. `undefined` si personne n'a rien à proposer.
 */
export function ouvrirFenetrePour(
  state: GameState,
  triggerEvents: TriggerEvent[],
  turnNumber: number
): PendingReactionState | undefined {
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
