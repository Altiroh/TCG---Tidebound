import { isTextIgnored } from "@/game/cards/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { GameEvent } from "@/game/events/types";
import { isVisibleDuringTide, type CardDefinition, type CardInstance, type CardType } from "@/game/cards/types";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import { reasonAfterLoss } from "@/game/state/reason";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";
import { recordGraveyardArrival } from "@/game/state/discard";

/**
 * Boucliers "la première fois PAR TOUR que..." (cf. `CardInstance.oncePerTurnFlags`).
 * Centralise la recherche/consommation d'un bouclier disponible sur le
 * plateau d'un joueur, réutilisée par chaque mécanisme concret ci-dessous
 * (perte de Raison, dégâts au Navire, dégâts à une unité...) plutôt que de
 * dupliquer la même boucle "trouve la première carte éligible, marque-la
 * utilisée" à chaque nouvel effet de ce type.
 */
function findAvailableShield<T>(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number,
  key: string,
  getSpec: (def: CardDefinition) => T | undefined
): { unit: CardInstance; spec: T } | undefined {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return undefined;
  for (const unit of player.board) {
    const def = getCardDefinition(unit.cardId);
    const spec = getSpec(def);
    if (spec === undefined) continue;
    // Une carte MASQUÉE par la Marée est inactive, boucliers compris
    // (21/09/2026). Le verrou posé sur les `abilities` ne couvrait pas ces
    // boucliers-là, qui sont des champs de données : Cage de Flottaison et
    // Brise-Vague de Fortune protégeaient donc leur Navire alors qu'elles
    // étaient invisibles, ce que leur texte ne promet nulle part.
    if (!isVisibleDuringTide(def, state.environment.tideState)) continue;
    // « Son texte est ignoré » (Lot 17) : son bouclier aussi.
    if (isTextIgnored(unit)) continue;
    if (!oncePerTurnAvailable(unit, key, turnNumber)) continue;
    return { unit, spec };
  }
  return undefined;
}

function consumeShield(
  state: GameState,
  playerId: PlayerId,
  unit: CardInstance,
  key: string,
  turnNumber: number,
  /** `true` : le bouclier ne se réarme JAMAIS (« la première fois que… », Brise-Vague de Fortune). */
  onceEver = false
): GameState {
  const player = getPlayer(state, playerId);
  const board = player.board.map((u) => (u.instanceId === unit.instanceId ? markOncePerTurnUsed(u, key, turnNumber, onceEver) : u));
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...player, board } : p)) as [PlayerState, PlayerState],
  };
}

function findReasonLossShield(state: GameState, playerId: PlayerId, turnNumber: number) {
  return findAvailableShield(state, playerId, turnNumber, "reasonLossShield", (def) => {
    const shield = def.reduceOwnReasonLossOncePerTurn;
    if (!shield) return undefined;
    if (shield.tideStateIn && !shield.tideStateIn.includes(state.environment.tideState)) return undefined;
    return shield;
  });
}

/** Réduction de perte de Raison disponible (Vieux Loup de Mer, Seconde au Visage Pâle) — 0 si aucun bouclier éligible. */
export function consumeReasonLossShield(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number
): { state: GameState; reduction: number } {
  const match = findReasonLossShield(state, playerId, turnNumber);
  if (!match) return { state, reduction: 0 };
  return { state: consumeShield(state, playerId, match.unit, "reasonLossShield", turnNumber), reduction: match.spec.amount };
}

/**
 * Coût en Raison réellement dû une fois le bouclier de perte de Raison
 * appliqué, SANS le consommer — pour les validations "peut-il payer ?".
 * Payer un coût est une perte de Raison comme une autre ("toute source
 * confondue") : avec Vieux Loup de Mer en jeu, une carte à 3 se pose avec 2.
 */
export function reasonCostAfterShield(state: GameState, playerId: PlayerId, cost: number, turnNumber: number): number {
  if (cost <= 0) return cost;
  const match = findReasonLossShield(state, playerId, turnNumber);
  return Math.max(0, cost - (match?.spec.amount ?? 0));
}

