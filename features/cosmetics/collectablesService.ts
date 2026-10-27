import {
  COLLECTABLE_FAMILIES,
  collectablePrice,
  collectableTokenPrice,
  isArtVeiled,
  isCosmeticUnlocked,
  isFree,
  isSlotMasked,
  unlockedCollectables,
  unlockLabel,
  unlockProgress,
  type CosmeticSkin,
} from "@/game";
import type { AchievementStats } from "@/game/achievements";
import { readAchievementStats } from "@/features/achievements/achievementService";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Collectables — lecture et synchronisation côté SERVEUR. Pas de
 * `"use server"` : ces fonctions prennent un identifiant de joueur, elles ne
 * doivent pas devenir des points d'entrée HTTP (cf.
 * `collectablesActions.ts`, qui déduit le joueur de sa session).
 *
 * DEUX sources de vérité, et deux seulement :
 *   - le catalogue TypeScript dit ce qui existe et à quelle condition ;
 *   - `player_cosmetics` dit ce qui est ACQUIS (débloqué ou acheté).
 * Tout le reste — « est-ce à portée ? », « combien en reste-t-il ? » — se
 * recalcule à chaque lecture depuis les compteurs. Rien de dérivé n'est
 * stocké, donc rien ne peut diverger.
 */

/** Un Collectable tel que l'écran doit le montrer. */
export interface CollectableOption {
  id: string;
  label: string;
  description: string;
  src: string;
  owned: boolean;
  equipped: boolean;
  /** Visuel définitif pas encore produit : se montre, ne s'équipe pas. */
  artPending: boolean;
  /**
   * `true` : emplacement MASQUÉ — ni nom, ni condition. Seulement pour un
   * Collectable caché encore verrouillé ; une fois obtenu il se révèle
   * complètement.
   */
  masked: boolean;
  /**
   * `true` : le VISUEL est sous le voile, mais le nom et la condition
   * restent lisibles — on sait ce qu'il faut faire pour l'avoir, on ne voit
   * pas ce qu'on aura. Vrai pour TOUT ce qui reste à mériter ; faux pour ce
   * qui est en vente, qu'on doit pouvoir regarder avant d'acheter.
   */
  artHidden: boolean;
  /** Condition en clair (`null` si masqué ou déjà obtenu). */
  requirement: string | null;
  /** Ce qu'il reste à faire, quand c'est chiffrable (« encore 12 »). */
  progress: string | null;
  /** Prix en Tides, si le Collectable s'achète au Market en Tides. */
  priceTides: number | null;
  /** Prix en Jetons de Préconstruit, si c'est la monnaie de son achat (« La Consigne »). */
  priceTokens: number | null;
}

export interface CollectableFamilyView {
  kind: string;
  label: string;
  options: CollectableOption[];
  /** Identifiant équipé dans cette famille, `null` si aucun. */
  equipped: string | null;
}

export interface CollectablesView {
  isSignedIn: boolean;
  level: number;
  /** Solde de Tides — le rayon d'achat doit dire ce qui est à portée. */
  balance: number;
  families: CollectableFamilyView[];
}

const VEILED_ART: Record<string, string> = {
  cardBack: "/assets/cards/card-back/dispo-bientot.webp",
  shipSkin: "/assets/ships/frames/dispo-bientot.webp",
  // Pas encore de voile peint pour les cadres de profil : le cadre d'origine, éteint par l'écran.
  frame: "/assets/profile/photo-frame.webp",
};

/** Compteurs d'un compte neuf (ou non connecté) : tout est à zéro. */
const NO_STATS: AchievementStats = {
  level: 1,
  wins: 0,
  losses: 0,
  matchesPlayed: 0,
  boostersOpened: 0,
  distinctCardsOwned: 0,
  ownedCardIds: [],
  ownsAbyssalCard: false,
  preconDecksUnlocked: 0,
  decksFullyOwned: 0,
  tutorialCompleted: false,
  voyagesCompleted: [],
  lifetime: {},
  records: {},
};

function toOption(
  kind: string,
  item: CosmeticSkin,
  owned: boolean,
  equipped: boolean,
  stats: AchievementStats
): CollectableOption {
  /*
   * Les deux règles de visibilité vivent dans le MOTEUR
   * (`game/cosmetics/unlock.ts`) : ce sont des règles de jeu, pas des
   * détails d'affichage, et elles s'y testent sans base. Ce module ne fait
   * que les appliquer.
   */
  const masked = isSlotMasked(item, owned);
  const artHidden = isArtVeiled(item, owned);
  return {
    id: item.id,
    label: masked ? "Collectable caché" : item.label,
    description: masked ? "Quelque chose se débloque ici. À toi de trouver quoi." : item.description,
    src: artHidden ? (VEILED_ART[kind] ?? item.src) : item.src,
    owned,
    equipped,
    artPending: item.artPending === true,
    masked,
    artHidden,
    requirement: owned || masked ? null : unlockLabel(item.unlock),
    progress: owned || masked ? null : unlockProgress(item.unlock, stats),
    priceTides: item.unlock.kind === "purchase" ? item.unlock.priceTides : null,
    priceTokens: item.unlock.kind === "purchaseTokens" ? item.unlock.priceTokens : null,
  };
}

