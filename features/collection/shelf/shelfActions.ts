"use server";

import { getCardDefinition } from "@/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { NOTEBOOK_LIMIT, normalizeNotebookName, sortNotebooks, type CardNotebook, type CardShelf } from "@/features/collection/shelf/shelf";

/**
 * Favoris et CARNETS du joueur connecté — lus et écrits sur le COMPTE
 * (tables de la migration 20261014120000, sous RLS : chacun ne touche que
 * les siens). Règles de nom et plafonds : `shelf.ts`.
 *
 * Jamais d'exception vers l'écran : une étagère indisponible (hors
 * connexion, migration pas encore passée) rend `null` à la lecture et un
 * message clair à l'écriture — le catalogue, lui, reste consultable.
 */

export type ShelfResult = { ok: true } | { ok: false; error: string };
export type NotebookResult = { ok: true; notebook: CardNotebook } | { ok: false; error: string };

type Supabase = ReturnType<typeof createSupabaseServerClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = "Carnets indisponibles pour le moment (base pas à jour ?).";
const SIGNED_OUT = "Connecte-toi pour garder tes favoris et tes carnets.";

function isKnownCard(cardId: string): boolean {
  if (!cardId || cardId.length > 120) return false;
  try {
    getCardDefinition(cardId);
    return true;
  } catch {
    return false;
  }
}

async function session(): Promise<{ supabase: Supabase; userId: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return { supabase: createSupabaseServerClient(), userId: user.id };
}

async function guarded<T extends { ok: boolean }>(label: string, run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    console.error(`[${label}] Échec inattendu :`, error);
    return { ok: false, error: UNAVAILABLE };
  }
}

/** Le carnet appartient-il au joueur ? (La RLS le garantit déjà ; ceci donne un message clair.) */
async function ownsNotebook(supabase: Supabase, userId: string, notebookId: string): Promise<boolean> {
  if (!UUID.test(notebookId)) return false;
  const { data } = await supabase.from("player_card_notebooks").select("id").eq("id", notebookId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

async function touchNotebook(supabase: Supabase, notebookId: string): Promise<void> {
  await supabase.from("player_card_notebooks").update({ updated_at: new Date().toISOString() }).eq("id", notebookId);
}

/**
 * L'étagère entière du joueur connecté. `null` hors connexion ou si les
 * tables n'existent pas encore : l'écran masque alors cœurs et carnets.
 * Les cartes retirées du catalogue sont ignorées.
 */
export async function fetchCardShelf(): Promise<CardShelf | null> {
  try {
    const current = await session();
    if (!current) return null;
    const { supabase, userId } = current;
    const [favorites, notebooks] = await Promise.all([
      supabase.from("player_card_favorites").select("card_id, created_at").eq("user_id", userId).order("created_at", { ascending: true }),
      supabase.from("player_card_notebooks").select("id, name, cover_card_id, updated_at").eq("user_id", userId),
    ]);
    if (favorites.error || notebooks.error) return null;

    const ids = (notebooks.data ?? []).map((row) => row.id);
    const cards = ids.length
      ? await supabase.from("player_card_notebook_cards").select("notebook_id, card_id, added_at").in("notebook_id", ids).order("added_at", { ascending: true })
      : { data: [], error: null };
    if (cards.error) return null;

    const byNotebook = new Map<string, string[]>();
    for (const row of cards.data ?? []) {
      if (!isKnownCard(row.card_id)) continue;
      byNotebook.set(row.notebook_id, [...(byNotebook.get(row.notebook_id) ?? []), row.card_id]);
    }
    return {
      favorites: (favorites.data ?? []).map((row) => row.card_id).filter(isKnownCard),
      notebooks: sortNotebooks(
        (notebooks.data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          coverCardId: row.cover_card_id,
          cardIds: byNotebook.get(row.id) ?? [],
          updatedAt: row.updated_at,
        }))
      ),
    };
  } catch (error) {
    console.error("[fetchCardShelf] Lecture impossible :", error);
    return null;
  }
}

/** Met une carte en favori, ou l'en retire. */
export async function setCardFavorite(cardId: string, favorite: boolean): Promise<ShelfResult> {
  return guarded("setCardFavorite", async () => {
    if (!isKnownCard(cardId)) return { ok: false, error: "Carte inconnue." };
    const current = await session();
    if (!current) return { ok: false, error: SIGNED_OUT };
    const { supabase, userId } = current;
    const { error } = favorite
      ? await supabase.from("player_card_favorites").upsert({ user_id: userId, card_id: cardId }, { onConflict: "user_id,card_id", ignoreDuplicates: true })
      : await supabase.from("player_card_favorites").delete().eq("user_id", userId).eq("card_id", cardId);
    if (error) return { ok: false, error: UNAVAILABLE };
    return { ok: true };
  });
}

