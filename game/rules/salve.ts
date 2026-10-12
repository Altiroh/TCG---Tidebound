import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import type { AttackAction } from "@/game/actions/types";
import { hasQualification } from "@/game/rules/qualificationCombat";
import { assertValidDefender } from "@/game/rules/validation";
import { getPlayer, type GameState, type PlayerId } from "@/game/state/types";

/**
 * SALVE — règle validée le 12/10/2026 : « le joueur répartit la Puissance
 * de l'unité entre plusieurs cibles légales (au moins 1 par cible) après
 * avoir déclaré l'attaque ; une riposte par cible touchée ; la Garde
 * s'applique à chaque cible. »
 *
 * La répartition voyage DANS l'action d'attaque (`AttackAction.salve`) :
 * l'interface la fait choisir au joueur avant d'envoyer le coup, le moteur
 * la vérifie ici et la résout dans `game/actions/attack.ts`. Les cibles
 * sont des unités (permanents dotés de Résistance) : la Salve ne vise pas
 * le Navire.
 */

/** Puissance que la Salve peut répartir : celle de l'attaquant, en ce moment. */
export function salvePower(state: GameState, playerId: PlayerId, attackerInstanceId: string): number {
  const unit = getPlayer(state, playerId).board.find((u) => u.instanceId === attackerInstanceId);
  if (!unit) return 0;
  return Math.max(0, computeEffectiveStats(unit, state.environment.tideState, auraContextOf(state, playerId)).attack);
}

/**
 * Autres cibles possibles d'une Salve qui frappe `mainDefenderId` : les
 * unités adverses attaquables pour elles-mêmes (Garde comprise), sauf la
 * cible déclarée. Vide si l'attaquant n'a pas Salve.
 */
export function salveTargets(state: GameState, playerId: PlayerId, attackerInstanceId: string, mainDefenderId: string): string[] {
  const attacker = getPlayer(state, playerId).board.find((u) => u.instanceId === attackerInstanceId);
  if (!attacker || !hasQualification(attacker, "salve", state)) return [];
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) return [];
  return opponent.board
    .filter((u) => u.instanceId !== mainDefenderId && assertValidDefender(state, playerId, attackerInstanceId, u.instanceId).ok)
    .map((u) => u.instanceId);
}

/** La répartition demandée est-elle permise ? `null` si oui, sinon le motif du refus. */
export function salveError(state: GameState, action: AttackAction): string | null {
  const shares = action.salve ?? [];
  if (shares.length === 0) return null;
  const attacker = getPlayer(state, action.playerId).board.find((u) => u.instanceId === action.attackerInstanceId);
  if (!attacker || !hasQualification(attacker, "salve", state)) return "Seule une unité avec Salve répartit ses dégâts.";
  if (!action.defenderInstanceId) return "Salve : la répartition part d'une attaque contre une unité, pas contre le Navire.";
  const legal = new Set(salveTargets(state, action.playerId, action.attackerInstanceId, action.defenderInstanceId));
  const seen = new Set<string>();
  let total = 0;
  for (const share of shares) {
    if (!Number.isInteger(share.amount) || share.amount < 1) return "Salve : au moins 1 dégât par cible.";
    if (seen.has(share.targetInstanceId)) return "Salve : chaque cible ne compte qu'une fois.";
    seen.add(share.targetInstanceId);
    if (!legal.has(share.targetInstanceId)) return "Salve : cette cible ne peut pas être attaquée (Garde, Résistance, ou introuvable).";
    total += share.amount;
  }
  if (total > salvePower(state, action.playerId, action.attackerInstanceId) - 1) {
    return "Salve : la cible déclarée garde au moins 1 dégât — répartition trop grande.";
  }
  return null;
}
