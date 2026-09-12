import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { hasKeyword, UNIT_CARD_TYPES, type CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GamePhase, GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * Un mot-clé statique (`CardDefinition.keywords`) OU accordé dynamiquement
 * (`conditionalKeywords`, réévalué à chaque appel — jamais posé/retiré
 * explicitement) est-il actif sur cette carte EN CE MOMENT, pour SON
 * contrôleur (`controller`, pas un joueur quelconque) ?
 */
function hasEffectiveKeyword(state: GameState, controller: PlayerState, unit: CardInstance, keyword: string): boolean {
  const def = getCardDefinition(unit.cardId);
  const matches = (grant: { keyword: string; controllerReasonAtMost?: number; tideStateIn?: string[] }) => {
    if (grant.keyword !== keyword) return false;
    if (grant.controllerReasonAtMost !== undefined && controller.reason > grant.controllerReasonAtMost) return false;
    if (grant.tideStateIn && !grant.tideStateIn.includes(state.environment.tideState)) return false;
    return true;
  };
  if ((def.conditionalKeywordSuppressions ?? []).some(matches)) return false;
  if (hasKeyword(def, keyword)) return true;
  if ((def.conditionalKeywords ?? []).some(matches)) return true;
  // Équipement attaché transmettant un mot-clé (ex: Chaîne de Fer Noir → Garde).
  return controller.board.some(
    (equip) =>
      equip.attachedToInstanceId === unit.instanceId &&
      (getCardDefinition(equip.cardId).equipGrantsKeywords ?? []).includes(keyword)
  );
}

/** Cette unité attaquante contourne-t-elle Garde EN CE MOMENT (`bypassesGardeTideStateIn`) ? `false` si elle n'existe plus/pas sur le plateau de son contrôleur. */
function attackerBypassesGardeNow(state: GameState, attackerOwnerId: PlayerId, attackerInstanceId: string): boolean {
  const attackerPlayer = state.players.find((p) => p.id === attackerOwnerId);
  const attacker = attackerPlayer?.board.find((u) => u.instanceId === attackerInstanceId);
  if (!attacker) return false;
  const def = getCardDefinition(attacker.cardId);
  return (def.bypassesGardeTideStateIn ?? []).includes(state.environment.tideState);
}

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

/**
 * Structure de tour (README "Structure de tour") : jouer une carte,
 * Saborder ou Briser un Objet sont réservés à la Phase principale ;
 * attaquer est réservé à la Phase de combat, atteinte via `advancePhase`.
 */
export function assertInPhase(state: GameState, playerId: PlayerId, phase: GamePhase): ValidationResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Joueur introuvable.");
  if (state.phase !== phase) {
    const label = phase === "mainPhase" ? "la Phase principale" : "la Phase de combat";
    return fail(`Cette action n'est possible que pendant ${label}.`);
  }
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
 *
 * `attackerInstanceId` sert uniquement à vérifier un contournement de
 * Garde propre à l'ATTAQUANT (`bypassesGardeTideStateIn`, ex: Raie des
 * Fosses pendant Abysses) — jamais utilisé pour autre chose ici.
 */
export function assertValidDefender(
  state: GameState,
  attackerOwnerId: PlayerId,
  attackerInstanceId: string,
  defenderInstanceId?: string
): ValidationResult {
  const opponent = state.players.find((p) => p.id !== attackerOwnerId);
  if (!opponent) return fail("Adversaire introuvable.");

  const guards = opponent.board.filter((u) => hasEffectiveKeyword(state, opponent, u, "garde"));
  const attackerBypassesGarde = attackerBypassesGardeNow(state, attackerOwnerId, attackerInstanceId);

  if (!defenderInstanceId) {
    if (guards.length > 0 && !attackerBypassesGarde) {
      return fail("Une unité adverse porte Garde : l'attaque doit la cibler en priorité.");
    }
    return ok();
  }

  const target = opponent.board.find((u) => u.instanceId === defenderInstanceId);
  if (!target) return fail("Cible de défense invalide.");

  if (guards.length > 0 && !hasEffectiveKeyword(state, opponent, target, "garde")) {
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
