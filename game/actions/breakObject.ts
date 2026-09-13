import { getCardDefinition } from "@/game/cards/sets/core";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import {
  assertCanPayCost,
  assertCardInHand,
  assertGameActive,
  assertInPhase,
  assertIsActivePlayer,
  assertIsObjectCard,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import type { CardDefinition } from "@/game/cards/types";
import { canPayReason } from "@/game/state/reason";
import { payReasonCost, reasonCostAfterShield } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";
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

/**
 * Coût IMPRIMÉ du Bris depuis la main (Notion "Catalogue de cartes", règle
 * prototype "Briser un Objet depuis la main") : moitié du coût imprimé,
 * arrondie au supérieur, minimum 1 Raison. Une réduction temporaire de coût
 * ne le réduit pas ; le bouclier de perte de Raison s'applique au paiement,
 * comme pour tout coût.
 */
export function handBreakCost(def: CardDefinition): number {
  return Math.max(1, Math.ceil(def.cost / 2));
}

/**
 * Raison que coûterait réellement le Bris depuis la main de cet Objet
 * maintenant (bouclier compris) et la Raison qui en résulterait — pour
 * l'annoncer dans l'UI avant confirmation. `undefined` si la carte n'est pas
 * un Objet de la main du joueur.
 */
export function previewHandBreakReason(
  state: GameState,
  playerId: PlayerId,
  instanceId: string
): { cost: number; reasonAfter: number; allowed: boolean } | undefined {
  const player = state.players.find((p) => p.id === playerId);
  const card = player?.hand.find((c) => c.instanceId === instanceId);
  if (!player || !card) return undefined;
  const def = getCardDefinition(card.cardId);
  if (def.type !== "objet") return undefined;
  const cost = reasonCostAfterShield(state, playerId, handBreakCost(def), state.turnNumber);
  return { cost, reasonAfter: player.reason - cost, allowed: canPayReason(player, cost) };
}

/**
 * Cartes de défausse que le joueur devra choisir en brisant cet Objet (effet
 * `moveGraveyardCardToHand`, ex: Grappin de Récupération) — vide si l'Objet
 * n'a pas cet effet ou si rien n'est éligible (l'effet se résout alors sans
 * choix). Même filtre que la validation : l'UI propose exactement les cartes
 * que le moteur acceptera.
 */
export function graveyardChoicesForBreak(state: GameState, playerId: PlayerId, def: CardDefinition) {
  const effect = (def.onBreakEffects ?? []).find((e) => e.type === "moveGraveyardCardToHand");
  return effect ? eligibleGraveyardCards(state, playerId, effect) : [];
}

function validate(state: GameState, action: BreakObjectAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "mainPhase"),
    action.fromHand
      ? assertCardInHand(state, action.playerId, action.instanceId)
      : assertIsObjectCard(state, action.playerId, action.instanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const unit = (action.fromHand ? player.hand : player.board).find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);

  if (action.fromHand) {
    if (def.type !== "objet") return { ok: false as const, error: "Seul un Objet peut être brisé." };
    const costCheck = assertCanPayCost(
      state,
      action.playerId,
      reasonCostAfterShield(state, action.playerId, handBreakCost(def), state.turnNumber)
    );
    if (!costCheck.ok) return costCheck;
  }

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
 * Brise un Objet contrôlé par le joueur — posé sur son plateau, ou depuis sa
 * main (`fromHand`, coût `handBreakCost`) : résout `onBreakEffects` puis
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
  const fromZone = action.fromHand ? "hand" : "board";
  const unit = (action.fromHand ? player.hand : player.board).find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  // Depuis la main : ne prend jamais de Slot, va directement en défausse après résolution.
  const playerAfter: PlayerState = {
    ...player,
    hand: action.fromHand ? player.hand.filter((c) => c.instanceId !== unit.instanceId) : player.hand,
    board: action.fromHand ? player.board : player.board.filter((u) => u.instanceId !== unit.instanceId),
    graveyard: [...player.graveyard, { ...unit, damageMarked: 0, modifiers: [] }],
  };

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfter : p)) as [
      PlayerState,
      PlayerState
    ],
  };

  if (action.fromHand) {
    const payment = payReasonCost(nextState, player.id, handBreakCost(def), state.turnNumber);
    nextState = payment.state;
    events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -payment.paid });
  }

  events.push({ ...base, type: "CARD_MOVED", instanceId: unit.instanceId, fromZone, toZone: "graveyard" });

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