/**
 * PERTE DE RAISON subie par `playerId`, quelle qu'en soit la source : le
 * SEUL chemin par lequel le moteur retire de la Raison. Il consomme d'abord
 * le bouclier « la première fois à chaque tour que vous perdez de la
 * Raison, réduisez cette perte de 1 » (Vieux Loup de Mer, Seconde au Visage
 * Pâle) — que le texte applique « toute source confondue » : effet, coût,
 * Marée, attaque adverse, Équipement, choc d'entrée des Abysses.
 *
 * Plusieurs sites appelaient `reasonAfterLoss` en direct et contournaient
 * ainsi le bouclier (perte infligée par une attaque, perte après une
 * attaque, Équipement à la mort de son porteur, entrée en Abysses). Une
 * perte nulle ne consomme rien. `lost` : ce qui a réellement été perdu.
 */
export function loseReason(
  state: GameState,
  playerId: PlayerId,
  amount: number,
  turnNumber: number
): { state: GameState; lost: number } {
  if (amount <= 0) return { state, lost: 0 };
  const shield = consumeReasonLossShield(state, playerId, turnNumber);
  const lost = Math.max(0, amount - shield.reduction);
  const player = getPlayer(shield.state, playerId);
  return {
    state: {
      ...shield.state,
      players: shield.state.players.map((p) =>
        p.id === playerId ? { ...player, reason: reasonAfterLoss(player, lost) } : p
      ) as [PlayerState, PlayerState],
    },
    lost,
  };
}

/**
 * Paie un coût en Raison en consommant le bouclier de perte de Raison s'il
 * est disponible. Un coût nul ne consomme rien (le bouclier reste pour une
 * vraie perte plus tard dans le tour).
 */
export function payReasonCost(
  state: GameState,
  playerId: PlayerId,
  cost: number,
  turnNumber: number
): { state: GameState; paid: number } {
  const loss = loseReason(state, playerId, cost, turnNumber);
  return { state: loss.state, paid: loss.lost };
}

/** Réduction de dégâts de Marée au Navire disponible (Brise-Vague de Fortune, Tempête uniquement) — 0 si aucun bouclier éligible. */
export function consumeTideShipDamageShield(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number
): { state: GameState; reduction: number } {
  const match = findAvailableShield(state, playerId, turnNumber, "tideShipDamageShield", (def) => {
    const shield = def.reduceTideShipDamageOncePerTurn;
    if (!shield) return undefined;
    if (!shield.tideStateIn.includes(state.environment.tideState)) return undefined;
    return shield;
  });
  if (!match) return { state, reduction: 0 };
  return {
    state: consumeShield(state, playerId, match.unit, "tideShipDamageShield", turnNumber, match.spec.onceEver),
    reduction: match.spec.amount,
  };
}

/** Réduction de dégâts DIRECTS (attaque d'unité contre le Navire) disponible (Cage de Flottaison) — 0 si aucun bouclier éligible. */
export function consumeDirectShipDamageShield(
  state: GameState,
  playerId: PlayerId,
  turnNumber: number,
  /**
   * Type de la carte qui attaque, quand une carte attaque. ABSENT pour un
   * TIR DE NAVIRE (21/09/2026) : le Navire n'est pas une carte, et un
   * bouclier restreint à certains types ne peut donc pas le reconnaître —
   * il ne s'applique alors pas, faute de pouvoir vérifier sa condition.
   */
  attackerCardType?: CardType
): { state: GameState; reduction: number } {
  const match = findAvailableShield(state, playerId, turnNumber, "directShipDamageShield", (def) => {
    const shield = def.reduceDirectShipDamageOncePerTurn;
    if (!shield) return undefined;
    if (shield.attackerCardTypes) {
      // Restreint à certains types : un tir de Navire, qui n'a pas de carte
      // attaquante, ne peut pas satisfaire la condition.
      if (attackerCardType === undefined) return undefined;
      if (!shield.attackerCardTypes.includes(attackerCardType)) return undefined;
    }
    return shield;
  });
  if (!match) return { state, reduction: 0 };
  return {
    state: consumeShield(state, playerId, match.unit, "directShipDamageShield", turnNumber),
    reduction: match.spec.amount,
  };
}

