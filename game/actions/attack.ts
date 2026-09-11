import type { CardInstance } from "@/game/cards/types";
import { getCardDefinition } from "@/game/cards/sets/core";
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

/**
 * Bonus de dégâts (attaquant lui-même + un Équipement qui lui serait
 * attaché) quand la cible de l'attaque est du type visé — ex: Barracuda/
 * Poisson-Scie Gris "+1 contre une Structure", Corde de Remorquage "+1 à
 * l'unité équipée contre une Structure". Ne s'applique qu'aux attaques
 * ciblant une unité (pas une attaque directe du Navire, qui n'a pas de
 * carte-cible) et n'entre jamais dans le calcul de la riposte.
 */
function bonusDamageAgainst(attacker: CardInstance, defenderType: string, state: GameState): number {
  let bonus = 0;
  const attackerDef = getCardDefinition(attacker.cardId);
  if (attackerDef.bonusDamageVsTargetType?.type === defenderType) {
    bonus += attackerDef.bonusDamageVsTargetType.amount;
  }
  for (const unit of [...state.players[0].board, ...state.players[1].board]) {
    if (unit.attachedToInstanceId !== attacker.instanceId) continue;
    const equipDef = getCardDefinition(unit.cardId);
    if (equipDef.bonusDamageVsTargetType?.type === defenderType) {
      bonus += equipDef.bonusDamageVsTargetType.amount;
    }
  }
  return bonus;
}

function validate(state: GameState, action: AttackAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "combatPhase"),
    assertUnitCanAttack(state, action.playerId, action.attackerInstanceId),
    assertValidDefender(state, action.playerId, action.attackerInstanceId, action.defenderInstanceId)
  );
}

/**
 * Résout une attaque : soit une unité contre une autre, soit une unité
 * contre le joueur adverse directement.
 *
 * Combat MUTUEL (changement d'équilibrage confirmé) : quand l'attaque vise
 * une unité (pas le Navire directement), le défenseur riposte — l'attaquant
 * encaisse la Puissance effective du défenseur, exactement symétrique aux
 * dégâts qu'il inflige lui-même. Un permanent sans Puissance (Structure/
 * Objet, `attack` absent → 0 via `computeEffectiveStats`) ne riposte pas.
 * Une attaque directe contre le Navire adverse, elle, ne fait toujours
 * subir aucun dégât en retour (rien à riposter).
 *
 * Les morts éventuelles (attaquant ET défenseur) sont traitées par
 * l'appelant (`engine.ts`) via `processDeaths`, pas ici : cette fonction ne
 * fait que marquer les dégâts.
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
    const defenderType = getCardDefinition(defenderUnit.cardId).type;
    const totalAttackerDamage = attackerDamage + bonusDamageAgainst(attackerUnit, defenderType, nextState);

    nextState = {
      ...nextState,
      players: nextState.players.map((p) => {
        if (p.id === opponent.id) {
          return {
            ...p,
            board: p.board.map((u) =>
              u.instanceId === defenderUnit.instanceId
                ? { ...u, damageMarked: u.damageMarked + totalAttackerDamage }
                : u
            ),
          };
        }
        return p;
      }) as [PlayerState, PlayerState],
    };

    events.push({ ...base, type: "DAMAGE", targetInstanceId: defenderUnit.instanceId, amount: totalAttackerDamage });

    const damagedTrigger = processTrigger(
      nextState,
      { trigger: "onDamaged", playerId: opponent.id, sourceInstanceId: defenderUnit.instanceId },
      state.turnNumber
    );
    nextState = damagedTrigger.state;
    events.push(...damagedTrigger.events);

    // Riposte : la Puissance effective du défenseur (0 pour un permanent
    // sans Puissance) blesse l'attaquant en retour, symétriquement.
    const retaliationDamage = effectiveAttack(defenderUnit, state);
    if (retaliationDamage > 0) {
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === attackerPlayer.id
            ? {
                ...p,
                board: p.board.map((u) =>
                  u.instanceId === attackerUnit.instanceId ? { ...u, damageMarked: u.damageMarked + retaliationDamage } : u
                ),
              }
            : p
        ) as [PlayerState, PlayerState],
      };
      events.push({ ...base, type: "DAMAGE", targetInstanceId: attackerUnit.instanceId, amount: retaliationDamage });

      const attackerDamagedTrigger = processTrigger(
        nextState,
        { trigger: "onDamaged", playerId: attackerPlayer.id, sourceInstanceId: attackerUnit.instanceId },
        state.turnNumber
      );
      nextState = attackerDamagedTrigger.state;
      events.push(...attackerDamagedTrigger.events);
    }
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
