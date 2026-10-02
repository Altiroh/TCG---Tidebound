import type { BotDifficulty, GameState, PlayerAction, PlayerId } from "@/game";

/** Question posée au worker du bot (`botWorker.ts`). */
export interface BotRequest {
  id: number;
  state: GameState;
  playerId: PlayerId;
  difficulty: BotDifficulty;
}

/** Réponse du worker : l'action choisie, ou l'erreur rencontrée. */
export type BotResponse = { id: number; action: PlayerAction } | { id: number; error: string };
