import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameEvent } from "@/game/events/types";
import {
  assertGameActive,
  assertInAnyPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { payReasonCost } from "@/game/state/shields";
import {
  activationsPerTurn,
  activationsUsedThisTurn,
  gameActivationsLeft,
  shipAbilityOf,
  shipWindowAbilityFor,
  withActivationRecorded,
} from "@/game/state/shipAbility";
import { recomputePendingReaction, shipReactionEligible } from "@/game/reactions/reactionWindow";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActivateShipAbilityAction, ActionResult } from "@/game/actions/types";

/**
 * Cette activation a-t-elle lieu DANS une fenêtre de réaction
 * (`activationWindow`) plutôt que pendant le tour de son contrôleur ?
 *
 * Une capacité de fenêtre n'est activable QUE là : hors fenêtre, elle n'a
 * pas de phase à laquelle se raccrocher — c'est tout l'intérêt de la
 * déclarer ainsi.
 */
function activationEnFenetre(state: GameState, action: ActivateShipAbilityAction): boolean {
  const pending = state.pendingReaction;
  if (!pending || pending.awaitingPlayerId !== action.playerId) return false;
  return shipReactionEligible(state, pending.events, action.playerId);
}

function validate(state: GameState, action: ActivateShipAbilityAction) {
  const baseChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!baseChecks.ok) return baseChecks;

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player);
  if (!ability) return { ok: false as const, error: "Ce Navire n'a pas de capacité activable." };

  if (ability.activationWindow) {
    // Fenêtre : ni « c'est votre tour », ni phase — c'est la fenêtre qui
    // dit qui répond et quand. Le reste (réserve du tour, réserve de la
    // partie) continue de s'appliquer, et `shipWindowAbilityFor` les a
    // déjà vérifiées.
    if (!activationEnFenetre(state, action)) {
      return {
        ok: false as const,
        error: `${ability.name} ne s'active que pendant sa fenêtre : une Marée qui vient d'être annoncée.`,
      };
    }
    return { ok: true as const };
  }

  const turnChecks = assertIsActivePlayer(state, action.playerId);
  if (!turnChecks.ok) return turnChecks;

  const phaseCheck = assertInAnyPhase(state, action.playerId, ability.activationPhases);
  if (!phaseCheck.ok) return phaseCheck;

  if (activationsUsedThisTurn(player, state.turnNumber) >= activationsPerTurn(ability)) {
    return { ok: false as const, error: `${ability.name} a déjà été utilisée ce tour-ci.` };
  }

  // Fréquence « une fois par partie » : la réserve vit dans l'état du
  // joueur (`game/state/oncePerGame.ts`), donc une reconnexion ne la rouvre
  // pas et le navigateur n'en décide jamais.
  if (!gameActivationsLeft(player, ability)) {
    return { ok: false as const, error: `${ability.name} a déjà été utilisée cette partie.` };
  }

  // Le coût en Raison n'est jamais refusé, ici comme pour une capacité de
  // carte : sans plancher de Déraison, il se paie en creusant la dette
  // (`game/state/reason.ts`). Le Goliath peut donc tirer à crédit — c'est
  // exactement son intention de design.

  return { ok: true as const };
}

/**
 * Active la capacité du NAVIRE de ce joueur
 * (`ShipDefinition.activatableAbility`) : paie son coût, inscrit
 * l'activation au compteur du tour, puis — selon la capacité — résout ses
 * effets immédiats, arme son tir différé, ou les deux.
 *
 * Ne consomme pas l'action principale du tour : la capacité appartient au
 * Navire, pas à une carte posée, et ne prive donc le joueur d'aucun autre
 * geste. Une capacité en deux temps se tire ensuite avec `fireShipAbility`.
 */
export function activateShipAbility(state: GameState, action: ActivateShipAbilityAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player)!;
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };
  const arms = Boolean(ability.armedShot);

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === player.id ? withActivationRecorded(p, state.turnNumber, arms, ability) : p
    ) as [PlayerState, PlayerState],
  };

  const reasonCost = ability.cost.reason ?? 0;
  if (reasonCost > 0) {
    const payment = payReasonCost(nextState, player.id, reasonCost, state.turnNumber);
    nextState = payment.state;
    events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -payment.paid });
  }

  events.push({
    ...base,
    type: "SHIP_ABILITY_ACTIVATED",
    playerId: player.id,
    shipId: player.shipId,
    abilityName: ability.name,
    armed: arms,
  });

  if (ability.onActivateEffects) {
    const context: EffectContext = { controllerId: player.id, turnNumber: state.turnNumber };
    const activated = resolveEffectSequence(nextState, ability.onActivateEffects, context);
    nextState = activated.state;
    events.push(...activated.events);
  }

  // Activation EN FENÊTRE : c'est elle qui referme ou poursuit la fenêtre,
  // exactement comme `activateReaction` — `dispatch` n'y touche pas, et
  // sans ce recalcul le joueur resterait indéfiniment invité à répondre.
  if (ability.activationWindow && state.pendingReaction) {
    const suite = recomputePendingReaction(nextState, state.pendingReaction);
    nextState = { ...nextState, pendingReaction: suite };
    if (suite) {
      events.push({
        type: "REACTION_WINDOW_OPENED",
        turnNumber: suite.turnNumber,
        timestamp: Date.now(),
        playerId: suite.awaitingPlayerId,
      });
    }
  }

  return { ok: true, state: nextState, events };
}

/** Le Navire de ce joueur porte-t-il une capacité activable câblée ? Utile aux appelants qui n'ont que l'identifiant. */
export function shipHasActivatableAbility(shipId: string): boolean {
  return getShipDefinition(shipId).activatableAbility !== undefined;
}
