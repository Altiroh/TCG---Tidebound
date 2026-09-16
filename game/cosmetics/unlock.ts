import type { AchievementStats } from "@/game/achievements/catalog";

/**
 * Conditions d'obtention des Collectables — dos de carte et cadres de
 * Navire.
 *
 * Source de vérité design : Notion « Dos de carte — Collectables » et
 * « Cadres de Navire — Collectables ».
 *
 * MODÈLE, repris tel quel des exploits (`game/achievements/catalog.ts`) :
 * une condition n'est pas un ÉVÉNEMENT qu'on écoute, c'est un PRÉDICAT sur
 * des compteurs déjà persistés. Les trois propriétés qu'on y gagne valent
 * la répétition :
 *   - rattrapable — un cosmétique ajouté aujourd'hui se débloque tout seul
 *     pour les comptes qui remplissaient déjà sa condition hier ;
 *   - immunisé aux événements perdus — une partie non enregistrée décale le
 *     déblocage, elle ne le fait pas disparaître ;
 *   - testable sans base — `isCosmeticUnlocked` est une fonction pure.
 *
 * L'ACHAT est la seule condition qui ne se déduit pas d'un compteur : elle
 * se lit dans `player_cosmetics` (la ligne existe = c'est payé). D'où le
 * second argument de `isCosmeticUnlocked`.
 */

export type CosmeticUnlock =
  /** Possédé d'office par tout le monde. Jamais écrit en base. */
  | { kind: "free" }
  /** Palier de niveau. */
  | { kind: "level"; level: number }
  /** Achat en Tides, rayon Cosmétiques du Market. */
  | { kind: "purchase"; priceTides: number }
  /** Cartes DISTINCTES possédées — les doublons ne comptent jamais. */
  | { kind: "distinctCards"; count: number }
  /** Maîtrise d'un archétype : posséder ces cartes-là, toutes. */
  | { kind: "ownsCards"; cardIds: readonly string[]; label: string }
  /** Victoires cumulées. */
  | { kind: "wins"; count: number }
  /** Défaites cumulées. */
  | { kind: "losses"; count: number }
  /** Parties jouées, gagnées ou perdues. */
  | { kind: "matches"; count: number }
  /** Boosters effectivement ouverts. */
  | { kind: "boosters"; count: number }
  /** Decks dont le joueur possède réellement toutes les cartes. */
  | { kind: "decksFullyOwned"; count: number };

/** Ce que tout Collectable déclare, quelle que soit sa famille. */
export interface CosmeticSkin {
  /** Identifiant stocké dans `player_cosmetics.cosmetic_id`. */
  id: string;
  label: string;
  /** Une phrase, affichée sous la vignette dans le sélecteur. */
  description: string;
  src: string;
  unlock: CosmeticUnlock;
  /**
   * `true` : l'emplacement reste MASQUÉ tant que la condition n'est pas
   * remplie — le joueur voit qu'il manque quelque chose sans savoir quoi
   * (« Hidden Collectable » de la spec). Les autres s'affichent avec leur
   * condition en clair, parce qu'un objectif qu'on ne connaît pas ne donne
   * envie de rien.
   */
  hidden?: boolean;
  /**
   * `true` : le Collectable est acquis pour de bon, mais son visuel
   * définitif n'est pas encore produit — `src` porte le voile
   * `dispo-bientot`. Il se montre, il ne s'équipe pas : mieux vaut le
   * dire que de laisser croire à une récompense fantôme.
   */
  artPending?: boolean;
}

/** Possédé d'office ? Un cosmétique gratuit n'est jamais écrit en base. */
export function isFree(skin: { unlock: CosmeticUnlock }): boolean {
  return skin.unlock.kind === "free";
}

/**
 * La condition est-elle remplie ?
 *
 * `purchasedIds` : les identifiants déjà payés, lus dans
 * `player_cosmetics`. Un achat ne se déduit d'aucun compteur — c'est la
 * ligne en base qui fait foi, et elle seule.
 */
export function isCosmeticUnlocked(
  unlock: CosmeticUnlock,
  stats: AchievementStats,
  purchasedIds: ReadonlySet<string>,
  id: string
): boolean {
  switch (unlock.kind) {
    case "free":
      return true;
    case "purchase":
      return purchasedIds.has(id);
    case "level":
      return stats.level >= unlock.level;
    case "distinctCards":
      return stats.distinctCardsOwned >= unlock.count;
    case "ownsCards": {
      const owned = new Set(stats.ownedCardIds);
      return unlock.cardIds.every((cardId) => owned.has(cardId));
    }
    case "wins":
      return stats.wins >= unlock.count;
    case "losses":
      return stats.losses >= unlock.count;
    case "matches":
      return stats.matchesPlayed >= unlock.count;
    case "boosters":
      return stats.boostersOpened >= unlock.count;
    case "decksFullyOwned":
      return stats.decksFullyOwned >= unlock.count;
  }
}

/**
 * La condition, dite au joueur. Jamais « Verrouillé » tout court : ce qui
 * manque doit se lire, sinon la vignette ne sert qu'à frustrer.
 *
 * Un Collectable CACHÉ n'appelle pas cette fonction tant qu'il n'est pas
 * débloqué — son intérêt est justement qu'on ignore sa condition.
 */
export function unlockLabel(unlock: CosmeticUnlock): string {
  switch (unlock.kind) {
    case "free":
      return "Possédé d'office";
    case "purchase":
      return `${unlock.priceTides.toLocaleString("fr-FR")} Tides`;
    case "level":
      return `Niveau ${unlock.level}`;
    case "distinctCards":
      return `${unlock.count} cartes différentes`;
    case "ownsCards":
      return unlock.label;
    case "wins":
      return `${unlock.count} victoires`;
    case "losses":
      return `${unlock.count} défaites`;
    case "matches":
      return `${unlock.count} parties jouées`;
    case "boosters":
      return `${unlock.count} boosters ouverts`;
    case "decksFullyOwned":
      return unlock.count > 1 ? `${unlock.count} équipages complétés` : "Un équipage complété";
  }
}

/**
 * Ce qu'il reste à faire, quand c'est chiffrable (« encore 12 »). `null`
 * quand la condition ne se compte pas — un achat, une liste de cartes.
 */
export function unlockProgress(unlock: CosmeticUnlock, stats: AchievementStats): string | null {
  const remaining = (target: number, current: number) => (current >= target ? null : `encore ${target - current}`);
  switch (unlock.kind) {
    case "level":
      return remaining(unlock.level, stats.level);
    case "distinctCards":
      return remaining(unlock.count, stats.distinctCardsOwned);
    case "wins":
      return remaining(unlock.count, stats.wins);
    case "losses":
      return remaining(unlock.count, stats.losses);
    case "matches":
      return remaining(unlock.count, stats.matchesPlayed);
    case "boosters":
      return remaining(unlock.count, stats.boostersOpened);
    case "decksFullyOwned":
      return remaining(unlock.count, stats.decksFullyOwned);
    case "free":
    case "purchase":
    case "ownsCards":
      return null;
  }
}