/**
 * Ce que CE joueur voit : tout le catalogue, verrouillés compris.
 *
 * Un cosmétique qu'on ne voit pas ne donne envie de rien — sauf s'il est
 * déclaré caché, auquel cas c'est précisément le mystère qui fait l'objet.
 */
export async function loadCollectables(userId: string | null, preloaded?: AchievementStats | null): Promise<CollectablesView> {
  if (!userId) return buildView(false, NO_STATS, new Map(), new Map(), 0);

  try {
    const service = createSupabaseServiceRoleClient();
    const [stats, rows, currency] = await Promise.all([
      // `preloaded` : compteurs déjà lus par l'appelant (même convention que
      // `syncAchievements`) — inutile de refaire toutes les lectures.
      preloaded === undefined ? readAchievementStats(userId) : preloaded,
      service.from("player_cosmetics").select("cosmetic_kind, cosmetic_id, equipped").eq("user_id", userId),
      service.from("player_currency").select("balance").eq("user_id", userId).maybeSingle(),
    ]);

    if (rows.error) console.error("[loadCollectables] Lecture des cosmétiques impossible :", rows.error.message);

    const ownedByKind = new Map<string, Set<string>>();
    const equippedByKind = new Map<string, string>();
    for (const row of rows.data ?? []) {
      const set = ownedByKind.get(row.cosmetic_kind) ?? new Set<string>();
      set.add(row.cosmetic_id);
      ownedByKind.set(row.cosmetic_kind, set);
      if (row.equipped) equippedByKind.set(row.cosmetic_kind, row.cosmetic_id);
    }

    return buildView(true, stats ?? NO_STATS, ownedByKind, equippedByKind, currency.data?.balance ?? 0);
  } catch (error) {
    console.error("[loadCollectables] Échec :", error);
    return buildView(false, NO_STATS, new Map(), new Map(), 0);
  }
}

function buildView(
  isSignedIn: boolean,
  stats: AchievementStats,
  ownedByKind: Map<string, Set<string>>,
  equipped: Map<string, string>,
  balance: number
): CollectablesView {
  return {
    isSignedIn,
    level: stats.level,
    balance,
    families: COLLECTABLE_FAMILIES.map((family) => {
      const owned = ownedByKind.get(family.kind) ?? new Set<string>();
      /*
       * L'objet GRATUIT de la famille est équipé tant qu'aucune ligne ne
       * l'est : un cosmétique gratuit n'est jamais écrit en base (cf.
       * `equipCosmeticFor`), donc « aucune ligne équipée » veut dire « celui
       * d'origine ». Vaut pour les deux familles, et pour celles à venir.
       */
      const fallback = family.items.find((item) => isFree(item))?.id ?? null;
      const rawEquipped = equipped.get(family.kind) ?? null;
      const known = family.items.some((item) => item.id === rawEquipped);
      const current = known ? rawEquipped : fallback;

      return {
        kind: family.kind,
        label: family.label,
        equipped: current,
        options: family.items.map((item) =>
          toOption(family.kind, item, isFree(item) || owned.has(item.id), item.id === current, stats)
        ),
      };
    }),
  };
}

/**
 * Crédite tous les Collectables que les compteurs justifient et qui ne le
 * sont pas encore. Idempotent : la clé primaire de `player_cosmetics`
 * ignore ce qui est déjà là.
 *
 * Ne lève jamais et ne rend jamais la main sur une erreur : un cosmétique
 * manqué se rattrape à la synchronisation suivante, alors qu'une exception
 * remonterait jusqu'à l'action qui l'a déclenchée (fin de partie, ouverture
 * de booster).
 */
export async function syncCollectables(userId: string, preloaded?: AchievementStats | null): Promise<string[]> {
  try {
    const stats = preloaded === undefined ? await readAchievementStats(userId) : preloaded;
    if (!stats) return [];

    const service = createSupabaseServiceRoleClient();
    const { data: rows } = await service.from("player_cosmetics").select("cosmetic_kind, cosmetic_id").eq("user_id", userId);

    const already = new Set((rows ?? []).map((row) => `${row.cosmetic_kind}:${row.cosmetic_id}`));
    const purchased = new Set((rows ?? []).map((row) => row.cosmetic_id));

    const missing = unlockedCollectables(stats, purchased).filter((grant) => !already.has(`${grant.kind}:${grant.id}`));
    if (missing.length === 0) return [];

    // Écriture par FONCTION, jamais par `insert` : `player_cosmetics` est en
    // lecture seule pour l'application (cf. son type `Insert: never`), la
    // base reste seule à décider ce qui entre dans la table.
    const { data, error } = await service.rpc("grant_cosmetics", {
      p_user_id: userId,
      p_cosmetics: missing.map((grant) => ({ kind: grant.kind, id: grant.id, label: grant.label })),
    });
    if (error) {
      console.error("[syncCollectables] Octroi refusé :", error.message);
      return [];
    }
    return (data?.granted as string[] | undefined) ?? [];
  } catch (error) {
    console.error("[syncCollectables] Échec :", error);
    return [];
  }
}

