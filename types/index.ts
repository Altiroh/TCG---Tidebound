/**
 * Types partagés entre plusieurs couches de l'application (UI, API,
 * moteur). Les types propres au moteur de jeu vivent dans `/game` et sont
 * ré-exportés depuis `@/game` ; ce fichier est pour tout le reste
 * (utilisateurs, decks persistés, sessions de matchmaking, etc.) au fur
 * et à mesure que ces systèmes sont construits.
 */

export interface PlayerProfile {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface MatchInvite {
  code: string;
  gameId: string;
  createdBy: string;
  expiresAt: string;
}
