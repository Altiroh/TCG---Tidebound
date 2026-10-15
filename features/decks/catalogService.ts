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
import { shelfView } from "@/features/decks/deckEntries";
import { ensureStarterDecks, type MissionTutorialStatus } from "@/features/onboarding/starterMission";
import { recordQuestEvent } from "@/features/quests/questService";

/**
 * Préconstruits — opérations SERVEUR (pas de `"use server"`).
 *
 * UN SEUL RAYON, DEUX PORTES (décision du 15/10/2026) :
 *   - la PREMIÈRE MISSION (tutoriel terminé ou passé) offre les trois
 *     starters (`source = 'starter'`, `features/onboarding/starterMission.ts`).
 *     Elle remplace l'ancien choix gratuit d'un préconstruit (`'borrowed'`),
 *     dont les déblocages restent valides ;
 *   - les AUTRES coûtent chacun un Jeton de Préconstruit — seulement ceux du
 *     rayon (`offer: "shop"`) : ni les starters, ni les decks retirés.
 *
 * `player_deck_unlocks.source` note par quelle porte le deck est entré ; ce
 * n'est jamais une famille de deck.
 *
 * Dans tous les cas, AUCUNE carte n'est créditée à la collection : c'est
 * tout le principe du prêt. « Le premier deck ne doit pas injecter un gros
 * volume de cartes gratuites dans la collection » — le joueur joue le deck
 * tout de suite, et le possède progressivement.
 */

/** Un deck du catalogue tel que l'interface doit l'afficher. */
export interface CatalogDeckView {
  deck: CatalogDeck;
  ownership: DeckOwnership;
  /** `true` si le joueur a débloqué ce deck (première mission, ancien choix gratuit, ou Jeton dépensé). */
  unlocked: boolean;
}

export interface DeckCatalogView {
  /**
   * Le rayon tel que CE joueur le voit, verrouillés compris : les starters
   * en tête, puis le rayon au Jeton ; un deck retiré n'y figure que s'il
   * l'a débloqué (`isDeckOnShelf`).
   */
  decks: CatalogDeckView[];
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
 * avant achat » (§4, §13). Les RETIRÉS, eux, ne restent visibles qu'à qui
 * les a débloqués.
 *
 * `preloadedOwnedCounts` : la collection déjà lue (ou en cours de lecture)
 * par l'appelant — la page Collection lit `player_cards` pour son propre
 * compte, inutile de la relire ici. Résolue à `null`, on relit nous-mêmes.
 * La possession se lit EN MÊME TEMPS que les déblocages, pas avant.
 */
export async function readDeckCatalog(
  userId: string | null,
  preloadedOwnedCounts?: PromiseLike<Record<string, number> | null>
): Promise<DeckCatalogView> {
  const ownedCountsPromise: Promise<Record<string, number>> = !userId
    ? Promise.resolve({})
    : preloadedOwnedCounts
      ? Promise.resolve(preloadedOwnedCounts).then((counts) => counts ?? readOwnedCounts(userId), () => readOwnedCounts(userId))
      : readOwnedCounts(userId);
  let unlockedIds = new Set<string>();
  let preconTokens = 0;

  if (userId) {
    try {
      const service = createSupabaseServiceRoleClient();
      const [unlocks, progression, onboarding] = await Promise.all([
        service.from("player_deck_unlocks").select("deck_id").eq("user_id", userId),
        service.from("player_progression").select("precon_tokens").eq("user_id", userId).maybeSingle(),
        service.from("player_onboarding").select("tutorial_status").eq("user_id", userId).maybeSingle(),
      ]);
      // Rattrapage de la première mission : un compte qui arrive ici avant
      // l'accueil reçoit aussi ses starters (idempotent).
      unlockedIds = await ensureStarterDecks(
        userId,
        onboarding.data?.tutorial_status as MissionTutorialStatus | undefined,
        (unlocks.data ?? []).map((row) => row.deck_id)
      );
      preconTokens = progression.data?.precon_tokens ?? 0;
    } catch (error) {
      console.error("[readDeckCatalog] Lecture impossible :", error);
    }
  }
  const ownedCounts = await ownedCountsPromise;

  const view = (deck: CatalogDeck): CatalogDeckView => ({
    deck,
    ownership: deckOwnership(deck.cardIds, ownedCounts),
    unlocked: unlockedIds.has(deck.id),
  });

  return { decks: shelfView(PRECON_DECKS.map(view)), preconTokens };
}

export interface UnlockResult {
  ok: boolean;
  error?: string;
  deckId?: string;
  /** Jetons restants après un déblocage de préconstruit. */
  tokens?: number;
}

/**
 * Débloque un préconstruit en dépensant un Jeton — atomique côté base.
 *
 * Seul le rayon au Jeton (`offer: "shop"`) s'achète : un starter vient de
 * la première mission, un deck retiré ne se vend plus. Refusé ICI, donc
 * aussi pour le panier du Market (`checkoutCartFor`), et refusé encore par
 * la base (`unlock_precon_deck`, migration 20261104120000).
 */
export async function unlockPreconDeck(userId: string, deckId: string): Promise<UnlockResult> {
  const deck = catalogDeckById(deckId);
  if (!deck || !isPreconDeckId(deckId)) return { ok: false, error: "Ce deck n'est pas un préconstruit." };
  if (deck.offer === "starter") return { ok: false, error: "Ce deck est offert par la première mission : il ne s'achète pas." };
  if (deck.offer === "retired") return { ok: false, error: "Ce préconstruit a quitté le rayon." };
  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("unlock_precon_deck", { p_user_id: userId, p_deck_id: deckId });
    if (error) {
      console.error("[unlockPreconDeck] Refusé :", error.message);
      return { ok: false, error: "Déblocage impossible pour le moment." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Déblocage impossible." };
    // « Premier préconstruit débloqué » est un exploit (§10) ; « Nouvel équipage », une quête.
    await Promise.all([syncAchievements(userId), recordQuestEvent(userId, `unlock:${deckId}`, { unlock_precon_decks: 1 })]);
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
