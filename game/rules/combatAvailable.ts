import { canUnitAttack } from "@/game/rules/validation";
import { shipAbilityView } from "@/game/state/shipAbility";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * La Phase de combat servirait-elle à quelque chose, ce tour-ci ? Au moins
 * une unité peut attaquer (Pied marin compris, Marée comprise), ou le
 * Navire peut tirer en combat (Canon de proue). Au tout premier tour de la
 * partie, seules les unités avec Pied marin attaquent (13/10/2026) : le
 * Navire ne tire pas encore.
 *
 * Quand rien ne peut se battre, la Fin de tour s'ouvre dès la Phase
 * principale 1 et le bouton de combat s'éteint (décision du 08/10/2026) :
 * passer par un combat vide n'était qu'un clic de plus.
 */
export function hasCombatToPlay(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  if (player.board.some((unit) => canUnitAttack(state, playerId, unit.instanceId))) return true;
  if (state.turnNumber === 1) return false;
  return shipAbilityView({ ...state, phase: "combatPhase" }, playerId)?.canFire ?? false;
}
