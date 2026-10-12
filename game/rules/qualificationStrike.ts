import type { QualificationId } from "@/game/cards/qualifications";
import { getCardDefinition } from "@/game/cards/sets/core";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { hasResistance, type CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameEvent } from "@/game/events/types";
import { boardSlotLayout } from "@/game/rules/boardSlots";
import { boardCapacity } from "@/game/rules/slotEffects";
import { hasQualification, unitQualificationValue } from "@/game/rules/qualificationCombat";
import { damageShip } from "@/game/state/armor";
import { loseReason } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";

/**
 * EFFETS DU COUP portés par les qualifications — appliqués par
 * `game/actions/attack.ts` une fois les dégâts ordinaires du combat marqués,
 * sans dupliquer le système de dégâts : chaque effet passe par les mêmes
 * primitives que le reste du moteur (`damageShip` pour le Navire et son
 * Armure, `loseReason` et son bouclier, un modificateur pour une perte de
 * Puissance) et émet les événements habituels (`DAMAGE`, `HEAL`,
 * `REASON_CHANGED`, `DEBUFF_APPLIED`).
 *
 * « Détruit » se lit AU COUP (règle provisoire, `qualifications.ts`) : les
 * dégâts marqués atteignent la Résistance effective. La destruction
 * elle-même reste l'affaire de `processDeaths`, qui passe après.
 */

interface Ctx {
  state: GameState;
  events: GameEvent[];
  base: { turnNumber: number; timestamp: number };
}

/** Signale qu'une qualification a joué (`QUALIFICATION_TRIGGERED`) — la mise en scène y montre son glyphe. */
function triggered(
  ctx: Ctx,
  qualification: QualificationId,
  holder: CardInstance,
  fields: { targetInstanceId?: string; targetPlayerId?: PlayerId; amount?: number } = {}
): void {
  ctx.events.push({ ...ctx.base, type: "QUALIFICATION_TRIGGERED", qualification, sourceInstanceId: holder.instanceId, ...fields });
}

function findOn(state: GameState, ownerId: PlayerId, instanceId: string): CardInstance | undefined {
  return getPlayer(state, ownerId).board.find((u) => u.instanceId === instanceId);
}

/** Résistance qui reste à une unité en jeu (effective, dégâts marqués déduits). */
export function remainingResistance(state: GameState, ownerId: PlayerId, unit: CardInstance): number {
  const stats = computeEffectiveStats(unit, state.environment.tideState, auraContextOf(state, ownerId));
  return stats.health - unit.damageMarked;
}

function mapUnit(state: GameState, ownerId: PlayerId, instanceId: string, update: (u: CardInstance) => CardInstance): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === ownerId ? { ...p, board: p.board.map((u) => (u.instanceId === instanceId ? update(u) : u)) } : p
    ) as [PlayerState, PlayerState],
  };
}

/** Sangsue : le Navire du porteur récupère autant d'Ancrage, plafonné à son Ancrage de départ. */
function leech(ctx: Ctx, holder: CardInstance, holderOwnerId: PlayerId, dealt: number): void {
  if (dealt <= 0 || !hasQualification(holder, "sangsue", ctx.state)) return;
  const player = getPlayer(ctx.state, holderOwnerId);
  const cap = getShipDefinition(player.shipId).startingAnchor;
  const healed = Math.max(0, Math.min(dealt, cap - player.anchor));
  if (healed <= 0) return;
  ctx.state = {
    ...ctx.state,
    players: ctx.state.players.map((p) => (p.id === holderOwnerId ? { ...p, anchor: p.anchor + healed } : p)) as [PlayerState, PlayerState],
  };
  ctx.events.push({ ...ctx.base, type: "HEAL", targetPlayerId: holderOwnerId, amount: healed });
  triggered(ctx, "sangsue", holder, { targetPlayerId: holderOwnerId, amount: healed });
}