/**
 * « La première fois à chaque tour qu'une Structure que vous contrôlez PERD
 * de la Résistance, RENDEZ-LUI 1 Résistance » (Wood Vy) : appelée APRÈS que
 * la perte a été marquée (et son `DAMAGE` émis) — la Structure perd bien la
 * Résistance, puis la récupère. Ce n'est pas une prévention : les
 * déclencheurs « subit des dégâts » voient le coup.
 *
 * Partagée par les trois sources de perte : dégâts d'effet, de combat et de
 * Marée. Sans effet si `unitInstanceId` n'est pas une Structure de `ownerId`,
 * si rien n'a été perdu, ou si aucun bouclier n'est disponible ce tour.
 */
export function restoreStructureResistanceAfterLoss(
  state: GameState,
  ownerId: PlayerId,
  unitInstanceId: string,
  lost: number,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  if (lost <= 0) return { state, events: [] };
  const owner = getPlayer(state, ownerId);
  const unit = owner.board.find((u) => u.instanceId === unitInstanceId);
  if (!unit || getCardDefinition(unit.cardId).type !== "structure") return { state, events: [] };
  const shield = consumeStructureResistanceRestoreShield(state, ownerId, turnNumber);
  if (shield.restore <= 0) return { state, events: [] };
  const rendu = Math.min(shield.restore, unit.damageMarked);
  if (rendu <= 0) return { state: shield.state, events: [] };
  const next: GameState = {
    ...shield.state,
    players: shield.state.players.map((p) =>
      p.id === ownerId
        ? { ...p, board: p.board.map((u) => (u.instanceId === unitInstanceId ? { ...u, damageMarked: u.damageMarked - rendu } : u)) }
        : p
    ) as [PlayerState, PlayerState],
  };
  return { state: next, events: [{ type: "HEAL", turnNumber, timestamp: Date.now(), targetInstanceId: unitInstanceId, amount: rendu }] };
}

/** Restauration "1ère fois par tour" de Résistance perdue par une Structure alliée (Wood Vy) — 0 si aucune carte éligible sur le plateau de `ownerId`. Préférer `restoreStructureResistanceAfterLoss`. */
export function consumeStructureResistanceRestoreShield(
  state: GameState,
  ownerId: PlayerId,
  turnNumber: number
): { state: GameState; restore: number } {
  const match = findAvailableShield(state, ownerId, turnNumber, "structureResistanceRestoreShield", (def) => def.restoreResistanceOnAllyStructureLossOncePerTurn);
  if (!match) return { state, restore: 0 };
  return {
    state: consumeShield(state, ownerId, match.unit, "structureResistanceRestoreShield", turnNumber),
    restore: match.spec!,
  };
}

/**
 * Bouclier à usage UNIQUE contre les dégâts d'EFFET (Casque-Coquille) :
 * l'Équipement porté par `unitInstanceId` absorbe `amount` dégâts, puis
 * se détruit. Contrairement aux boucliers ci-dessus, il n'est pas
 * "1ère fois par tour" — sa consommation EST son départ du plateau, donc
 * il ne peut pas se redéclencher.
 *
 * N'intercepte que les dégâts d'effet — Marée et texte de carte — jamais
 * le combat (arbitrage du 2026-09-14). Les appelants sont donc les seuls
 * juges : ce sont eux qui savent d'où vient le dégât.
 *
 * Le bonus que l'Équipement accordait au porteur (ici +1 Résistance) est
 * une aura (`equipGrantsBuff`, relue en direct par `stats.ts`) : il
 * disparaît avec la destruction de l'Équipement, comme pour tout
 * Équipement qui quitte le plateau.
 */
