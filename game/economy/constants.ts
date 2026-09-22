/**
 * Économie — valeur de référence unique.
 *
 * Source de vérité design : Notion « Progression joueur — Tutoriel, XP,
 * Quêtes & Préconstruits » (2026-09-15), section 5 « Économie — valeur de
 * référence ». Elle verrouillait « 150 Tides = 1 booster Standard » quand
 * le Défaut était le seul booster achetable ; l'arrivée de deux boosters
 * spécialisés (Poissons pas frais, Étrangeté sous-marine) a déplacé la
 * grille, décision du 16/09/2026 :
 *
 *   - Défaut : 100 Tides — pool d'apprentissage, donc le moins cher ;
 *   - les deux autres : 150 Tides — 50 de plus, pour un contenu plus
 *     spécialisé et bien plus riche en Abyssales.
 *
 * `BOOSTER_STANDARD_PRICE` reste l'UNITÉ DE COMPTE de toute la progression
 * (paliers, quêtes, connexions) : c'est le prix du booster d'entrée, celui
 * auquel un joueur ramène mentalement ses gains. Les prix réels de chaque
 * booster vivent en base (`booster_definitions.price_currency`), seule
 * autorité à l'exécution ; cette constante est le repère d'équilibrage.
 *
 * Conséquence assumée : à 100 Tides, un booster arrive un tiers plus vite
 * qu'au calibrage précédent. C'est plus généreux que la cadence cible
 * « 1 booster tous les 2 à 3 jours » du cadrage économique, et les repères
 * ci-dessous n'ont PAS été rabaissés pour compenser — autant voir d'abord
 * si la cadence gêne vraiment, plutôt que de raboter les récompenses par
 * précaution.
 */

/** Monnaie de jeu, nommée dans toute l'interface. */
export const CURRENCY_NAME = "Tides";

/** Prix du booster d'entrée, et unité de compte de toute la progression. */
export const BOOSTER_STANDARD_PRICE = 100;

/** Supplément des boosters spécialisés par rapport au Défaut. */
export const SPECIALIZED_BOOSTER_SURCHARGE = 50;

/** Prix d'un booster spécialisé (Poissons pas frais, Étrangeté sous-marine). */
export const BOOSTER_SPECIALIZED_PRICE = BOOSTER_STANDARD_PRICE + SPECIALIZED_BOOSTER_SURCHARGE;

/** Identifiant du booster d'entrée dans `booster_definitions`. */
export const STANDARD_BOOSTER_ID = "standard";

/**
 * Identifiant du booster de CONSOLIDATION (Lot 14) dans
 * `booster_definitions`. Au même prix que le booster d'entrée : c'est le
 * pool que tout le monde doit pouvoir s'offrir, pas un produit
 * spécialisé.
 */
export const NECESSAIRE_DU_MARIN_BOOSTER_ID = "necessaire-du-marin";

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
  /** Gros palier : l'équivalent d'un booster d'entrée. */
  milestone: BOOSTER_STANDARD_PRICE,
} as const;

export type TideRewardTier = keyof typeof TIDE_REWARD;
