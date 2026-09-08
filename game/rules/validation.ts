import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { hasKeyword, UNIT_CARD_TYPES } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * Résultat d'une validation : soit "ok", soit un message d'erreur stable
 * (utilisable tel quel côté client pour expliquer pourquoi une action a
 * été refusée). Le serveur ne fait jamais confiance au client : toute
 * action passe par ces vérifications avant d'être appliquée.
 */
export type ValidationResult = { ok: true } | { ok: false; error: string };

export function ok(): ValidationResult {
  return { ok: true };
}

export function fail(error: string): ValidationResult {
  return { ok: false, error };
}

export function assertGameActive(state: GameState): ValidationResult {
  if (state.status !== "active") return fail("La partie est terminée.");
  return ok();
}

export function assertPlayerInGame(state: GameState, playerId: PlayerId): ValidationResult {
  const inGame = state.players.some((p) => p.id === playerId);
  if (!inGame) return fail("Ce joueur ne fait pas partie de cette partie.");
  return ok();
}

export function assertIsActivePlayer(state: GameState, playerId: PlayerId): ValidationResult {
  if (state.activePlayerId !== playerId) return fail("Ce n'est pas le tour de ce joueur.");
  return ok();
}

export function assertCardInHand(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const inHand = player?.hand.some((c) => c.instanceId === instanceId);
  if (!inHand) return fail("Cette carte n'est pas dans la main du joueur.");
  return ok();
}

export function assertCardOnOwnBoard(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const onBoard = player?.board.some((u) => u.instanceId === instanceId);
  if (!onBoard) return fail("Cette carte n'est pas sur le plateau de ce joueur.");
  return ok();
}

export function assertCanPayCost(
  state: GameState,
  playerId: PlayerId,
  cost: number
): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.reason < cost) {
    return fail("Raison insuffisante pour jouer cette carte.");
  }
  return ok();
}

/**
 * Une seule action principale par tour : jouer une carte OU Saborder OU
 * passer (cadrage "Mécaniques verrouillées" sections 28-29/37). Partagé
 * entre `playCard` et `saborder`.
 */
export function assertHasNotUsedMainActionThisTurn(state: GameState, playerId: PlayerId): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  if (player.hasUsedMainActionThisTurn) {
    return fail("Ce joueur a déjà utilisé son action principale ce tour-ci.");
  }
  return ok();
}

export function assertBoardNotFull(state: GameState, playerId: PlayerId): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  const ship = getShipDefinition(player.shipId);
  if (player.board.length >= ship.slotCount) {
    return fail("Le plateau de ce joueur est déjà plein (emplacements limités par le Navire).");
  }
  return ok();
}

export function assertIsObjectCard(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const unit = player?.board.find((u) => u.instanceId === instanceId);
  if (!unit) return fail("Cette carte n'est pas sur le plateau de ce joueur.");
  if (getCardDefinition(unit.cardId).type !== "objet") return fail("Seul un Objet peut être brisé.");
  return ok();
}

export function assertUnitCanAttack(state: GameState, playerId: PlayerId, instanceId: string): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  const unit = player?.board.find((u) => u.instanceId === instanceId);
  if (!unit) return fail("Cette unité n'est pas sur le plateau de ce joueur.");
  if (!(UNIT_CARD_TYPES as readonly string[]).includes(getCardDefinition(unit.cardId).type)) {
    return fail("Seuls les Marins et Créatures peuvent attaquer.");
  }
  if (unit.summoningSick) return fail("Cette unité ne peut pas encore attaquer.");
  if (unit.hasAttackedThisTurn) return fail("Cette unité a déjà attaqué ce tour-ci.");

  if (computeEffectiveStats(unit, state.environment.tideState).inactive) {
    return fail("Cette unité est rendue inactive par la Marée actuelle.");
  }
  return ok();
}

/**
 * Valide la cible de défense. Applique le mot-clé Garde : si l'adversaire
 * contrôle au moins un permanent portant "garde", une attaque visant le
 * Navire (pas de `defenderInstanceId`) doit être redirigée vers un des
 * porteurs de Garde — l'attaque directe est alors refusée, et si une
 * cible est fournie, elle doit elle-même porter Garde.
 *
 * Priorité entre plusieurs porteurs de Garde simultanés : non tranchée
 * par le cadrage ("à préciser") — tout porteur de Garde est accepté ici
 * en attendant une règle de priorité explicite.
 */
export function assertValidDefender(
  state: GameState,
  attackerOwnerId: PlayerId,
  defenderInstanceId?: string
): ValidationResult {
  const opponent = state.players.find((p) => p.id !== attackerOwnerId);
  if (!opponent) return fail("Adversaire introuvable.");

  const guards = opponent.board.filter((u) => hasKeyword(getCardDefinition(u.cardId), "garde"));

  if (!defenderInstanceId) {
    if (guards.length > 0) {
      return fail("Une unité adverse porte Garde : l'attaque doit la cibler en priorité.");
    }
    return ok();
  }

  const target = opponent.board.find((u) => u.instanceId === defenderInstanceId);
  if (!target) return fail("Cible de défense invalide.");

  if (guards.length > 0 && !hasKeyword(getCardDefinition(target.cardId), "garde")) {
    return fail("Une unité adverse porte Garde : l'attaque doit la cibler en priorité.");
  }

  return ok();
}

/** Combine plusieurs validations, retourne la première erreur rencontrée. */
export function combine(...results: ValidationResult[]): ValidationResult {
  for (const result of results) {
    if (!result.ok) return result;
  }
  return ok();
}
