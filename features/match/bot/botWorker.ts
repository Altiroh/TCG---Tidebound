import { chooseBotAction } from "@/game";
import type { BotRequest, BotResponse } from "@/features/match/bot/botProtocol";

/**
 * RÉFLEXION DU BOT HORS DU FIL PRINCIPAL.
 *
 * Le bot « difficile » explore son tour entier avant chaque action
 * (`game/bot/searchTurn.ts`) : quelques centaines de millisecondes, plus
 * d'une seconde sur un téléphone. Faite sur le fil principal, cette
 * recherche gelait l'écran — animations figées, clics sans réponse.
 *
 * Le worker ne fait QUE choisir. L'état lui arrive par copie
 * (`structuredClone`), l'action repart ; c'est le plateau qui l'applique,
 * sur son état à lui (`applyBotAction`).
 */
// Types du worker écrits à la main : la bibliothèque `webworker` de TypeScript
// entre en conflit avec `dom`, que le reste du projet utilise.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null;
  postMessage: (message: BotResponse) => void;
};

scope.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id, state, playerId, difficulty } = event.data;
  let response: BotResponse;
  try {
    response = { id, action: chooseBotAction(state, playerId, difficulty) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) };
  }
  scope.postMessage(response);
};
