/**
 * VOLET SOCIAL RÉSERVÉ AU MODE DEV (décision du 20/10/2026) : page Amis,
 * fiches de joueur, vitrine, échanges de cartes et présentation de
 * l'adversaire avant une partie en ligne.
 *
 * Un seul interrupteur pour l'ouvrir à tous : passer `SOCIAL_BLOQUE_HORS_DEV`
 * à `false`. Le serveur refuse pages et actions (`socialGate.ts`) ;
 * l'interface masque les accès (onglet « Amis » du bandeau, bloc Vitrine du
 * profil, alerte d'échange, présentation `VersusIntro`). Même modèle que
 * `features/online/friendlyMatchLock.ts`.
 */
export const SOCIAL_BLOQUE_HORS_DEV = true;

export const SOCIAL_INDISPONIBLE = "Cette fonctionnalité n'est pas encore ouverte.";

/** Le volet social est-il fermé pour ce joueur ? */
export function socialLocked(devMode: boolean): boolean {
  return SOCIAL_BLOQUE_HORS_DEV && !devMode;
}
