import { getCardDefinition } from "@/game/cards/sets/core";
import { isEligibleChosenUnit } from "@/game/effects/chosenTargets";
import { validateGraveyardChoice } from "@/game/effects/graveyardChoices";
import { candidateKey, deriveReactionTriggerEvents, eligibleCandidatesFor, recomputePendingReaction } from "@/game/reactions/reactionWindow";
import {
  processDiscardedFromHandTriggers,
  processGraveyardRecoveryTriggers,
  processSummonEnterTriggers,
  resolveReaction,
} from "@/game/triggers/triggerBus";
import type { PendingReactionCandidate } from "@/game/triggers/types";
import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import type { GameState, PlayerState } from "@/game/state/types";
import type { ActionResult, ActivateReactionAction } from "@/game/actions/types";

function validate(
  state: GameState,
  action: ActivateReactionAction
): { ok: true; candidate: PendingReactionCandidate } | { ok: false; error: string } {
  const generalChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!generalChecks.ok) return generalChecks;

  const pending = state.pendingReaction;
  if (!pending) return { ok: false, error: "Aucune fenêtre de réaction n'est ouverte." };
  if (pending.awaitingPlayerId !== action.playerId) {
    return { ok: false, error: "Ce n'est pas à ce joueur de répondre à cette fenêtre de réaction." };
  }

  // Réévalué à l'instant T (coût, cible disponible) et privé de ce qui a
  // déjà été activé pendant cette même fenêtre — jamais une liste mise en
  // cache.
  const candidates = eligibleCandidatesFor(state, pending.events, action.playerId, pending.turnNumber, pending.usedCandidateKeys);
  const candidate = candidates.find(
    (c) => c.sourceInstanceId === action.sourceInstanceId && c.abilityIndex === action.abilityIndex
  );
  if (!candidate) return { ok: false, error: "Cette capacité n'est plus éligible." };
  if (candidate.needsTarget) {
    if (!action.targetInstanceId) return { ok: false, error: "Cette réaction nécessite une cible." };
    // La cible doit respecter le filtre du texte ("choisissez un
    // Cra-Poiscail") : refusée ici plutôt que silencieusement ignorée par
    // `resolveEffect`, pour que le joueur sache pourquoi rien ne se passe.
    const effects = getCardDefinition(candidate.cardId).abilities?.[candidate.abilityIndex]?.effects ?? [];
    const legal = effects
      .filter((e) => e.target.kind === "chosenUnit")
      .every((e) =>
        isEligibleChosenUnit(state, e.target, action.playerId, action.targetInstanceId!, candidate.sourceInstanceId)
      );
    if (!legal) return { ok: false, error: "Cette carte n'est pas une cible valide pour cette réaction." };
  }

  // Même exigence pour le Cimetière, et le même message quand le joueur a
  // désigné une carte que le filtre refuse.
  const effects = getCardDefinition(candidate.cardId).abilities?.[candidate.abilityIndex]?.effects;
  const graveyard = validateGraveyardChoice(state, action.playerId, effects, action.chosenGraveyardInstanceId);
  if (!graveyard.ok) {
    return {
      ok: false,
      error:
        graveyard.reason === "illegal"
          ? "Cette carte du Cimetière n'est pas une cible valide."
          : "Cette réaction nécessite de choisir une carte dans le Cimetière.",
    };
  }

  return { ok: true, candidate };
}

/**
 * Active une capacité facultative éligible pendant une fenêtre de
 * réaction : paie son coût, résout ses effets, puis reconstruit la
 * fenêtre — soit elle continue (l'activation vient elle-même de rendre
 * une nouvelle réaction éligible, cadrage : "une réaction activée peut
 * déclencher de nouvelles réactions"), soit elle se ferme si plus
 * personne n'a rien à offrir. La capacité activée ne peut pas l'être une
 * seconde fois pendant cette même fenêtre (`usedCandidateKeys`).
 */