/** Entaille X : la cible blessée perd X Puissance (permanent — provisoire). */
function gash(ctx: Ctx, holder: CardInstance, target: CardInstance, targetOwnerId: PlayerId): void {
  const current = findOn(ctx.state, targetOwnerId, target.instanceId);
  if (!current) return;
  // Jamais sous 0 : Entaille retire au plus la Puissance qui reste (le moteur, lui, ne borne pas une Puissance).
  const power = computeEffectiveStats(current, ctx.state.environment.tideState, auraContextOf(ctx.state, targetOwnerId)).attack;
  const amount = Math.min(unitQualificationValue(holder, "entaille", ctx.state), Math.max(0, power));
  if (amount <= 0) return;
  ctx.state = mapUnit(ctx.state, targetOwnerId, target.instanceId, (u) => ({
    ...u,
    modifiers: [
      ...u.modifiers,
      { id: `entaille_${holder.instanceId}_${ctx.base.turnNumber}_${u.modifiers.length}`, source: holder.cardId, attack: -amount, health: 0, duration: "permanent" },
    ],
  }));
  ctx.events.push({ ...ctx.base, type: "DEBUFF_APPLIED", targetInstanceId: target.instanceId, attack: -amount, health: 0 });
  triggered(ctx, "entaille", holder, { targetInstanceId: target.instanceId, amount });
}

/** Ponction X : le Navire adverse touché perd aussi X Raison (bouclier de perte de Raison compris). */
function drain(ctx: Ctx, holder: CardInstance, victimId: PlayerId, shipDamage: number): void {
  const amount = unitQualificationValue(holder, "ponction", ctx.state);
  if (amount <= 0 || shipDamage <= 0) return;
  const perte = loseReason(ctx.state, victimId, amount, ctx.base.turnNumber);
  ctx.state = perte.state;
  if (perte.lost > 0) {
    ctx.events.push({ ...ctx.base, type: "REASON_CHANGED", playerId: victimId, delta: -perte.lost });
    triggered(ctx, "ponction", holder, { targetPlayerId: victimId, amount: perte.lost });
  }
}

/** Des dégâts de combat portés par le porteur à une unité, hors du coup principal (Éclaboussure). Retourne le montant marqué. */
function hitUnit(ctx: Ctx, holder: CardInstance, ownerId: PlayerId, target: CardInstance, amount: number): number {
  if (amount <= 0) return 0;
  ctx.state = mapUnit(ctx.state, ownerId, target.instanceId, (u) => ({
    ...u,
    damageMarked: u.damageMarked + amount,
    lastDamageCause: "combat" as const,
    lastDamageBy: undefined,
    lastDamageTurn: ctx.base.turnNumber,
  }));
  ctx.events.push({ ...ctx.base, type: "DAMAGE", targetInstanceId: target.instanceId, amount, cause: "combat", dealerInstanceId: holder.instanceId });
  return amount;
}

/** Des dégâts portés au Navire de `victimId` par le porteur (excédent de Brèche) : Armure d'abord. */
function hitShip(ctx: Ctx, holder: CardInstance, victimId: PlayerId, amount: number): number {
  if (amount <= 0) return 0;
  ctx.state = {
    ...ctx.state,
    players: ctx.state.players.map((p) => {
      if (p.id !== victimId) return p;
      const coup = damageShip(p, amount, ctx.base.turnNumber);
      ctx.events.push(...coup.events);
      return coup.player;
    }) as [PlayerState, PlayerState],
  };
  ctx.events.push({
    ...ctx.base,
    type: "DAMAGE",
    targetPlayerId: victimId,
    amount,
    targetAnchorAfter: getPlayer(ctx.state, victimId).anchor,
    cause: "combat",
    dealerInstanceId: holder.instanceId,
  });
  return amount;
}

export interface StrikeOnUnit {
  attackerOwnerId: PlayerId;
  attacker: CardInstance;
  defenderOwnerId: PlayerId;
  defender: CardInstance;
  /** Dégâts du coup réellement marqués sur la cible. */
  strikeApplied: number;
  /** Résistance qui restait à la cible JUSTE AVANT le coup. */
  remainingBefore: number;
}

/**
 * Le coup d'une attaque contre une unité vient d'être marqué : Coup de
 * grâce, Entaille, Brèche, Carnage, Éclaboussure, Sangsue, Ponction — dans
 * cet ordre, sur l'état d'après le coup.
 */
