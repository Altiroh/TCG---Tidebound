import { canUnitAttack, guardsBlockingAttack, type GameState, type PlayerAction } from "@/game";
import { findElement } from "@/features/match/AttackImpactLayer";
import { showGuard } from "@/features/match/cardFx";
import { GUARD_SHOW_MS } from "@/features/match/effectPresentation";

/**
 * LA GARDE S'INTERPOSE — une attaque visée à côté d'une Garde (le Navire
 * adverse, ou une autre unité) n'est pas envoyée : la table montre la Garde
 * qui la refuse (`showGuard` : la carte se lève, son badge scintille, elle
 * se repose), et l'attaquant reste prêt à viser la Garde. Décision du
 * 12/10/2026 : la Garde se montre pour dire « pas par là », pas quand on
 * l'attaque.
 *
 * Seulement si l'attaque est PAR AILLEURS possible (bonne phase, unité en
 * état d'attaquer) : sinon, ce n'est pas la Garde qui la refuse, et la
 * montrer mentirait. Le moteur reste l'arbitre — c'est lui qui dit qui
 * s'interpose (`guardsBlockingAttack`).
 */

/** Porteurs de Garde qui refusent cette action — vide si ce n'est pas une attaque, ou si la Garde ne s'y oppose pas. */
export function blockingGuardsFor(state: GameState, action: PlayerAction): string[] {
  if (action.type !== "attack") return [];
  if (state.status !== "active" || state.phase !== "combatPhase" || state.pendingReaction || state.pendingChoice) return [];
  if (!canUnitAttack(state, action.playerId, action.attackerInstanceId)) return [];
  return guardsBlockingAttack(state, action.playerId, action.attackerInstanceId, action.defenderInstanceId);
}

/** Dernière fois que les Gardes se sont montrées : un double toucher ne relance pas l'animation en plein milieu. */
let shownAt = -Infinity;

/**
 * `true` si l'action est une attaque que la Garde refuse : les Gardes se
 * montrent, et l'appelant ne l'envoie pas (ni au moteur, ni au serveur).
 */
export function interceptBlockedAttack(state: GameState, action: PlayerAction): boolean {
  const guards = blockingGuardsFor(state, action);
  if (guards.length === 0) return false;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - shownAt >= GUARD_SHOW_MS * 0.8) {
    shownAt = now;
    for (const id of guards) {
      const el = findElement("unit", id);
      if (el) showGuard(el);
    }
  }
  return true;
}
