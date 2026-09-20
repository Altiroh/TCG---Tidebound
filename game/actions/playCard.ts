import { canBeEquipTarget, getCardDefinition, hasAnyValidEquipTarget } from "@/game/cards/sets/core";
import { isPermanentCard, isVisibleDuringTide, UNIT_CARD_TYPES, type CardDefinition } from "@/game/cards/types";
import { validateGraveyardChoice } from "@/game/effects/graveyardChoices";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { discountApplies, resolveEffect } from "@/game/effects/resolveEffect";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import type { GameEvent } from "@/game/events/types";
import {
  processDiscardedFromHandTriggers,
  processGraveyardRecoveryTriggers,
  processReturnedToHandTriggers,
  processSummonEnterTriggers,
  processTrigger,
} from "@/game/triggers/triggerBus";
import {
  assertBoardNotFull,
  assertCanPayCost,
  assertCardInHand,
  assertGameActive,
  assertInMainPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { payReasonCost, reasonCostAfterShield } from "@/game/state/shields";
import { getPlayer, MIN_DISCOUNTED_COST, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";
import type { ActionResult, PlayCardAction } from "@/game/actions/types";

function isUnitCard(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/** Coût imprimé, en tenant compte d'un `costOverrideWhenTideStateIn` actif (ex: Choppe ! gratuite pendant Calme). */
function printedCost(def: CardDefinition, state: GameState): number {
  const override = def.costOverrideWhenTideStateIn;
  if (override && override.tideStateIn.includes(state.environment.tideState)) return override.cost;
  return def.cost;
}

/**
 * Coût réel à payer : coût imprimé, moins les réductions en attente du
 * joueur qui s'appliquent à cette carte (Lot 11 — « la prochaine
 * Marionnette que vous jouez ce tour coûte 1 de moins »).
 *
 * Le plancher `MIN_DISCOUNTED_COST` est appliqué ICI, une fois toutes les
 * réductions cumulées, et pas réduction par réduction : deux réductions de
 * 1 sur une carte à 2 la ramènent à 1, pas à 0. C'est la règle générale du
 * lot (« aucun effet de réduction ne peut faire descendre un coût sous 1 »),
 * tenue à un seul endroit plutôt que répétée sur chaque carte.
 *
 * Une carte dont le coût imprimé est DÉJÀ sous le plancher (une carte
 * gratuite par override de Marée) n'est pas remontée : le plancher borne
 * les réductions, il n'impose pas un coût minimum au catalogue.
 */
function effectiveCost(def: CardDefinition, state: GameState, playerId?: PlayerId): number {
  const printed = printedCost(def, state);
  if (playerId === undefined) return printed;

  const player = state.players.find((p) => p.id === playerId);
  const reduction = (player?.costDiscounts ?? [])
    .filter((discount) => discountApplies(discount, def, state.turnNumber))
    .reduce((sum, discount) => sum + discount.amount, 0);
  if (reduction <= 0) return printed;

  return Math.max(Math.min(printed, MIN_DISCOUNTED_COST), printed - reduction);
}

/**
 * Consomme UNE charge de chaque réduction qui vient de s'appliquer, et
 * jette celles qui n'ont plus de charge. Appelé une seule fois, au moment
 * où la carte est effectivement payée — prévisualiser un coût ne doit rien
 * consommer.
 */
function consumeCostDiscounts(state: GameState, playerId: PlayerId, def: CardDefinition): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.costDiscounts?.length) return state;

  const remaining = player.costDiscounts
    .map((discount) => (discountApplies(discount, def, state.turnNumber) ? { ...discount, uses: discount.uses - 1 } : discount))
    .filter((discount) => discount.uses > 0 && state.turnNumber <= discount.expiresAfterTurn);

  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, costDiscounts: remaining } : p)) as GameState["players"],
  };
}

/**
 * Raison que coûterait réellement cette carte de la main si elle était
 * jouée maintenant (override de Marée + bouclier de perte de Raison), et
 * la Raison qui en résulterait — pour annoncer la Déraison dans l'UI AVANT
 * validation. `undefined` si la carte n'est pas dans la main du joueur.
 */
export function previewPlayCardReason(
  state: GameState,
  playerId: PlayerId,
  instanceId: string
): { cost: number; reasonAfter: number; allowed: boolean } | undefined {
  const player = state.players.find((p) => p.id === playerId);
  const card = player?.hand.find((c) => c.instanceId === instanceId);
  if (!player || !card) return undefined;
  const cost = reasonCostAfterShield(state, playerId, effectiveCost(getCardDefinition(card.cardId), state, playerId), state.turnNumber);
  // `allowed` reste dans la forme rendue : sans plancher de Déraison, un
  // coût se paie toujours, l'UI n'a plus qu'à annoncer la dette.
  return { cost, reasonAfter: player.reason - cost, allowed: true };
}