export function applyStrikeQualifications(state: GameState, strike: StrikeOnUnit, base: Ctx["base"]): { state: GameState; events: GameEvent[] } {
  const ctx: Ctx = { state, events: [], base };
  const { attacker, attackerOwnerId, defender, defenderOwnerId, strikeApplied, remainingBefore } = strike;
  let dealt = strikeApplied;

  if (strikeApplied > 0) {
    // Coup de grâce : au moins 1 dégât réellement infligé détruit la cible.
    if (hasQualification(attacker, "coup-de-grace", ctx.state)) {
      const target = findOn(ctx.state, defenderOwnerId, defender.instanceId);
      if (target) {
        const left = remainingResistance(ctx.state, defenderOwnerId, target);
        if (left > 0) {
          ctx.state = mapUnit(ctx.state, defenderOwnerId, defender.instanceId, (u) => ({ ...u, damageMarked: u.damageMarked + left }));
          triggered(ctx, "coup-de-grace", attacker, { targetInstanceId: defender.instanceId });
        }
      }
    }
    gash(ctx, attacker, defender, defenderOwnerId);
  }

  // Détruite au coup : le coup suffisait, ou Coup de grâce l'achève (sans excédent pour Brèche).
  const lethal = strikeApplied > 0 && (strikeApplied >= remainingBefore || hasQualification(attacker, "coup-de-grace", ctx.state));
  if (lethal) {
    // Brèche : l'excédent, au-delà de ce qu'il fallait pour détruire, file au Navire adverse.
    const overflow = strikeApplied - Math.max(0, remainingBefore);
    if (overflow > 0 && hasQualification(attacker, "breche", ctx.state)) {
      triggered(ctx, "breche", attacker, { targetPlayerId: defenderOwnerId, amount: overflow });
      const onShip = hitShip(ctx, attacker, defenderOwnerId, overflow);
      // L'excédent n'est compté qu'une fois : il quitte la cible pour le Navire (Sangsue).
      dealt += onShip - overflow;
      drain(ctx, attacker, defenderOwnerId, onShip);
    }
    // Carnage : une cible détruite, une attaque de plus ce tour.
    if (hasQualification(attacker, "carnage", ctx.state)) {
      ctx.state = mapUnit(ctx.state, attackerOwnerId, attacker.instanceId, (u) => ({ ...u, bonusAttacksThisTurn: (u.bonusAttacksThisTurn ?? 0) + 1 }));
      triggered(ctx, "carnage", attacker, { targetInstanceId: defender.instanceId });
    }
  }

  // Éclaboussure X : les voisins d'emplacement de la cible, sur son rang.
  const splash = unitQualificationValue(attacker, "eclaboussure", ctx.state);
  if (splash > 0) {
    const owner = getPlayer(ctx.state, defenderOwnerId);
    const layout = boardSlotLayout(owner.board, boardCapacity(ctx.state, owner));
    const at = layout.findIndex((u) => u?.instanceId === defender.instanceId);
    if (at >= 0) {
      for (const neighbour of [layout[at - 1], layout[at + 1]]) {
        if (!neighbour || !hasResistance(getCardDefinition(neighbour.cardId))) continue;
        triggered(ctx, "eclaboussure", attacker, { targetInstanceId: neighbour.instanceId, amount: splash });
        const marked = hitUnit(ctx, attacker, defenderOwnerId, neighbour, splash);
        dealt += marked;
        if (marked > 0) gash(ctx, attacker, neighbour, defenderOwnerId);
      }
    }
  }

  leech(ctx, attacker, attackerOwnerId, dealt);
  return { state: ctx.state, events: ctx.events };
}

/** La riposte d'un défenseur vient d'être marquée sur l'attaquant : Entaille et Sangsue du DÉFENSEUR. */
export function applyRetaliationQualifications(
  state: GameState,
  retaliation: { defenderOwnerId: PlayerId; defender: CardInstance; attackerOwnerId: PlayerId; attacker: CardInstance; applied: number },
  base: Ctx["base"]
): { state: GameState; events: GameEvent[] } {
  const ctx: Ctx = { state, events: [], base };
  if (retaliation.applied > 0) {
    gash(ctx, retaliation.defender, retaliation.attacker, retaliation.attackerOwnerId);
    leech(ctx, retaliation.defender, retaliation.defenderOwnerId, retaliation.applied);
  }
  return { state: ctx.state, events: ctx.events };
}

/** Une attaque directe vient de toucher le Navire adverse : Sangsue et Ponction de l'attaquant. */
export function applyDirectHitQualifications(
  state: GameState,
  hit: { attackerOwnerId: PlayerId; attacker: CardInstance; victimId: PlayerId; damage: number },
  base: Ctx["base"]
): { state: GameState; events: GameEvent[] } {
  const ctx: Ctx = { state, events: [], base };
  if (hit.damage > 0) {
    leech(ctx, hit.attacker, hit.attackerOwnerId, hit.damage);
    drain(ctx, hit.attacker, hit.victimId, hit.damage);
  }
  return { state: ctx.state, events: ctx.events };
}