/** Ouvre un nouveau carnet, en y rangeant d'emblée `firstCardId` s'il est donné (création depuis une carte). */
export async function createNotebook(rawName: string, firstCardId?: string): Promise<NotebookResult> {
  return guarded("createNotebook", async () => {
    const named = normalizeNotebookName(rawName);
    if (!named.ok) return named;
    if (firstCardId !== undefined && !isKnownCard(firstCardId)) return { ok: false, error: "Carte inconnue." };
    const current = await session();
    if (!current) return { ok: false, error: SIGNED_OUT };
    const { supabase, userId } = current;

    const { data, error } = await supabase
      .from("player_card_notebooks")
      .insert({ user_id: userId, name: named.name })
      .select("id, name, cover_card_id, updated_at")
      .single();
    if (error || !data) {
      if (error?.code === "23505") return { ok: false, error: "Tu as déjà un carnet de ce nom." };
      if (error?.message?.includes("notebook_limit")) return { ok: false, error: `Tu as atteint ${NOTEBOOK_LIMIT} carnets : range ou supprime-en un.` };
      return { ok: false, error: UNAVAILABLE };
    }
    const cardIds: string[] = [];
    if (firstCardId) {
      const added = await supabase.from("player_card_notebook_cards").insert({ notebook_id: data.id, card_id: firstCardId });
      if (!added.error) cardIds.push(firstCardId);
    }
    return { ok: true, notebook: { id: data.id, name: data.name, coverCardId: data.cover_card_id, cardIds, updatedAt: data.updated_at } };
  });
}

export async function renameNotebook(notebookId: string, rawName: string): Promise<ShelfResult> {
  return guarded("renameNotebook", async () => {
    const named = normalizeNotebookName(rawName);
    if (!named.ok) return named;
    const current = await session();
    if (!current) return { ok: false, error: SIGNED_OUT };
    const { supabase, userId } = current;
    if (!(await ownsNotebook(supabase, userId, notebookId))) return { ok: false, error: "Carnet introuvable." };
    const { error } = await supabase
      .from("player_card_notebooks")
      .update({ name: named.name, updated_at: new Date().toISOString() })
      .eq("id", notebookId);
    if (error) return { ok: false, error: error.code === "23505" ? "Tu as déjà un carnet de ce nom." : UNAVAILABLE };
    return { ok: true };
  });
}

/** Supprime un carnet et son rangement — jamais les cartes elles-mêmes, ni les favoris. */
export async function deleteNotebook(notebookId: string): Promise<ShelfResult> {
  return guarded("deleteNotebook", async () => {
    const current = await session();
    if (!current) return { ok: false, error: SIGNED_OUT };
    const { supabase, userId } = current;
    if (!(await ownsNotebook(supabase, userId, notebookId))) return { ok: false, error: "Carnet introuvable." };
    const { error } = await supabase.from("player_card_notebooks").delete().eq("id", notebookId);
    if (error) return { ok: false, error: UNAVAILABLE };
    return { ok: true };
  });
}

/** Choisit la carte de couverture (`null` : la première rangée reprend la place). */
export async function setNotebookCover(notebookId: string, cardId: string | null): Promise<ShelfResult> {
  return guarded("setNotebookCover", async () => {
    if (cardId !== null && !isKnownCard(cardId)) return { ok: false, error: "Carte inconnue." };
    const current = await session();
    if (!current) return { ok: false, error: SIGNED_OUT };
    const { supabase, userId } = current;
    if (!(await ownsNotebook(supabase, userId, notebookId))) return { ok: false, error: "Carnet introuvable." };
    const { error } = await supabase.from("player_card_notebooks").update({ cover_card_id: cardId }).eq("id", notebookId);
    if (error) return { ok: false, error: UNAVAILABLE };
    return { ok: true };
  });
}

/** Range une carte dans un carnet, ou l'en retire. */
export async function setCardInNotebook(notebookId: string, cardId: string, inside: boolean): Promise<ShelfResult> {
  return guarded("setCardInNotebook", async () => {
    if (!isKnownCard(cardId)) return { ok: false, error: "Carte inconnue." };
    const current = await session();
    if (!current) return { ok: false, error: SIGNED_OUT };
    const { supabase, userId } = current;
    if (!(await ownsNotebook(supabase, userId, notebookId))) return { ok: false, error: "Carnet introuvable." };
    const { error } = inside
      ? await supabase
          .from("player_card_notebook_cards")
          .upsert({ notebook_id: notebookId, card_id: cardId }, { onConflict: "notebook_id,card_id", ignoreDuplicates: true })
      : await supabase.from("player_card_notebook_cards").delete().eq("notebook_id", notebookId).eq("card_id", cardId);
    if (error) return { ok: false, error: UNAVAILABLE };
    await touchNotebook(supabase, notebookId);
    return { ok: true };
  });
}
