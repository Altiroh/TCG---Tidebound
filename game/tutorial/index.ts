/**
 * Tutoriel — étapes d'une partie guidée.
 *
 * Logique PURE : chaque étape est un prédicat sur l'état réel de la partie,
 * jamais un script qui pilote le moteur. Le rendu vit dans
 * `features/tutorial/`.
 */
export { TUTORIAL_OPENING_TYPES, TUTORIAL_STEPS, tutorialProgress } from "@/game/tutorial/steps";
export type { TutorialAnchor, TutorialProgress, TutorialStep } from "@/game/tutorial/steps";