function validate(state: GameState, action: PlayCardAction) {
  const player = state.players.find((p) => p.id === action.playerId);
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInMainPhase(state, action.playerId),
    assertCardInHand(state, action.playerId, action.instanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const instance = player!.hand.find((c) => c.instanceId === action.instanceId)!;
  const def = getCardDefinition(instance.cardId);

  if (def.requiresTideState && !def.requiresTideState.includes(state.environment.tideState)) {
    return { ok: false as const, error: "Cette carte ne peut pas être jouée dans l'état de Marée actuel." };
  }

  if (def.requiresControllerReasonAtMost !== undefined && player!.reason > def.requiresControllerReasonAtMost) {
    return { ok: false as const, error: `Cette carte ne peut être jouée qu'avec ${def.requiresControllerReasonAtMost} Raison ou moins.` };
  }
  if (def.requiresControllerReasonExactly !== undefined && player!.reason !== def.requiresControllerReasonExactly) {
    return { ok: false as const, error: `Cette carte ne peut être jouée qu'avec exactement ${def.requiresControllerReasonExactly} Raison.` };
  }

  const costCheck = assertCanPayCost(
    state,
    action.playerId,
    reasonCostAfterShield(state, action.playerId, effectiveCost(def, state, action.playerId), state.turnNumber)
  );
  if (!costCheck.ok) return costCheck;

  if (isPermanentCard(def)) {
    // Slots universels : tout permanent (unité, Structure, Objet, Équipement,
    // Anomalie) occupe un Slot, pas seulement les unités.
    const boardCheck = assertBoardNotFull(state, action.playerId);
    if (!boardCheck.ok) return boardCheck;
  }

  const attachEffect = (def.onPlayEffects ?? []).find((e) => e.type === "attachEquipment");
  const needsTarget = (def.onPlayEffects ?? []).some((e) => e.target.kind === "chosenUnit");

  if (needsTarget) {
    if (attachEffect) {
      // « Équipez une unité Un Dead », « Équipez une Structure » : le texte
      // ORDONNE l'attache. Un Équipement qui ne trouve personne à équiper
      // ne se pose donc pas — il resterait sur le plateau à occuper un Slot
      // sans jamais rien faire. La règle vaut pour tous : chaque texte
      // d'Équipement commence par cet impératif.
      if (!hasAnyValidEquipTarget(def, player!.board)) {
        return { ok: false as const, error: "Aucun permanent de votre plateau ne peut recevoir cet Équipement." };
      }
      if (!action.targetInstanceId) {
        return { ok: false as const, error: "Cet Équipement nécessite une cible." };
      }
      const target = player!.board.find((u) => u.instanceId === action.targetInstanceId);
      if (!target || !canBeEquipTarget(def, player!.board, target)) {
        return { ok: false as const, error: "Cible d'Équipement invalide." };
      }
    } else if (!action.targetInstanceId) {
      return { ok: false as const, error: "Cette carte nécessite une cible." };
    }
  }

  // « À son arrivée, choisissez une unité dans votre Cimetière » : même
  // convention « si possible » que le ciblage d'Équipement — la carte n'est
  // réclamée que s'il en existe une éligible.
  const graveyard = validateGraveyardChoice(state, action.playerId, def.onPlayEffects, action.chosenGraveyardInstanceId);
  if (!graveyard.ok) {
    return {
      ok: false as const,
      error:
        graveyard.reason === "illegal"
          ? "Cette carte du Cimetière n'est pas une cible valide."
          : "Cette carte nécessite de choisir une carte dans le Cimetière.",
    };
  }

  return { ok: true as const };
}

/**
 * Joue une carte de la main : paie le coût en Raison, la retire de la
 * main, la place (plateau pour un permanent, cimetière pour une carte non
 * permanente après résolution — cf. `isPermanentCard`), résout ses
 * `onPlayEffects`, et déclenche les triggers `onCardPlayed`/`onEnterPlay`.
 *
 * Pas de limite au nombre de cartes jouées par tour (Notion "Moteur de
 * partie", "Principes déjà retenus") : un joueur peut jouer autant de
 * cartes qu'il peut en payer pendant sa Phase principale — seule la
 * Raison disponible (et l'espace sur le plateau) le limite.
 */
export function playCard(state: GameState, action: PlayCardAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const instance = player.hand.find((c) => c.instanceId === action.instanceId)!;
  const def = getCardDefinition(instance.cardId);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const handAfterRemoval = player.hand.filter((c) => c.instanceId !== instance.instanceId);
  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? { ...player, hand: handAfterRemoval } : p)) as [
      PlayerState,
      PlayerState
    ],
  };
  const payment = payReasonCost(nextState, player.id, effectiveCost(def, state, player.id), state.turnNumber);
  // La réduction est dépensée en même temps que la Raison, jamais avant :
  // une pose refusée plus haut ne doit pas avoir consommé la charge.
  nextState = consumeCostDiscounts(payment.state, player.id, def);

  events.push({ ...base, type: "PLAY_CARD", playerId: player.id, instanceId: instance.instanceId, cardId: def.id });
  events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -payment.paid });

  const asPermanent = isPermanentCard(def);

  if (isUnitCard(def.type) || asPermanent) {
    const boardUnit = {
      ...instance,
      summoningSick: isUnitCard(def.type),
      hasAttackedThisTurn: false,
      damageMarked: 0,
      modifiers: [],
      turnsRemaining: def.durationTurns,
    };
    const owner = getPlayer(nextState, player.id);
    // Emplacement dans le rang. Le joueur le désigne en lâchant sa carte
    // (`boardIndex`) ; sinon un Équipement se range juste après le
    // permanent qu'il équipe — le trait qui les relie n'a alors plus à
    // traverser tout le plateau — et le reste prend la fin du rang.
    const hostIndex =
      (def.onPlayEffects ?? []).some((e) => e.type === "attachEquipment") && action.targetInstanceId
        ? owner.board.findIndex((u) => u.instanceId === action.targetInstanceId)
        : -1;
    const wanted = action.boardIndex ?? (hostIndex >= 0 ? hostIndex + 1 : owner.board.length);
    const at = Math.max(0, Math.min(Math.trunc(wanted), owner.board.length));
    const board = [...owner.board.slice(0, at), boardUnit, ...owner.board.slice(at)];
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === owner.id ? { ...owner, board } : p)) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "SUMMON", playerId: player.id, instanceId: boardUnit.instanceId, cardId: def.id });
  } else {
    // Équipement consommable (`permanent: false`) : part directement au
    // cimetière après résolution. Aucune autre carte ne prend cette voie —
    // Action et Réaction n'existent plus comme types de carte.
    const owner = getPlayer(nextState, player.id);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === owner.id ? { ...owner, graveyard: [...owner.graveyard, instance] } : p
      ) as [PlayerState, PlayerState],
    };
    // Pas de cause de cimetière ici : un Équipement consommable est
    // "utilisé", pas défaussé/détruit/sabordé au sens de la traçabilité
    // (Notion "Moteur de partie", section "Défausse").
  }

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: isUnitCard(def.type) || asPermanent ? instance.instanceId : undefined,
    chosenTargetInstanceId: action.targetInstanceId,
    chosenGraveyardInstanceId: action.chosenGraveyardInstanceId,
    turnNumber: state.turnNumber,
  };

  const played = resolveEffectSequence(nextState, def.onPlayEffects ?? [], context);
  nextState = played.state;
  events.push(...played.events);
  const playEffectEvents: GameEvent[] = [...played.events];

  // Les corps invoqués par la carte (ex: Fesses en Avant !) arrivent eux
  // aussi en jeu : les capacités qui guettent une arrivée doivent les voir.
  const summonedOnPlay = processSummonEnterTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = summonedOnPlay.state;
  events.push(...summonedOnPlay.events);

  // Marionnettes renvoyées en main par la pose : même raison.
  const recalledOnPlay = processReturnedToHandTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = recalledOnPlay.state;
  events.push(...recalledOnPlay.events);

  // Cartes défaussées par la pose (Lot 13) : « quand cette carte est
  // défaussée » et les observateurs du Cimetière doivent la voir partir.
  const discardedOnPlay = processDiscardedFromHandTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = discardedOnPlay.state;
  events.push(...discardedOnPlay.events);

  // Cartes repêchées au Cimetière par la pose (ex: Tu viens jouer ?).
  const recoveredOnPlay = processGraveyardRecoveryTriggers(nextState, playEffectEvents, state.turnNumber);
  nextState = recoveredOnPlay.state;
  events.push(...recoveredOnPlay.events);

  const cardPlayedTrigger = processTrigger(
    nextState,
    { trigger: "onCardPlayed", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
    state.turnNumber
  );
  nextState = cardPlayedTrigger.state;
  events.push(...cardPlayedTrigger.events);

  // Tout PERMANENT qui arrive déclenche `onEnterPlay` — pas seulement les
  // unités : une Structure ou un Objet d'archétype "arrive en jeu" lui
  // aussi, et les cartes qui guettent l'arrivée d'un membre de leur
  // famille doivent le voir (Lot 10 Cra-Poiscail).
  if (isUnitCard(def.type) || asPermanent) {
    const enterPlayTrigger = processTrigger(
      nextState,
      { trigger: "onEnterPlay", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
      state.turnNumber
    );
    nextState = enterPlayTrigger.state;
    events.push(...enterPlayTrigger.events);
  }

  // « Lorsqu'elle devient visible » : une Structure posée pendant un état où
  // elle est DÉJÀ visible apparaît à cet instant — sans quoi son effet
  // n'existerait qu'au prochain changement de Marée, et poser la carte au
  // bon moment la punirait (Épave Engloutie jouée pendant les Abysses).
  if (def.visibleDuringTide && isVisibleDuringTide(def, nextState.environment.tideState)) {
    events.push({
      ...base,
      type: "STRUCTURE_REVEALED",
      playerId: player.id,
      instanceId: instance.instanceId,
      cardId: def.id,
    });
    const revealedTrigger = processTrigger(
      nextState,
      { trigger: "onBecomeVisible", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
      state.turnNumber
    );
    nextState = revealedTrigger.state;
    events.push(...revealedTrigger.events);
  }

  return { ok: true, state: nextState, events };
}
