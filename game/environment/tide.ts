import { RULES } from "@/game/rules/constants";
import { advanceTideState, naturalOrientationFor } from "@/game/environment/types";
import type { EnvironmentState, PendingTideModifier, TideOrientation, TideStateName } from "@/game/environment/types";

export interface TickTideResult {
  tideState: TideStateName;
  tideRemainingTurns: number;
  tideOrientation: TideOrientation;
  tideIntensity: number;
  pendingTideModifiers: PendingTideModifier[];
  stateChanged: boolean;
}

/**
 * Fait progresser la Marée d'un tour de jeu (étapes 4-6 de la structure de
 * tour verrouillée) : décompte la durée restante (sauf modificateur
 * "maintain" actif), et si elle atteint 0, passe à l'état suivant SELON
 * L'ORIENTATION courante (Montante vers les Abysses, Descendante vers le
 * Calme) avec une nouvelle durée et une Intensité remise à sa base.
 * L'orientation elle-même se réinitialise naturellement à Calme/Abysses
 * (`naturalOrientationFor`), sinon elle est conservée telle quelle — seul
 * un effet de carte peut l'inverser ailleurs (`tideInvertOrientation`).
 * Fonction pure : ne modifie rien, retourne le nouvel état calculé.
 */
export function tickTide(
  env: Pick<EnvironmentState, "tideState" | "tideRemainingTurns" | "tideOrientation" | "tideIntensity" | "pendingTideModifiers">
): TickTideResult {
  const maintainActive = env.pendingTideModifiers.some((m) => m.kind === "maintain" && m.remainingTriggers > 0);

  const consumedModifiers = env.pendingTideModifiers
    .map((m) => (m.kind === "maintain" ? { ...m, remainingTriggers: m.remainingTriggers - 1 } : m))
    .filter((m) => m.remainingTriggers > 0);

  if (maintainActive) {
    return {
      tideState: env.tideState,
      tideRemainingTurns: env.tideRemainingTurns,
      tideOrientation: env.tideOrientation,
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
      tideOrientation: env.tideOrientation,
      tideIntensity: env.tideIntensity,
      pendingTideModifiers: consumedModifiers,
      stateChanged: false,
    };
  }

  const newState = advanceTideState(env.tideState, env.tideOrientation);
  const newOrientation = naturalOrientationFor(newState, env.tideOrientation);
  return {
    tideState: newState,
    tideRemainingTurns: RULES.TIDE_STATE_DURATION[newState],
    tideOrientation: newOrientation,
    tideIntensity: RULES.TIDE_BASE_INTENSITY,
    pendingTideModifiers: consumedModifiers,
    stateChanged: true,
  };
}

/**
 * Force une transition IMMÉDIATE d'un état de Marée, sans attendre la fin
 * du décompte normal (contrairement à `tickTide`/`tideReduceDuration`, qui
 * ne font jamais progresser l'état lui-même avant que la durée n'atteigne
 * 0 — cf. leurs commentaires respectifs). Utilisé par les cartes qui
 * "avancent"/"reculent" explicitement la Marée d'un cran (ex: Compas aux
 * Aiguilles Noires, Bouée de Rappel). `direction` fixe le sens du
 * mouvement lui-même, indépendamment de l'orientation courante — "avancer"
 * va toujours vers les Abysses, "reculer" toujours vers Calme, même si
 * l'orientation affichée dit l'inverse à ce moment précis.
 */
