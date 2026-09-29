import type { AchievementStats } from "@/game/achievements/catalog";
import type { MatchStatKey } from "@/game/quests/matchStats";

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
 * DEUX conditions ne se déduisent d'aucun compteur : l'ACHAT (en Tides
 * comme en Jetons) et le SECRET. Elles se lisent dans `player_cosmetics`
 * (la ligne existe = c'est payé, ou c'est trouvé). D'où le troisième
 * argument de `isCosmeticUnlocked`.
 */

/**
 * LES SECRETS DE L'INTERFACE — catalogue FERMÉ.
 *
 * Un secret est un geste qu'on découvre en jouant avec le décor hors
 * plateau (souffler la bougie…), pas une statistique. Le navigateur ne
 * peut réclamer QUE ces noms-là (`discoverSecret`, côté serveur, refuse
 * tout le reste) : ajouter un secret, c'est ajouter une entrée ici ET le
 * geste qui l'appelle.
 */
export const COSMETIC_SECRETS = [
  /** Souffler une bougie du décor (menu, Collection, Decks). */
  "bougie",
] as const;

export type CosmeticSecret = (typeof COSMETIC_SECRETS)[number];

/** Garde de type : la valeur reçue du réseau est-elle un secret connu ? */
export function isCosmeticSecret(value: unknown): value is CosmeticSecret {
  return typeof value === "string" && (COSMETIC_SECRETS as readonly string[]).includes(value);
}

export type CosmeticUnlock =
  /** Possédé d'office par tout le monde. Jamais écrit en base. */
  | { kind: "free" }
  /** Palier de niveau. */
  | { kind: "level"; level: number }
  /** Achat en Tides, rayon Cosmétiques du Market. */
  | { kind: "purchase"; priceTides: number }
  /**
   * Achat en Jetons de Préconstruit, même rayon (« La Consigne »). Une
   * variante et non une devise optionnelle sur `purchase` : chaque achat a
   * sa fonction en base (`purchase_cosmetic_tokens`), et un prix qui ne dit
   * pas clairement sa monnaie finirait débité dans la mauvaise.
   */
  | { kind: "purchaseTokens"; priceTokens: number }
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
  | { kind: "decksFullyOwned"; count: number }
  /**
   * CUMUL À VIE d'une statistique de partie (`game/quests/matchStats.ts`,
   * nature `sum`) : « 25 victoires sans jamais passer en Déraison ».
   * `label` est la condition telle qu'on la dit au joueur.
   */
  | { kind: "lifetimeStat"; stat: MatchStatKey; count: number; label: string }
  /**
   * RECORD sur une seule partie (`AchievementStats.records`) : « 5 unités
   * adverses détruites en même temps ». Vaut pour les clés de nature
   * `record` comme pour le meilleur match d'un cumul.
   */
  | { kind: "matchRecord"; stat: MatchStatKey; count: number; label: string }
  /**
   * Un SECRET trouvé dans l'interface (`COSMETIC_SECRETS`). Comme l'achat,
   * il ne se déduit d'aucun compteur : c'est la ligne de `player_cosmetics`
   * qui dit « trouvé », écrite par `discoverSecret` au moment du geste. La
   * synchronisation par compteurs ne l'accorde donc jamais — elle le
   * constate. À déclarer `hidden` : une condition affichée ne serait plus
   * un secret.
   */
  | { kind: "secret"; secret: CosmeticSecret };

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

/**
 * S'ACHÈTE-T-IL, en Tides ou en Jetons ? Les deux monnaies partagent tout
 * le reste : c'est la ligne de `player_cosmetics` qui fait foi, la
 * synchronisation ne l'accorde jamais, et ce qui est en vente se montre.
 */
export function isPurchasable(unlock: CosmeticUnlock): boolean {
  return unlock.kind === "purchase" || unlock.kind === "purchaseTokens";
}

/** Valeur d'une statistique à vie — une clé jamais vue vaut 0. */
function lifetimeValue(stats: AchievementStats, stat: MatchStatKey): number {
  return stats.lifetime[stat] ?? 0;
}

