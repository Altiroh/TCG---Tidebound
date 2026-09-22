import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  PRECON_DECKS,
  catalogDeckById,
  deckOwnership,
  isPreconDeckId,
  type CatalogDeck,
  type DeckOwnership,
} from "@/game";
import { syncAchievements } from "@/features/achievements/achievementService";

/**
 * Préconstruits — opérations SERVEUR (pas de `"use server"`).
 *
 * UN SEUL RAYON, DEUX PORTES (Notion « Progression joueur » §3 et §4) :
 *   - le PREMIER préconstruit est gratuit, choisi une fois depuis la
 *     Collection ;
 *   - les SUIVANTS coûtent chacun un Jeton de Préconstruit.
 *
 * La base ne change pas avec la fusion du 22/09/2026 : `player_deck_unlocks
 * .source` valait déjà 'borrowed' ou 'precon', et c'est exactement ce qu'on
 * veut continuer à noter — par quelle porte le deck est entré. Les RPC
 * gardent donc leurs noms (`claim_borrowed_deck`, `unlock_precon_deck`) ;
 * ce qui disparaît, c'est l'idée qu'il existait deux ESPÈCES de decks.
 *
 * Dans les deux cas, AUCUNE carte n'est créditée à la collection : c'est
 * tout le principe du prêt. « Le premier deck ne doit pas injecter un gros
 * volume de cartes gratuites dans la collection » — le joueur joue le deck
 * tout de suite, et le possède progressivement.
 */

/** Un deck du catalogue tel que l'interface doit l'afficher. */
export interface CatalogDeckView {
  deck: CatalogDeck;
  ownership: DeckOwnership;
  /** `true` si le joueur a débloqué ce deck (choix gratuit, ou Jeton dépensé). */
  unlocked: boolean;
}

export interface DeckCatalogView {
  /** Tout le rayon, verrouillés compris — un seul, depuis la fusion. */
  decks: CatalogDeckView[];
  /** Le préconstruit pris avec le choix GRATUIT — un seul, pour toujours. */
  freeDeckId: string | null;
  preconTokens: number;
}

/** Exemplaires possédés par carte, pour un joueur. */
export async function readOwnedCounts(userId: string): Promise<Record<string, number>> {
  try {
    const service = createSupabaseServiceRoleClient();
    const { data } = await service.from("player_cards").select("card_id, quantity").eq("user_id", userId).gt("quantity", 0);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) counts[row.card_id] = row.quantity;
    return counts;
  } catch (error) {
    console.error("[readOwnedCounts] Lecture impossible :", error);
    return {};
  }
}

/**
 * Tout le rayon, possession calculée. Les VERROUILLÉS sont inclus : « les
 * préconstruits verrouillés doivent rester visibles » et « consultables
 * avant achat » (§4, §13).
 */
export async function readDeckCatalog(userId: string | null): Promise<DeckCatalogView> {
  const ownedCounts = userId ? await readOwnedCounts(userId) : {};
  let unlockedIds = new Set<string>();
  let freeDeckId: string | null = null;
  let preconTokens = 0;

  if (userId) {
    try {
      const service = createSupabaseServiceRoleClient();
      const [unlocks, progression] = await Promise.all([
        service.from("player_deck_unlocks").select("deck_id, source").eq("user_id", userId),
        service.from("player_progression").select("precon_tokens").eq("user_id", userId).maybeSingle(),
      ]);
      unlockedIds = new Set((unlocks.data ?? []).map((row) => row.deck_id));
      // `source = 'borrowed'` reste le marqueur du choix gratuit en base :
      // c'est la PORTE d'entrée, pas une famille de deck.
      freeDeckId = (unlocks.data ?? []).find((row) => row.source === "borrowed")?.deck_id ?? null;
      preconTokens = progression.data?.precon_tokens ?? 0;
    } catch (error) {
      console.error("[readDeckCatalog] Lecture impossible :", error);
    }
  }

  const view = (deck: CatalogDeck): CatalogDeckView => ({
    deck,
    ownership: deckOwnership(deck.cardIds, ownedCounts),
    unlocked: unlockedIds.has(deck.id),
  });

  return { decks: PRECON_DECKS.map(view), freeDeckId, preconTokens };
}

export interface UnlockResult {
  ok: boolean;
  error?: string;
  deckId?: string;
  /** Jetons restants après un déblocage de préconstruit. */
  tokens?: number;
}

/** Prend le préconstruit GRATUIT — une seule fois par compte. */
export async function claimFreePreconDeck(userId: string, deckId: string): Promise<UnlockResult> {
  if (!isPreconDeckId(deckId)) return { ok: false, error: "Ce deck n'est pas un préconstruit." };
  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("claim_borrowed_deck", { p_user_id: userId, p_deck_id: deckId });
    if (error) {
      console.error("[claimFreePreconDeck] Refusé :", error.message);
      return { ok: false, error: "Choix impossible pour le moment." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Choix impossible." };
    return { ok: true, deckId };
  } catch (error) {
    console.error("[claimFreePreconDeck] Échec :", error);
    return { ok: false, error: "Choix impossible pour le moment." };
  }
}

/** Débloque un préconstruit en dépensant un Jeton — atomique côté base. */
export async function unlockPreconDeck(userId: string, deckId: string): Promise<UnlockResult> {
  if (!isPreconDeckId(deckId)) return { ok: false, error: "Ce deck n'est pas un préconstruit." };
  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("unlock_precon_deck", { p_user_id: userId, p_deck_id: deckId });
    if (error) {
      console.error("[unlockPreconDeck] Refusé :", error.message);
      return { ok: false, error: "Déblocage impossible pour le moment." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Déblocage impossible." };
    // « Premier préconstruit débloqué » est un exploit (§10).
    await syncAchievements(userId);
    return { ok: true, deckId, tokens: data.tokens };
  } catch (error) {
    console.error("[unlockPreconDeck] Échec :", error);
    return { ok: false, error: "Déblocage impossible pour le moment." };
  }
}

/** Les préconstruits que le joueur peut JOUER — ceux qu'il a débloqués. */
export async function readPlayableCatalogDecks(userId: string): Promise<CatalogDeck[]> {
  try {
    const service = createSupabaseServiceRoleClient();
    const { data } = await service.from("player_deck_unlocks").select("deck_id").eq("user_id", userId);
    return (data ?? []).map((row) => catalogDeckById(row.deck_id)).filter((deck): deck is CatalogDeck => Boolean(deck));
  } catch (error) {
    console.error("[readPlayableCatalogDecks] Lecture impossible :", error);
    return [];
  }
}
