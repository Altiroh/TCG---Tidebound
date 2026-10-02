import { chooseBotAction, type BotDifficulty, type GameState, type PlayerAction, type PlayerId } from "@/game";
import type { BotRequest, BotResponse } from "@/features/match/bot/botProtocol";

/**
 * Fait choisir son action au bot SANS bloquer l'écran.
 *
 * Dans un navigateur, la réflexion part dans un Web Worker (`botWorker.ts`),
 * créé une fois et partagé. Sans worker (tests, rendu serveur, navigateur
 * qui le refuse) ou s'il plante, on retombe sur le calcul direct : le bot
 * joue toujours, il ne fait simplement plus son calcul à part.
 */
let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const waiting = new Map<number, { resolve: (action: PlayerAction) => void; fallback: () => void }>();

function getWorker(): Worker | null {
  if (workerBroken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./botWorker.ts", import.meta.url));
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<BotResponse>) => {
    const entry = waiting.get(event.data.id);
    if (!entry) return;
    waiting.delete(event.data.id);
    if ("action" in event.data) entry.resolve(event.data.action);
    else entry.fallback();
  };
  worker.onerror = () => {
    // Worker inutilisable (chargement refusé, plantage) : on n'y revient plus,
    // et ce qui l'attendait se calcule sur place.
    workerBroken = true;
    worker?.terminate();
    worker = null;
    const pending = Array.from(waiting.values());
    waiting.clear();
    pending.forEach((entry) => entry.fallback());
  };
  return worker;
}

export function thinkBotAction(state: GameState, playerId: PlayerId, difficulty: BotDifficulty): Promise<PlayerAction> {
  const direct = () => chooseBotAction(state, playerId, difficulty);
  const target = getWorker();
  if (!target) return Promise.resolve().then(direct);

  return new Promise<PlayerAction>((resolve) => {
    const id = nextId++;
    waiting.set(id, { resolve, fallback: () => resolve(direct()) });
    const request: BotRequest = { id, state, playerId, difficulty };
    try {
      target.postMessage(request);
    } catch {
      // État impossible à copier : calcul sur place pour cette fois.
      waiting.delete(id);
      resolve(direct());
    }
  });
}
