import type { CardInstance } from "@/game/cards/types";
import { computeEffectiveStats } from "@/game/cards/stats";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import {
  assertGameActive,
  assertInPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  assertUnitCanAttack,
  assertValidDefender,
  combine,
} from "@/game/rules/validation";
import { getOpponent, getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, AttackAction } from "@/game/actions/types";

function effectiveAttack(unit: CardInstance, state: GameState): number {
  return computeEffectiveStats(unit, state.environment.tideState).attack;
}

function validate(state: GameState, action: AttackAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "combatPhase"),
    assertUnitCanAttack(state, action.playerId, action.attackerInstanceId),
    assertValidDefender(state, action.playerId, action.defenderInstanceId)
  );
}

/**
 * Résout une attaque : soit une unité contre une autre, soit une unité
 * contre le joueur adverse directement.
 *
 * IMPORTANT — "pas de riposte automatique" (cadrage "Mécaniques
 * verrouillées" section 34, règle verrouillée) : seule la cible attaquée
 * subit des dégâts. L'attaquant ne subit jamais de dégâts en retour,
 * sauf effet explicite de type "Riposte" (pas encore modélisé comme
 * mot-clé/effet générique — voir `game/effects/types.ts` pour l'ajouter
 * le jour où une carte l'exige).
 *
 * Les morts éventuelles sont traitées par l'appelant (`engine.ts`) via
 * `processDeaths`, pas ici : cette fonction ne fait que marquer les dégâts.
 */
export function attack(state: GameState, action: AttackAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const attackerPlayer = getPlayer(state, action.playerId);
  const attackerUnit = attackerPlayer.board.find((u) => u.instanceId === action.attackerInstanceId)!;
  const attackerDamage = effectiveAttack(attackerUnit, state);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  events.push({
    ...base,
    type: "ATTACK",
    playerId: action.playerId,
    attackerInstanceId: action.attackerInstanceId,
    defenderInstanceId: action.defenderInstanceId,
  });

  const markAttacked = (unit: CardInstance): CardInstance =>
    unit.instanceId === action.attackerInstanceId ? { ...unit, hasAttackedThisTurn: true } : unit;

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === attackerPlayer.id ? { ...p, board: p.board.map(markAttacked) } : p
    ) as [PlayerState, PlayerState],
  };

  if (!action.defenderInstanceId) {
    const opponent = getOpponent(nextState, action.playerId);
    // Faiblesse "Coque légère" (Le Courlis) : +1 dégât sur une attaque
    // directe contre le Navire, propre à la faiblesse du DÉFENSEUR.
    const directWeakness = getShipDefinition(opponent.shipId).directAttackWeakness ?? 0;
    const directDamage = attackerDamage + directWeakness;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === opponent.id ? { ...p, anchor: p.anchor - directDamage } : p
      ) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "DAMAGE", targetPlayerId: opponent.id, amount: directDamage });
  } else {
    const opponent = getOpponent(nextState, action.playerId);
    const defenderUnit = opponent.board.find((u) => u.instanceId === action.defenderInstanceId)!;

    nextState = {
      ...nextState,
      players: nextState.players.map((p) => {
        if (p.id === opponent.id) {
          return {
            ...p,
            board: p.board.map((u) =>
              u.instanceId === defenderUnit.instanceId
                ? { ...u, damageMarked: u.damageMarked + attackerDamage }
                : u
            ),
          };
        }
        return p;
      }) as [PlayerState, PlayerState],
    };

    events.push({ ...base, type: "DAMAGE", targetInstanceId: defenderUnit.instanceId, amount: attackerDamage });

    const damagedTrigger = processTrigger(
      nextState,
      { trigger: "onDamaged", playerId: opponent.id, sourceInstanceId: defenderUnit.instanceId },
      state.turnNumber
    );
    nextState = damagedTrigger.state;
    events.push(...damagedTrigger.events);
  }

  const attackTrigger = processTrigger(
    nextState,
    { trigger: "onAttack", playerId: action.playerId, sourceInstanceId: action.attackerInstanceId },
    state.turnNumber
  );
  nextState = attackTrigger.state;
  events.push(...attackTrigger.events);

  return { ok: true, state: nextState, events };
}
