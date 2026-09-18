import { getShipDefinition } from "@/game/environment/shipData";
import { phaseRefusal } from "@/game/rules/phaseLabels";
import type { ShipActivatableAbility } from "@/game/environment/types";
import type { GamePhase, GameState, PlayerId, PlayerState } from "@/game/state/types";
import { getPlayer } from "@/game/state/types";

/**
 * Lecture de la capacité activable du Navire d'un joueur, et de son état
 * courant. Un seul endroit décide "est-ce activable maintenant" : le
 * moteur l'utilise pour valider, l'interface pour allumer (ou non) le
 * bouton — une cible que l'UI ne propose pas est une cible que le moteur
 * refuse, et réciproquement.
 */

/** La capacité activable du Navire de ce joueur, si son Navire en porte une de câblée. */
export function shipAbilityOf(player: PlayerState): ShipActivatableAbility | undefined {
  return getShipDefinition(player.shipId).activatableAbility;
}

/** Nombre d'activations autorisées par tour (défaut 1). */
export function activationsPerTurn(ability: ShipActivatableAbility): number {
  return ability.activationsPerTurn ?? 1;
}

/** Activations déjà consommées CE tour-ci (un compteur d'un autre tour ne compte pas). */
export function activationsUsedThisTurn(player: PlayerState, turnNumber: number): number {
  const activations = player.shipAbility?.activations;
  return activations && activations.turnNumber === turnNumber ? activations.count : 0;
}

/** Le Navire est-il ARMÉ en ce moment ? Un armement d'un tour précédent est périmé. */
export function isShipArmed(player: PlayerState, turnNumber: number): boolean {
  return player.shipAbility?.armedOnTurn === turnNumber;
}

function phaseAllows(phases: readonly GamePhase[], phase: GamePhase): boolean {
  return phases.includes(phase);
}

/**
 * Ce que l'interface a besoin de savoir pour dessiner le petit cadre du
 * Navire : la capacité, si elle est armée, et si chacun des deux gestes
 * est possible à cet instant — avec, quand il ne l'est pas, la raison à
 * afficher en info-bulle.
 */
export interface ShipAbilityView {
  ability: ShipActivatableAbility;
  /** Le Navire est armé et attend son tir. */
  armed: boolean;
  /** L'activation (premier geste) est possible maintenant. */
  canActivate: boolean;
  /** Le tir (second geste) est possible maintenant. */
  canFire: boolean;
  /** Pourquoi l'activation est refusée — absent si elle est possible. */
  activationBlockedBy?: string;
  /** Pourquoi le tir est refusé — absent s'il est possible, ou si la capacité n'a pas de tir. */
  fireBlockedBy?: string;
}

/**
 * État complet de la capacité de Navire de `playerId`. `undefined` si son
 * Navire n'en porte pas (les quatre Navires historiques, dont les capacités
 * « une fois par partie » restent en texte seul).
 *
 * Ne dit rien du CIBLAGE du tir : celui-ci suit les règles d'attaque et se
 * valide cible par cible (`assertValidDefender`).
 */
export function shipAbilityView(state: GameState, playerId: PlayerId): ShipAbilityView | undefined {
  const player = getPlayer(state, playerId);
  const ability = shipAbilityOf(player);
  if (!ability) return undefined;

  const armed = isShipArmed(player, state.turnNumber);
  const yourTurn = state.activePlayerId === playerId;
  const busy = Boolean(state.pendingReaction || state.pendingChoice || state.pendingOceanJudgment);

  const activationBlockedBy = state.status !== "active"
    ? "La partie est terminée."
    : !yourTurn
      ? "Ce n'est pas votre tour."
      : busy
        ? "Une résolution est en cours."
        : !phaseAllows(ability.activationPhases, state.phase)
          ? phaseRefusal(ability.activationPhases)
          : activationsUsedThisTurn(player, state.turnNumber) >= activationsPerTurn(ability)
            ? "Déjà utilisée ce tour-ci."
            : undefined;

  const shot = ability.armedShot;
  const fireBlockedBy = !shot
    ? undefined
    : state.status !== "active"
      ? "La partie est terminée."
      : !yourTurn
        ? "Ce n'est pas votre tour."
        : busy
          ? "Une résolution est en cours."
          : !armed
            ? "Le Navire n'est pas armé."
            : !phaseAllows(shot.phases, state.phase)
              ? phaseRefusal(shot.phases)
              : undefined;

  return {
    ability,
    armed,
    canActivate: activationBlockedBy === undefined,
    canFire: Boolean(shot) && fireBlockedBy === undefined,
    activationBlockedBy,
    fireBlockedBy,
  };
}

/** Inscrit une activation de plus au compteur du tour courant. */
export function withActivationRecorded(player: PlayerState, turnNumber: number, armed: boolean): PlayerState {
  return {
    ...player,
    shipAbility: {
      activations: { turnNumber, count: activationsUsedThisTurn(player, turnNumber) + 1 },
      ...(armed ? { armedOnTurn: turnNumber } : {}),
    },
  };
}

/** Consomme l'armement : le tir referme le canon. Le compteur d'activations, lui, reste. */
export function withArmingConsumed(player: PlayerState): PlayerState {
  const current = player.shipAbility;
  if (!current) return player;
  return { ...player, shipAbility: { activations: current.activations } };
}
