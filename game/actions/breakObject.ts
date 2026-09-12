import { getCardDefinition } from "@/game/cards/sets/core";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import {
  assertGameActive,
  assertInPhase,
  assertIsActivePlayer,
  assertIsObjectCard,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, BreakObjectAction } from "@/game/actions/types";

/** Cartes de la défausse de `playerId` éligibles pour l'effet `moveGraveyardCardToHand` fourni (filtrées par type/coût max, cf. `EffectDefinition.filter`). */
function eligibleGraveyardCards(state: GameState, playerId: string, effect: EffectDefinition) {
  const player = getPlayer(state, playerId);
  const allowedTypes = effect.filter?.cardTypes ?? (effect.filter?.cardType ? [effect.filter.cardType] : undefined);
  return player.graveyard.filter((card) => {
    const cardDef = getCardDefinition(card.cardId);
    if (allowedTypes && !(allowedTypes as readonly string[]).includes(cardDef.type)) return false;
    if (effect.filter?.maxCost !== undefined && cardDef.cost > effect.filter.maxCost) return false;
    return true;
  });
}

function validate(state: GameState, action: BreakObjectAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "mainPhase"),
    assertIsObjectCard(state, action.playerId, action.instanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const unit = player.board.find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);

  if (def.requiresTideStateForBreak && !def.requiresTideStateForBreak.includes(state.environment.tideState)) {
    return { ok: false as const, error: "Cet Objet ne peut être brisé dans l'état de Marée actuel." };
  }

  const needsTarget = (def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit");
  if (needsTarget && !action.targetInstanceId) {
    return { ok: false as const, error: "Briser cet Objet nécessite une cible." };
  }

  // "Si possible" (même convention que le ciblage d'Équipement, cf.
  // playCard.ts) : une carte de défausse n'est réclamée que s'il en existe
  // au moins une éligible — sinon l'effet se résout sans rien récupérer.
  const graveyardEffect = (def.onBreakEffects ?? []).find((e) => e.type === "moveGraveyardCardToHand");
  if (graveyardEffect) {
    const eligible = eligibleGraveyardCards(state, action.playerId, graveyardEffect);
    if (action.chosenGraveyardInstanceId) {
      // Un choix explicite doit toujours être valide, même s'il n'était pas
      // le SEUL disponible — indépendant du cas "aucune carte éligible" ci-dessous.
      if (!eligible.some((c) => c.instanceId === action.chosenGraveyardInstanceId)) {
        return { ok: false as const, error: "Cette carte de la défausse n'est pas une cible valide." };
      }
    } else if (eligible.length > 0) {
      return { ok: false as const, error: "Briser cet Objet nécessite de choisir une carte dans la défausse." };
    }
  }

  return { ok: true as const };
}

/**
 * Brise un Objet contrôlé par le joueur : résout `onBreakEffects` puis
 * l'envoie au cimetière. Comme jouer une carte ou Saborder, n'est pas
 * limité en nombre par tour (Notion "Moteur de partie" : pas de limite
 * artificielle d'action).
 *
 * IMPORTANT — "Briser ≠ Saborder" (règle verrouillée) : contrairement à
 * `saborder.ts`, cette action ne déclenche NI `onDeath` NI `onSaborde`. Un
 * texte de carte qui voudrait réagir spécifiquement à un bris devra un
 * jour s'accrocher à un trigger dédié (pas encore nécessaire pour le pool
 * actuel).
 */
export function breakObject(state: GameState, action: BreakObjectAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const unit = player.board.find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const board = player.board.filter((u) => u.instanceId !== unit.instanceId);
  const graveyard = [...player.graveyard, { ...unit, damageMarked: 0, modifiers: [] }];

  const playerAfter: PlayerState = {
    ...player,
    board,
    graveyard,
  };

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfter : p)) as [
      PlayerState,
      PlayerState
    ],
  };

  events.push({ ...base, type: "CARD_MOVED", instanceId: unit.instanceId, fromZone: "board", toZone: "graveyard" });

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: unit.instanceId,
    chosenTargetInstanceId: action.targetInstanceId,
    chosenGraveyardInstanceId: action.chosenGraveyardInstanceId,
    turnNumber: state.turnNumber,
  };

  for (const effect of def.onBreakEffects ?? []) {
    const result = resolveEffect(nextState, effect, context);
    nextState = result.state;
    events.push(...result.events);
  }

  return { ok: true, state: nextState, events };
}