export function forceTideTransition(
  env: Pick<EnvironmentState, "tideState" | "tideRemainingTurns" | "tideOrientation" | "tideIntensity" | "pendingTideModifiers">,
  direction: "avancer" | "reculer"
): TickTideResult {
  const forcedOrientation: TideOrientation = direction === "avancer" ? "montante" : "descendante";
  const newState = advanceTideState(env.tideState, forcedOrientation);
  // Déjà à la borne (reculer depuis Calme, avancer depuis les Abysses) : la
  // Marée « ne peut pas reculer au-delà de Calme » — il ne se passe rien.
  // Ni durée remise à neuf, ni orientation touchée (Bouée de Rappel).
  if (newState === env.tideState) {
    return {
      tideState: env.tideState,
      tideRemainingTurns: env.tideRemainingTurns,
      tideOrientation: env.tideOrientation,
      tideIntensity: env.tideIntensity,
      pendingTideModifiers: env.pendingTideModifiers,
      stateChanged: false,
    };
  }
  const newOrientation = naturalOrientationFor(newState, env.tideOrientation);
  return {
    tideState: newState,
    tideRemainingTurns: RULES.TIDE_STATE_DURATION[newState],
    tideOrientation: newOrientation,
    tideIntensity: RULES.TIDE_BASE_INTENSITY,
    pendingTideModifiers: env.pendingTideModifiers,
    stateChanged: newState !== env.tideState,
  };
}

/**
 * La Marée actuelle PREND FIN maintenant (Régulateur de Courant : « si cette
 * réduction la fait prendre fin, passez immédiatement à la Marée
 * suivante ») : passage à l'état suivant selon l'orientation, exactement
 * comme un décompte arrivé à 0 dans `tickTide` — mais sans consulter ni
 * consommer un « Maintien » en attente, qui porte sur le décompte de début
 * de tour et non sur une fin imposée par une carte.
 */
export function endCurrentTideState(
  env: Pick<EnvironmentState, "tideState" | "tideOrientation" | "pendingTideModifiers">
): TickTideResult {
  const newState = advanceTideState(env.tideState, env.tideOrientation);
  return {
    tideState: newState,
    tideRemainingTurns: RULES.TIDE_STATE_DURATION[newState],
    tideOrientation: naturalOrientationFor(newState, env.tideOrientation),
    tideIntensity: RULES.TIDE_BASE_INTENSITY,
    pendingTideModifiers: env.pendingTideModifiers,
    stateChanged: newState !== env.tideState,
  };
}

/**
 * Force une entrée DIRECTE dans les Abysses, en ignorant tout état
 * intermédiaire — contrairement à `forceTideTransition`, qui n'avance que
 * d'un cran (ex: Compas aux Aiguilles Noires). Réservé aux "Grandes
 * Anomalies" du Lot 08 (La Gueule Sous la Mer, Sept Brasses Plus Bas).
 * `extraDurationTurns` (optionnel) s'ajoute à la durée d'entrée par défaut
 * de l'Abysses ; `forceOrientation` (optionnel) fixe l'orientation
 * résultante au lieu de la déduire naturellement (`naturalOrientationFor`).
 * Comme `forceTideTransition`, fonction PURE : seuls l'état, la durée et
 * l'orientation changent ici. Le choc d'entrée dans les Abysses est appliqué
 * par l'effet appelant (`withForcedTransition`, `resolveEffect.ts`), et les
 * déclencheurs de transition (`onTideStateEntered`/`onTideStateExited`,
 * Structures qui deviennent visibles) par `dispatch`
 * (`processForcedTideTransitions`).
 */
export function forceTideJumpToAbysses(
  env: Pick<EnvironmentState, "tideState" | "tideRemainingTurns" | "tideOrientation" | "pendingTideModifiers">,
  options?: { extraDurationTurns?: number; forceOrientation?: TideOrientation }
): TickTideResult {
  const orientation = options?.forceOrientation ?? naturalOrientationFor("abysses", env.tideOrientation);
  // Déjà en Abysses : « forcez la Marée en Abysses » ne remet pas la durée à
  // neuf, et « augmentez de 1 tour sa durée RESTANTE » part de ce qui reste
  // (Sept Brasses Plus Bas).
  const base = env.tideState === "abysses" ? env.tideRemainingTurns : RULES.TIDE_STATE_DURATION.abysses;
  return {
    tideState: "abysses",
    tideRemainingTurns: base + (options?.extraDurationTurns ?? 0),
    tideOrientation: orientation,
    tideIntensity: RULES.TIDE_BASE_INTENSITY,
    pendingTideModifiers: env.pendingTideModifiers,
    stateChanged: env.tideState !== "abysses",
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
