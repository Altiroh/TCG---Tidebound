import { canUnitAttack } from "@/game/rules/validation";
import { shipAbilityView } from "@/game/state/shipAbility";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * La Phase de combat servirait-elle à quelque chose, ce tour-ci ? Au moins
 * une unité peut attaquer (Pied marin compris, Marée comprise), ou le
 * Navire peut tirer en combat (Canon de proue). Au tout premier tour de la
 * partie, jamais : le premier joueur n'attaque pas.
 *
 * Quand rien ne peut se battre, la Fin de tour s'ouvre dès la Phase
 * principale 1 et le bouton de combat s'éteint (décision du 08/10/2026) :
 * passer par un combat vide n'était qu'un clic de plus.
 */
export function hasCombatToPlay(state: GameState, playerId: PlayerId): boolean {
  if (state.turnNumber === 1) return false;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  if (player.board.some((unit) => canUnitAttack(state, playerId, unit.instanceId))) return true;
  return shipAbilityView({ ...state, phase: "combatPhase" }, playerId)?.canFire ?? false;
}
