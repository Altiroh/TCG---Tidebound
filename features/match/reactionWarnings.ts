import { getCardDefinition, graveyardPickAvailable, type GameState, type PendingReactionCandidate, type PlayerId } from "@/game";

/**
 * Ce que le joueur doit savoir AVANT d'appliquer un effet (retour du
 * 12/10/2026) : un effet qui reprend une carte au Cimetière alors qu'aucune
 * ne remplit sa condition se résoudra à vide. Il peut l'appliquer quand
 * même — il le fait en connaissance de cause.
 */
export function reactionWarning(state: GameState, viewerId: PlayerId, candidate: PendingReactionCandidate): string | null {
  const effects = getCardDefinition(candidate.cardId).abilities?.[candidate.abilityIndex]?.effects;
  const available = graveyardPickAvailable(state, viewerId, effects, candidate.sourceInstanceId);
  if (available !== 0) return null;
  const both = (effects ?? []).some((e) => e.type === "pickFromGraveyard" && e.graveyards === "both");
  return `Aucune carte ${both ? "des Cimetières" : "de ton Cimetière"} ne remplit la condition : l'effet ne reprendra rien.`;
}