/** Record d'une statistique — une clé jamais vue vaut 0. */
function recordValue(stats: AchievementStats, stat: MatchStatKey): number {
  return stats.records[stat] ?? 0;
}

/** Possédé d'office ? Un cosmétique gratuit n'est jamais écrit en base. */
export function isFree(skin: { unlock: CosmeticUnlock }): boolean {
  return skin.unlock.kind === "free";
}

/**
 * La condition est-elle remplie ?
 *
 * `purchasedIds` : les identifiants déjà acquis, lus dans
 * `player_cosmetics`. Un achat, comme un secret trouvé, ne se déduit
 * d'aucun compteur — c'est la ligne en base qui fait foi, et elle seule.
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
    case "purchaseTokens":
    case "secret":
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
    case "lifetimeStat":
      return lifetimeValue(stats, unlock.stat) >= unlock.count;
    case "matchRecord":
      return recordValue(stats, unlock.stat) >= unlock.count;
  }
}

/**
 * LE VISUEL EST-IL SOUS LE VOILE ? (19/09/2026)
 *
 * « Ce qu'on n'a pas gagné, on ne le voit pas » : toute récompense à
 * MÉRITER reste voilée tant qu'elle n'est pas obtenue — le nom et la
 * condition, eux, restent lisibles, on doit savoir ce qu'on vise. Voir
 * entier un dos verrouillé au niveau 25, c'est n'avoir plus rien à
 * découvrir le jour où il tombe.
 *
 * UNE exception, et elle est de bon sens : ce qui est EN VENTE se montre.
 * Un cosmétique qu'on achète n'est pas une récompense qu'on découvre,
 * c'est une marchandise — et on ne vend pas ce qu'on refuse de montrer.
 * Le rayon Cosmétiques du Market lit la même donnée.
 *
 * ICI et non dans le service d'affichage : c'est une règle de JEU, elle se
 * teste sans base (`tests/features/collectableVeil.test.ts` exerce cette
 * fonction, pas une copie de son énoncé).
 */
export function isArtVeiled(skin: { unlock: CosmeticUnlock; hidden?: boolean }, owned: boolean): boolean {
  if (owned) return false;
  if (skin.hidden === true) return true;
  return !isPurchasable(skin.unlock);
}

/**
 * L'emplacement est-il MASQUÉ — ni nom, ni condition ? Réservé au
 * Collectable déclaré caché et pas encore obtenu ; une fois obtenu, il se
 * révèle entièrement.
 */
export function isSlotMasked(skin: { hidden?: boolean }, owned: boolean): boolean {
  return !owned && skin.hidden === true;
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
    case "purchaseTokens":
      return `${unlock.priceTokens} Jeton${unlock.priceTokens > 1 ? "s" : ""} de Préconstruit`;
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
    case "lifetimeStat":
    case "matchRecord":
      return unlock.label;
    case "secret":
      // Ne devrait jamais s'afficher (un secret est caché) ; s'il l'était,
      // on n'en dit pas plus que ça.
      return "Un secret à découvrir";
  }
}

/**
 * Ce qu'il reste à faire, quand c'est chiffrable (« encore 12 »). `null`
 * quand la condition ne se compte pas — un achat, une liste de cartes, un
 * secret.
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
    case "lifetimeStat":
      return remaining(unlock.count, lifetimeValue(stats, unlock.stat));
    case "matchRecord":
      // Un record ne se complète pas petit à petit : « meilleur : 3 sur 5 »
      // dit mieux où l'on en est qu'un « encore 2 » qui laisserait croire
      // que deux unités de plus, n'importe quand, suffiront.
      return recordValue(stats, unlock.stat) >= unlock.count ? null : `record : ${recordValue(stats, unlock.stat)} sur ${unlock.count}`;
    case "free":
    case "purchase":
    case "purchaseTokens":
    case "ownsCards":
    case "secret":
      return null;
  }
}