export function consumeEquippedEffectDamageShield(
  state: GameState,
  ownerId: PlayerId,
  unitInstanceId: string,
  turnNumber: number
): { state: GameState; reduction: number; events: GameEvent[] } {
  const player = state.players.find((p) => p.id === ownerId);
  if (!player) return { state, reduction: 0, events: [] };

  const equipment = player.board.find(
    (u) =>
      u.attachedToInstanceId === unitInstanceId &&
      getCardDefinition(u.cardId).reduceEquippedEffectDamageThenDestroy !== undefined
  );
  if (!equipment) return { state, reduction: 0, events: [] };

  const reduction = getCardDefinition(equipment.cardId).reduceEquippedEffectDamageThenDestroy!;
  const updated: PlayerState = recordGraveyardArrival(
    {
      ...player,
      board: player.board.filter((u) => u.instanceId !== equipment.instanceId),
      graveyard: [
        ...player.graveyard,
        { ...equipment, damageMarked: 0, modifiers: [], graveyardCause: "destroyed" as const, destructionCause: "effect" as const },
      ],
    },
    { cardId: equipment.cardId, turnNumber, fromZone: "board", destructionCause: "effect" }
  );

  return {
    state: {
      ...state,
      players: state.players.map((p) => (p.id === ownerId ? updated : p)) as [PlayerState, PlayerState],
    },
    reduction,
    // Même convention que la substitution de destruction (Plaque de
    // Fortune) : un `DESTROY` de raison "effect", sans `onDeath` — la
    // carte est consommée par son propre texte, elle ne "meurt" pas.
    events: [{ type: "DESTROY", instanceId: equipment.instanceId, reason: "effect", turnNumber, timestamp: Date.now() }],
  };
}

/** Clé `oncePerTurnFlags` du remplacement de Bête de Halage (`opponentRemovalShieldOncePerTurn`). */
export const OPPONENT_REMOVAL_SHIELD_KEY = "opponentRemovalShield";

/**
 * Bête de Halage : « la première fois à chaque tour qu'elle devrait être
 * renvoyée en main, déplacée ou détruite par un effet adverse, … lui retirer
 * 1 Résistance à la place ». Pose le malus permanent et marque l'usage du
 * tour ; retourne `undefined` si la carte n'a pas ce remplacement (ou l'a
 * déjà utilisé ce tour). Partagé par la résolution d'effets (destruction,
 * renvoi en main) et par la passe de morts (dégâts d'un effet adverse,
 * destruction posée hors d'un effet `destroy`).
 */
export function applyOpponentRemovalShield(
  state: GameState,
  ownerId: PlayerId,
  instanceId: string,
  turnNumber: number
): { state: GameState; events: GameEvent[] } | undefined {
  const owner = getPlayer(state, ownerId);
  const unit = owner.board.find((u) => u.instanceId === instanceId);
  if (!unit) return undefined;
  const shield = getCardDefinition(unit.cardId).opponentRemovalShieldOncePerTurn;
  if (!shield || !oncePerTurnAvailable(unit, OPPONENT_REMOVAL_SHIELD_KEY, turnNumber)) return undefined;
  const malus = {
    id: `mod_${Math.random().toString(36).slice(2, 8)}`,
    source: unit.cardId,
    attack: 0,
    health: -shield.healthLoss,
    duration: "permanent" as const,
  };
  const remplacee = markOncePerTurnUsed({ ...unit, modifiers: [...unit.modifiers, malus] }, OPPONENT_REMOVAL_SHIELD_KEY, turnNumber);
  return {
    state: {
      ...state,
      players: state.players.map((p) =>
        p.id === ownerId ? { ...p, board: p.board.map((u) => (u.instanceId === instanceId ? remplacee : u)) } : p
      ) as [PlayerState, PlayerState],
    },
    events: [
      { turnNumber, timestamp: Date.now(), type: "DEBUFF_APPLIED", targetInstanceId: instanceId, attack: 0, health: -shield.healthLoss },
    ],
  };
}
