/**
 * Économie — valeur de référence unique.
 *
 * Source de vérité design : Notion « Progression joueur — Tutoriel, XP,
 * Quêtes & Préconstruits » (2026-09-15), section 5 « Économie — valeur de
 * référence », qui VERROUILLE le prix du booster :
 *
 *   > 150 Tides = 1 booster Standard
 *
 * Cette valeur remplace le prix prototype de 500 Tides utilisé jusqu'ici.
 * Toute récompense chiffrée ailleurs dans le méta-jeu (paliers de niveau,
 * quêtes, connexions) se lit par rapport à elle, via les repères
 * `TIDE_REWARD` ci-dessous — c'est ce qui permet de rééquilibrer l'économie
 * entière en ne touchant qu'à ce fichier.
 */

/** Monnaie de jeu, nommée dans toute l'interface. */
export const CURRENCY_NAME = "Tides";

/** Prix d'un booster Standard, et unité de compte de toute la progression. */
export const BOOSTER_STANDARD_PRICE = 150;

/** Identifiant du booster Standard dans `booster_definitions`. */
export const STANDARD_BOOSTER_ID = "standard";

/**
 * Repères de récompense (Notion, section 5). Une récompense chiffrée du
 * méta-jeu doit retomber sur l'un d'eux plutôt que d'inventer un montant :
 * c'est ce qui garde la cadence « un booster tous les N jours » lisible.
 */
export const TIDE_REWARD = {
  /** Petite récompense : 20–30 Tides. */
  small: 25,
  /** Récompense classique : 40–50 Tides. */
  standard: 45,
  /** Belle récompense : 75 Tides. */
  big: 75,
  /** Gros palier : l'équivalent d'un booster. */
  milestone: BOOSTER_STANDARD_PRICE,
} as const;

export type TideRewardTier = keyof typeof TIDE_REWARD;