export function activateReaction(state: GameState, action: ActivateReactionAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const pending = state.pendingReaction!;

  // --- RÉVÉLATION AVANT RÉSOLUTION (grammaire des Structures, 21/09/2026)
  //
  // Une Réaction cachée s'active depuis une Structure que l'adversaire ne
  // voit pas : il sait qu'un Slot est occupé, pas par quoi. Activer expose
  // donc la carte AVANT que ses effets ne s'appliquent — on ne se fait pas
  // frapper par une carte qu'on n'a jamais vue, et l'adversaire peut lire ce
  // qui l'atteint dans le journal, dans le bon ordre.
  //
  // La révélation est définitive (`CardInstance.revealed`) : si la Marée
  // remasque la Structure au tour suivant, elle reste connue.
  let revealedState = state;
  const revealEvents: GameEvent[] = [];
  const activatedAbility = getCardDefinition(validation.candidate.cardId).abilities?.[action.abilityIndex];
  if (activatedAbility?.hiddenReaction) {
    const owner = revealedState.players.find((p) => p.board.some((u) => u.instanceId === action.sourceInstanceId));
    const holder = owner?.board.find((u) => u.instanceId === action.sourceInstanceId);
    if (owner && holder && !holder.revealed) {
      revealedState = {
        ...revealedState,
        players: revealedState.players.map((p) =>
          p.id === owner.id
            ? { ...p, board: p.board.map((u) => (u.instanceId === holder.instanceId ? { ...u, revealed: true } : u)) }
            : p
        ) as [PlayerState, PlayerState],
      };
      revealEvents.push({
        type: "STRUCTURE_REVEALED",
        turnNumber: pending.turnNumber,
        timestamp: Date.now(),
        playerId: owner.id,
        instanceId: holder.instanceId,
        cardId: holder.cardId,
      });
    }
  }

  const resolution = resolveReaction(
    revealedState,
    validation.candidate,
    action.targetInstanceId,
    pending.turnNumber,
    action.chosenGraveyardInstanceId
  );
  let nextState = resolution.state;
  // La révélation précède les effets DANS LE JOURNAL aussi : c'est l'ordre
  // que lit l'adversaire.
  const events: GameEvent[] = [...revealEvents, ...resolution.events];

  // Ce que la réaction vient de faire arriver (invocation, arrivée rejouée
  // par Colombina) réveille les capacités d'arrivée AUTOMATIQUES concernées,
  // comme après une pose.
  const arrivals = processSummonEnterTriggers(nextState, resolution.events, pending.turnNumber);
  nextState = arrivals.state;
  events.push(...arrivals.events);

  // Et ce qu'elle vient de repêcher ou de défausser : une réaction n'est pas
  // une voie à part, ses gestes réveillent les mêmes déclencheurs.
  const recovered = processGraveyardRecoveryTriggers(nextState, resolution.events, pending.turnNumber);
  nextState = recovered.state;
  events.push(...recovered.events);
  const discarded = processDiscardedFromHandTriggers(nextState, resolution.events, pending.turnNumber);
  nextState = discarded.state;
  events.push(...discarded.events);

  // « Choisissez : A ou B » : activer l'une des capacités d'un groupe écarte
  // ses sœurs pour le reste de la fenêtre.
  const def = getCardDefinition(validation.candidate.cardId);
  const activated = def.abilities?.[action.abilityIndex];
  const siblings = activated?.choiceGroup
    ? (def.abilities ?? []).flatMap((ability, index) => (ability.choiceGroup === activated.choiceGroup ? [candidateKey(action.sourceInstanceId, index)] : []))
    : [];
  const usedCandidateKeys = Array.from(new Set([...pending.usedCandidateKeys, candidateKey(action.sourceInstanceId, action.abilityIndex), ...siblings]));

  // « Une réaction activée peut elle-même déclencher de nouvelles
  // réactions » : ce qu'elle a produit s'ajoute aux déclencheurs de la
  // fenêtre — une arrivée rejouée rouvre ainsi les choix de la carte visée.
  const triggerEvents = [...pending.events, ...deriveReactionTriggerEvents(nextState, events)];
  const nextPending = recomputePendingReaction(nextState, { ...pending, events: triggerEvents, usedCandidateKeys });
  if (nextPending) {
    events.push({
      type: "REACTION_WINDOW_OPENED",
      turnNumber: nextPending.turnNumber,
      timestamp: Date.now(),
      playerId: nextPending.awaitingPlayerId,
    });
  }

  return { ok: true, state: { ...nextState, pendingReaction: nextPending }, events };
}
