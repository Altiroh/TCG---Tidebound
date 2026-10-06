/**
 * Tutoriel — étapes d'une partie guidée.
 *
 * Logique PURE : chaque étape est une leçon ou un prédicat sur l'état réel
 * de la partie, jamais un script qui pilote le moteur. La partie s'ouvre
 * sur un scénario préparé (`scenario.ts`). Le rendu vit dans
 * `features/tutorial/`.
 */
export { TUTORIAL_STEPS, tutorialAnchor, tutorialCardsExist, tutorialProgress } from "@/game/tutorial/steps";
export type { TutorialAnchor, TutorialProgress, TutorialStep } from "@/game/tutorial/steps";
export { TUTORIAL_CARDS, TUTORIAL_START_TURN, applyTutorialScenario } from "@/game/tutorial/scenario";
