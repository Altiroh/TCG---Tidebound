import {
  COLLECTABLE_FAMILIES,
  isCosmeticUnlocked,
  isFree,
  unlockedCollectables,
  unlockLabel,
  unlockProgress,
  type CosmeticSkin,
} from "@/game";
import type { AchievementStats } from "@/game/achievements";
import { readAchievementStats } from "@/features/achievements/achievementService";
import { SHIP_FRAME_COSMETIC_KIND } from "@/game";
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
   * restent lisibles. Deux cas : un emplacement masqué (qui cache tout), et
   * un cadre de Navire pas encore débloqué — on sait ce qu'il faut faire
   * pour l'avoir, on ne voit pas ce qu'on aura.
   */
  artHidden: boolean;
  /** Condition en clair (`null` si masqué ou déjà obtenu). */
  requirement: string | null;
  /** Ce qu'il reste à faire, quand c'est chiffrable (« encore 12 »). */
  progress: string | null;
  /** Prix, si le Collectable s'achète au Market. */
  priceTides: number | null;
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
};

function toOption(
  kind: string,
  item: CosmeticSkin,
  owned: boolean,
  equipped: boolean,
  stats: AchievementStats
): CollectableOption {
  const masked = !owned && item.hidden === true;
  // Un cadre de Navire non débloqué reste sous le voile : c'est une grande
  // pièce montrée en grand, et la voir en entier avant de l'avoir lui ôte
  // tout son effet le jour où elle tombe. Le nom et la condition, eux,
  // restent lisibles — on doit savoir ce qu'on vise.
  const artHidden = masked || (!owned && kind === SHIP_FRAME_COSMETIC_KIND);
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
  };
}

/**
 * Ce que CE joueur voit : tout le catalogue, verrouillés compris.
 *
 * Un cosmétique qu'on ne voit pas ne donne envie de rien — sauf s'il est
 * déclaré caché, auquel cas c'est précisément le mystère qui fait l'objet.
 */
export async function loadCollectables(userId: string | null): Promise<CollectablesView> {
  if (!userId) return buildView(false, NO_STATS, new Map(), new Map(), 0);

  try {
    const service = createSupabaseServiceRoleClient();
    const [stats, rows, currency] = await Promise.all([
      readAchievementStats(userId),
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
export async function syncCollectables(userId: string): Promise<string[]> {
  try {
    const stats = await readAchievementStats(userId);
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
