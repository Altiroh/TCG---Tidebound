import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { unlockedAchievements, type AchievementStats } from "@/game/achievements";
import { deckOwnership } from "@/game";
import { catalogDeckById } from "@/game";

/**
 * Exploits — opérations SERVEUR. Pas de directive `"use server"` : ces
 * fonctions prennent un identifiant de joueur en paramètre et ne doivent
 * jamais devenir des Server Actions joignables depuis le navigateur.
 *
 * MODÈLE : un exploit n'est pas déclenché par un événement, il est ÉVALUÉ à
 * partir des compteurs déjà persistés. Conséquences voulues :
 *   - rien à rejouer si une synchronisation est manquée (panne, partie non
 *     enregistrée) : la suivante rattrape ;
 *   - un exploit AJOUTÉ plus tard se débloque immédiatement pour les
 *     comptes qui remplissent déjà sa condition ;
 *   - l'anti-double-claim est la clé primaire de `player_achievements`, pas
 *     une vérification applicative.
 */

/**
 * Lit tous les compteurs dont dépendent les exploits, en une passe.
 *
 * `null` couvre les deux cas où l'on ne sait rien : le joueur n'a pas encore
 * de ligne de progression, et la base n'a pas répondu. Ne lève jamais — pas
 * même si la clé de service manque, auquel cas la création du client échoue
 * avant la première lecture. Un exploit manqué se rattrape à la partie
 * suivante ; une exception, elle, remonterait jusqu'à l'écran.
 */
export async function readAchievementStats(userId: string): Promise<AchievementStats | null> {
  try {
    return await readStats(userId);
  } catch (error) {
    console.error("[readAchievementStats] Lecture impossible :", error);
    return null;
  }
}

async function readStats(userId: string): Promise<AchievementStats | null> {
  const service = createSupabaseServiceRoleClient();

  const [progression, onboarding, unlocks, cards, boosters, losses] = await Promise.all([
    service.from("player_progression").select("level, xp_total, matches_played, pvp_wins").eq("user_id", userId).maybeSingle(),
    service.from("player_onboarding").select("tutorial_status").eq("user_id", userId).maybeSingle(),
    service.from("player_deck_unlocks").select("deck_id, source").eq("user_id", userId),
    service.from("player_cards").select("card_id, quantity").eq("user_id", userId).gt("quantity", 0),
    service.from("booster_openings").select("id", { count: "exact", head: true }).eq("user_id", userId),
    // Lecture SÉPARÉE, et pas une colonne de plus dans le `select` ci-dessus :
    // `losses` est arrivé par une migration postérieure
    // (`20260923120000_player_losses`). Groupée, une colonne encore absente
    // ferait échouer toute la lecture — donc plus aucun exploit, plus aucun
    // Collectable, pour un compteur qui n'en concerne que deux. Isolée, elle
    // retombe à zéro et le reste continue de vivre.
    service.from("player_progression").select("losses").eq("user_id", userId).maybeSingle(),
  ]);

  if (!progression.data) return null;

  const owned: Record<string, number> = {};
  for (const row of cards.data ?? []) owned[row.card_id] = row.quantity;

  // « Compléter réellement un préconstruit » (§10) : un deck débloqué dont
  // le joueur possède désormais TOUS les exemplaires.
  let decksFullyOwned = 0;
  for (const unlock of unlocks.data ?? []) {
    const deck = catalogDeckById(unlock.deck_id);
    if (deck && deckOwnership(deck.cardIds, owned).complete) decksFullyOwned += 1;
  }

  // La rareté fait autorité côté base (`cards.rarity`), jamais côté code.
  const ownedIds = Object.keys(owned);
  let ownsAbyssalCard = false;
  if (ownedIds.length > 0) {
    const { data: abyssal } = await service
      .from("cards")
      .select("id")
      .eq("rarity", "abyssal")
      .in("id", ownedIds)
      .limit(1);
    ownsAbyssalCard = (abyssal?.length ?? 0) > 0;
  }

  if (losses.error) console.warn("[readAchievementStats] Compteur de défaites indisponible :", losses.error.message);

  return {
    level: progression.data.level ?? 1,
    // « Première victoire » sans distinction de mode (§10).
    wins: progression.data.pvp_wins ?? 0,
    losses: (losses.data as { losses?: number } | null)?.losses ?? 0,
    matchesPlayed: progression.data.matches_played ?? 0,
    boostersOpened: boosters.count ?? 0,
    distinctCardsOwned: ownedIds.length,
    ownedCardIds: ownedIds,
    ownsAbyssalCard,
    preconDecksUnlocked: (unlocks.data ?? []).filter((row) => row.source === "precon_token").length,
    decksFullyOwned,
    tutorialCompleted: onboarding.data?.tutorial_status === "completed",
  };
}

/**
 * Débloque tous les exploits que les compteurs actuels justifient et qui ne
 * le sont pas encore. Idempotent : la base ignore les codes déjà présents.
 * Ne lève jamais — un exploit manqué ne doit pas faire échouer l'action qui
 * l'a déclenché.
 */
export async function syncAchievements(userId: string, preloaded?: AchievementStats | null): Promise<string[]> {
  try {
    // `preloaded` : compteurs déjà lus par l'appelant (le profil s'en sert
    // aussi pour les jauges) — inutile de refaire les six lectures.
    const stats = preloaded === undefined ? await readAchievementStats(userId) : preloaded;
    if (!stats) return [];

    const candidates = unlockedAchievements(stats);
    if (candidates.length === 0) return [];

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("grant_achievements", {
      p_user_id: userId,
      p_achievements: candidates.map((achievement) => ({ code: achievement.code, tides: achievement.rewardTides })),
    });
    if (error) {
      console.error("[syncAchievements] Octroi refusé :", error.message);
      return [];
    }
    return (data?.granted as string[] | undefined) ?? [];
  } catch (error) {
    console.error("[syncAchievements] Échec :", error);
    return [];
  }
}
