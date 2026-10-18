import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { hasArtwork, isCardArtwork } from "@/game/cosmetics/artworks";
import { isCardFinish } from "@/game/cosmetics/finishes";
import { editionKey, isClassicEdition, type CardEdition, type OwnedEdition } from "@/game/cosmetics/editions";

/**
 * ÉDITIONS possédées et affichées (Collection visuelle V2, 18/10/2026) —
 * module SERVEUR, clé service_role : les tables n'ont aucune policy pour le
 * navigateur.
 *
 * Tolérant à une base sans la migration 20261108120000 : la lecture retombe
 * sur `player_card_finishes` (finitions sur la Classique), l'écriture des
 * finitions aussi, et l'édition affichée en partie reste la Classique. Une
 * édition qui ne s'écrit pas est signalée, jamais bloquante — l'exemplaire,
 * lui, est déjà acquis.
 */
type Service = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Éditions rares possédées, par carte, la plus rare en dernier. */
export type OwnedEditionsByCard = Record<string, OwnedEdition[]>;

export async function readOwnedEditions(userId: string, service: Service = createSupabaseServiceRoleClient()): Promise<OwnedEditionsByCard> {
  const result: OwnedEditionsByCard = {};
  const push = (cardId: string, edition: OwnedEdition) => (result[cardId] ??= []).push(edition);
  try {
    const editions = await service
      .from("player_card_editions")
      .select("card_id, artwork, finish, quantity")
      .eq("user_id", userId)
      .gt("quantity", 0);
    if (!editions.error) {
      for (const row of editions.data ?? []) {
        const artwork: string = row.artwork;
        const finish: string = row.finish;
        if (!isCardArtwork(artwork) || !isCardFinish(finish)) continue;
        const edition = { artwork, finish, quantity: row.quantity };
        if (!isClassicEdition(edition)) push(row.card_id, edition);
      }
      return result;
    }
    console.warn("[readOwnedEditions] Éditions illisibles, repli sur les finitions :", editions.error.message);

    const finishes = await service.from("player_card_finishes").select("card_id, finish, quantity").eq("user_id", userId).gt("quantity", 0);
    if (finishes.error) {
      console.warn("[readOwnedEditions] Finitions illisibles :", finishes.error.message);
      return result;
    }
    for (const row of finishes.data ?? []) {
      const finish: string = row.finish;
      if (isCardFinish(finish) && finish !== "classique") push(row.card_id, { artwork: "classique", finish, quantity: row.quantity });
    }
  } catch (error) {
    console.warn("[readOwnedEditions] Lecture impossible :", error);
  }
  return result;
}

/** Clés `<cardId>|<editionKey>` des éditions possédées — pour le badge « Nouveau » du tirage. */
export function ownedEditionKeys(editions: OwnedEditionsByCard): Set<string> {
  const keys = new Set<string>();
  for (const [cardId, list] of Object.entries(editions)) for (const edition of list) keys.add(`${cardId}|${editionKey(edition)}`);
  return keys;
}

/** Ajoute à la collection les éditions rares tirées à une ouverture. */
export async function addOwnedEditions(service: Service, userId: string, cards: ReadonlyArray<{ cardId: string } & CardEdition>): Promise<void> {
  const rares = cards.filter((card) => !isClassicEdition(card));
  if (rares.length === 0) return;
  const written = await service.rpc("add_card_editions", {
    p_user_id: userId,
    p_card_ids: rares.map((card) => card.cardId),
    p_artworks: rares.map((card) => card.artwork),
    p_finishes: rares.map((card) => card.finish),
  });
  if (!written.error && written.data?.ok) return;
  console.warn("[addOwnedEditions] Éditions non conservées, repli sur les finitions :", written.error?.message ?? written.data?.error);

  // Base sans la migration : les finitions de la Classique gardent leur table d'origine.
  const finitions = rares.filter((card) => card.artwork === "classique");
  if (finitions.length === 0) return;
  const fallback = await service.rpc("add_card_finishes", {
    p_user_id: userId,
    p_card_ids: finitions.map((card) => card.cardId),
    p_finishes: finitions.map((card) => card.finish),
  });
  if (fallback.error || !fallback.data?.ok) console.warn("[addOwnedEditions] Finitions non conservées :", fallback.error?.message ?? fallback.data?.error);
}

/** Édition montrée en partie, par joueur puis par carte. Rien pour une Classique. */
export type DisplayedEditions = Record<string, Record<string, CardEdition>>;

export async function readDisplayedEditions(userIds: readonly string[], service: Service = createSupabaseServiceRoleClient()): Promise<DisplayedEditions> {
  const result: DisplayedEditions = {};
  const distinct = Array.from(new Set(userIds.filter(Boolean)));
  for (const id of distinct) result[id] = {};
  if (distinct.length === 0) return result;
  try {
    const { data, error } = await service.from("player_card_display").select("user_id, card_id, artwork, finish").in("user_id", distinct);
    if (error) {
      console.warn("[readDisplayedEditions] Éditions affichées illisibles :", error.message);
      return result;
    }
    for (const row of data ?? []) {
      const artwork: string = row.artwork;
      const finish: string = row.finish;
      // Une illustration retirée du catalogue (Full-Art à repeindre) retombe sur la Classique.
      if (!isCardArtwork(artwork) || !isCardFinish(finish) || !hasArtwork(row.card_id, artwork)) continue;
      const target = result[row.user_id];
      if (target) target[row.card_id] = { artwork, finish };
    }
  } catch (error) {
    console.warn("[readDisplayedEditions] Lecture impossible :", error);
  }
  return result;
}
