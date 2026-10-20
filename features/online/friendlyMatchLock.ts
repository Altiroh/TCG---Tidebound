/**
 * MATCH AMICAL TEMPORAIREMENT BLOQUÉ hors mode Dev (décision du 20/10/2026).
 *
 * Un seul interrupteur pour le rouvrir : passer `MATCH_AMICAL_BLOQUE_HORS_DEV`
 * à `false`. Le serveur refuse création, défi et rejoindre par code
 * (`features/online/actions.ts`, `features/friends/actions.ts`) ; l'interface
 * masque les accès (`ModeTable`, `NewMatchScreen`, `FriendsScreen`,
 * `SocialPulse`). Le mode Dev (Admin, ou développement local, hors vue
 * joueur) garde l'accès, pour tester.
 */
export const MATCH_AMICAL_BLOQUE_HORS_DEV = true;

export const MATCH_AMICAL_INDISPONIBLE = "Le match amical est temporairement indisponible.";

/** Le match amical est-il fermé pour ce joueur ? */
export function friendlyMatchLocked(devMode: boolean): boolean {
  return MATCH_AMICAL_BLOQUE_HORS_DEV && !devMode;
}