/** Le prédicat, réexporté : les tests et le Market évaluent la même chose que la synchronisation. */
export { isCosmeticUnlocked };

export interface PurchaseCollectableResult {
  ok: boolean;
  error?: string;
  /** Solde après achat — le bandeau n'a pas à le relire. */
  balance?: number;
  /** Jetons de Préconstruit restants, après un achat en Jetons. */
  tokens?: number;
}

/** Ce que l'achat a coûté, et dans quelle monnaie — pour le panier et les revalidations. */
export interface CollectablePurchase extends PurchaseCollectableResult {
  /** Tides débitées (prix du catalogue), 0 pour un achat en Jetons. */
  spentTides: number;
  /** Jetons débités (prix du catalogue), 0 pour un achat en Tides. */
  spentTokens: number;
}

/**
 * Achète un Collectable pour `userId` — en Tides, ou en Jetons de
 * Préconstruit si c'est la monnaie que le catalogue lui donne. Partagé par
 * l'action unitaire `purchaseCollectable` et le panier du Market
 * (`checkoutCart`), qui déduisent tous deux le joueur de sa SESSION. Pas de
 * revalidation ici : l'appelant la fait (`spentTokens > 0` touche aussi
 * l'écran Decks, qui affiche les Jetons).
 *
 * Le prix n'est JAMAIS reçu du client : il est relu au catalogue à partir
 * de l'identifiant, et la MONNAIE avec lui. C'est le seul endroit où ils se
 * décident, et ça rend impossible l'achat à un prix choisi par l'appelant.
 */
export async function purchaseCollectableFor(userId: string, kind: string, id: string): Promise<CollectablePurchase> {
  const item = COLLECTABLE_FAMILIES.find((family) => family.kind === kind)?.items.find((entry) => entry.id === id);
  if (!item) return { ok: false, error: "Ce cosmétique n'existe pas.", spentTides: 0, spentTokens: 0 };

  const tokenPrice = collectableTokenPrice(kind, id);
  if (tokenPrice !== null) return purchaseWithTokens(userId, kind, id, item.label, tokenPrice);

  const price = collectablePrice(kind, id);
  if (price === null) return { ok: false, error: "Ce cosmétique n'est pas en vente.", spentTides: 0, spentTokens: 0 };

  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("purchase_cosmetic", {
      p_user_id: userId,
      p_cosmetic_kind: kind,
      p_cosmetic_id: id,
      p_label: item.label,
      p_price: price,
    });

    if (error) {
      console.error("[purchaseCollectable] Achat refusé :", error.message);
      return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant.", spentTides: 0, spentTokens: 0 };
    }
    if (!data?.ok) {
      // Les deux refus que le joueur doit comprendre ; le reste reste générique.
      if (data?.error === "insufficient_funds") return { ok: false, error: "Tides insuffisants.", spentTides: 0, spentTokens: 0 };
      if (data?.error === "already_owned") return { ok: false, error: "Tu le possèdes déjà.", spentTides: 0, spentTokens: 0 };
      return { ok: false, error: "L'achat n'a pas pu aboutir.", spentTides: 0, spentTokens: 0 };
    }
    return { ok: true, balance: data.balance, spentTides: price, spentTokens: 0 };
  } catch (cause) {
    console.error("[purchaseCollectable] Échec inattendu :", cause);
    return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant.", spentTides: 0, spentTokens: 0 };
  }
}

/**
 * L'achat en Jetons (`purchase_cosmetic_tokens`) : même garanties que
 * l'achat en Tides, dans l'autre monnaie du Market. Tant que la migration
 * `20261020120000_statistiques_a_vie` n'est pas appliquée, la fonction
 * n'existe pas : l'achat échoue proprement, sans rien débiter.
 */
async function purchaseWithTokens(userId: string, kind: string, id: string, label: string, priceTokens: number): Promise<CollectablePurchase> {
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("purchase_cosmetic_tokens", {
      p_user_id: userId,
      p_cosmetic_kind: kind,
      p_cosmetic_id: id,
      p_label: label,
      p_price_tokens: priceTokens,
    });

    if (error) {
      console.error("[purchaseCollectable] Achat en Jetons refusé :", error.message);
      return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant.", spentTides: 0, spentTokens: 0 };
    }
    if (!data?.ok) {
      if (data?.error === "insufficient_tokens") return { ok: false, error: "Jetons de Préconstruit insuffisants.", spentTides: 0, spentTokens: 0 };
      if (data?.error === "already_owned") return { ok: false, error: "Tu le possèdes déjà.", spentTides: 0, spentTokens: 0 };
      return { ok: false, error: "L'achat n'a pas pu aboutir.", spentTides: 0, spentTokens: 0 };
    }
    return { ok: true, tokens: data.tokens, spentTides: 0, spentTokens: priceTokens };
  } catch (cause) {
    console.error("[purchaseCollectable] Échec inattendu :", cause);
    return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant.", spentTides: 0, spentTokens: 0 };
  }
}
