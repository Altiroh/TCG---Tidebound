import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import {
  assertGameActive,
  assertInAnyPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  assertValidDefender,
  combine,
} from "@/game/rules/validation";
import { isShipArmed, shipAbilityOf, withArmingConsumed } from "@/game/state/shipAbility";
import { collectReactionCandidates } from "@/game/triggers/triggerBus";
import { consumeDirectShipDamageShield } from "@/game/state/shields";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isVisibleDuringTide } from "@/game/cards/types";
import type { TriggerEvent } from "@/game/triggers/types";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, FireShipAbilityAction } from "@/game/actions/types";

function validate(state: GameState, action: FireShipAbilityAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player);
  const shot = ability?.armedShot;
  if (!ability || !shot) return { ok: false as const, error: "Ce Navire n'a pas de tir à déclencher." };

  if (!isShipArmed(player, state.turnNumber)) {
    return { ok: false as const, error: `${ability.name} n'est pas armé.` };
  }

  const phaseCheck = assertInAnyPhase(state, action.playerId, shot.phases);
  if (!phaseCheck.ok) return phaseCheck;

  // Le tir vise comme une attaque : Garde d'abord, Navire adverse à défaut,
  // permanent sans Résistance (un Objet) exclu. Aucun attaquant à passer —
  // un Navire ne contourne jamais Garde.
  return assertValidDefender(state, action.playerId, undefined, action.targetInstanceId);
}

/**
 * Tire avec la capacité armée du Navire (`ShipArmedShot`) : consomme
 * l'armement, puis résout les effets du tir sur ce que le joueur a désigné
 * — un permanent adverse, ou le Navire adverse si `targetInstanceId` est
 * absent, exactement comme une attaque directe.
 *
 * Ce sont des effets de CAPACITÉ : ils passent par `resolveEffect` et non
 * par le pipeline de combat. Donc aucune riposte, aucune faiblesse d'attaque
 * directe, aucun bouclier
 * anti-attaque, et l'attaque d'aucune unité n'est consommée.
 */
export function fireShipAbility(state: GameState, action: FireShipAbilityAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player)!;
  const shot = ability.armedShot!;
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  // --- FENÊTRE D'INTERCEPTION (arbitrage du 21/09/2026) ------------------
  //
  // Un tir visant le NAVIRE adverse est, du point de vue des pièges, « des
  // dégâts directs » comme les autres : leur texte ne distingue pas la
  // source du coup. Sans cette fenêtre, le Canon du Goliath traversait
  // toutes les défenses — mesuré à 87 % de victoires contre un deck de
  // pièges, seul deck du format dont la route de dégâts était intouchable.
  //
  // Un tir visant un PERMANENT n'ouvre rien : ce n'est pas la coque qui est
  // menacée, et aucun piège actuel ne parle de ça.
  if (!action.targetInstanceId && !state.pendingAttack) {
    const defenseur = state.players.find((p) => p.id !== player.id)!;
    const triggerEvents: TriggerEvent[] = [
      { trigger: "onIncomingDirectAttack", playerId: defenseur.id, sourceInstanceId: player.id },
    ];
    const candidats = collectReactionCandidates(state, triggerEvents, defenseur.id, state.turnNumber);
    if (candidats.length > 0) {
      return {
        ok: true,
        state: {
          ...state,
          pendingAttack: {
            kind: "tirDeNavire",
            playerId: action.playerId,
            // Le Navire n'est pas une unité : son « attaquant » est le joueur.
            attackerInstanceId: player.id,
            attackerPower: 0,
          },
          pendingReaction: {
            events: triggerEvents,
            awaitingPlayerId: defenseur.id,
            priorityQueue: [],
            usedCandidateKeys: [],
            turnNumber: state.turnNumber,
          },
        },
        events: [{ ...base, type: "REACTION_WINDOW_OPENED", playerId: defenseur.id }],
      };
    }
  }

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? withArmingConsumed(p) : p)) as [PlayerState, PlayerState],
  };

  events.push({
    ...base,
    type: "SHIP_ABILITY_FIRED",
    playerId: player.id,
    shipId: player.shipId,
    abilityName: ability.name,
    targetInstanceId: action.targetInstanceId,
  });

  // --- DÉFENSES DU NAVIRE VISÉ (arbitrage du 21/09/2026) ----------------
  //
  // Un tir sur la coque rencontre désormais les MÊMES défenses qu'une
  // attaque : le bouclier « une fois par tour » du défenseur (Cage de
  // Flottaison visible) et son plafond par coup (Carcasse Renversée). Sans
  // elles, le Canon restait à moitié intouchable — la fenêtre d'interception
  // seule ne couvrait que les pièges MASQUÉS, et À Portée gagnait encore
  // 83 % contre un deck de défense.
  //
  // Un tir sur un PERMANENT n'en rencontre aucune : ce sont des défenses de
  // coque, et la coque n'est pas visée.
  const defenseur = nextState.players.find((p) => p.id !== player.id)!;
  let bouclier = 0;
  let plafond: number | undefined;
  if (!action.targetInstanceId) {
    // Le Navire n'est pas une carte : un bouclier restreint à certains types
    // d'attaquant ne s'applique donc pas (cf. `consumeDirectShipDamageShield`).
    const consomme = consumeDirectShipDamageShield(nextState, defenseur.id, state.turnNumber);
    nextState = consomme.state;
    bouclier = consomme.reduction;
    plafond = getPlayer(nextState, defenseur.id).board.reduce<number | undefined>((cap, unit) => {
      const def = getCardDefinition(unit.cardId);
      const value = def.capDirectShipDamageWhileVisible;
      if (value === undefined || !isVisibleDuringTide(def, nextState.environment.tideState)) return cap;
      return cap === undefined ? value : Math.min(cap, value);
    }, undefined);
  }

  // Un piège a répondu : annuler vaut réduction infinie, sinon sa réduction
  // s'ajoute à celle des défenses automatiques.
  const suspendu = state.pendingAttack;
  const context: EffectContext = {
    controllerId: player.id,
    chosenTargetInstanceId: action.targetInstanceId,
    turnNumber: state.turnNumber,
    directDamageCap: plafond,
    directDamageReduction: suspendu?.intercepted
      ? Number.MAX_SAFE_INTEGER
      : bouclier + (suspendu?.damageReduction ?? 0),
  };
  const fired = resolveEffectSequence(nextState, shot.effects, context);
  nextState = fired.state;
  events.push(...fired.events);

  return { ok: true, state: nextState, events };
}
