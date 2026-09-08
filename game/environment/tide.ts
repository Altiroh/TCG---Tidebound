import { RULES } from "@/game/rules/constants";
import { nextTideState } from "@/game/environment/types";
import type { EnvironmentState, PendingTideModifier, TideStateName } from "@/game/environment/types";

export interface TickTideResult {
  tideState: TideStateName;
  tideRemainingTurns: number;
  tideIntensity: number;
  pendingTideModifiers: PendingTideModifier[];
  stateChanged: boolean;
}

/**
 * Fait progresser la Marée d'un tour de jeu (étapes 4-6 de la structure de
 * tour verrouillée) : décompte la durée restante (sauf modificateur
 * "maintain" actif), et si elle atteint 0, passe à l'état suivant du
 * cycle avec une nouvelle durée et une Intensité remise à sa base.
 * Fonction pure : ne modifie rien, retourne le nouvel état calculé.
 */
export function tickTide(env: Pick<EnvironmentState, "tideState" | "tideRemainingTurns" | "tideIntensity" | "pendingTideModifiers">): TickTideResult {
  const maintainActive = env.pendingTideModifiers.some((m) => m.kind === "maintain" && m.remainingTriggers > 0);

  const consumedModifiers = env.pendingTideModifiers
    .map((m) => (m.kind === "maintain" ? { ...m, remainingTriggers: m.remainingTriggers - 1 } : m))
    .filter((m) => m.remainingTriggers > 0);

  if (maintainActive) {
    return {
      tideState: env.tideState,
      tideRemainingTurns: env.tideRemainingTurns,
      tideIntensity: env.tideIntensity,
      pendingTideModifiers: consumedModifiers,
      stateChanged: false,
    };
  }

  const remaining = env.tideRemainingTurns - 1;
  if (remaining > 0) {
    return {
      tideState: env.tideState,
      tideRemainingTurns: remaining,
      tideIntensity: env.tideIntensity,
      pendingTideModifiers: consumedModifiers,
      stateChanged: false,
    };
  }

  const newState = nextTideState(env.tideState);
  return {
    tideState: newState,
    tideRemainingTurns: RULES.TIDE_STATE_DURATION[newState],
    tideIntensity: RULES.TIDE_BASE_INTENSITY,
    pendingTideModifiers: consumedModifiers,
    stateChanged: true,
  };
}

/** Consomme (et retire) le modificateur "amplify" en attente, s'il y en a un. */
export function consumeAmplify(modifiers: PendingTideModifier[]): { amplified: boolean; modifiers: PendingTideModifier[] } {
  const index = modifiers.findIndex((m) => m.kind === "amplify" && m.remainingTriggers > 0);
  if (index === -1) return { amplified: false, modifiers };
  const next = [...modifiers];
  const current = next[index]!;
  const remaining = current.remainingTriggers - 1;
  if (remaining > 0) {
    next[index] = { ...current, remainingTriggers: remaining };
  } else {
    next.splice(index, 1);
  }
  return { amplified: true, modifiers: next };
}
