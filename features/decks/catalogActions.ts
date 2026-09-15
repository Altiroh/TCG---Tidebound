"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimBorrowedDeck, readDeckCatalog, unlockPreconDeck, type DeckCatalogView, type UnlockResult } from "@/features/decks/catalogService";

/**
 * Decks fournis par le jeu — Server Actions exposées au navigateur.
 *
 * Le joueur vient toujours de la session ; l'identifiant de deck, lui, est
 * validé contre le catalogue TypeScript côté serveur
 * (`isBorrowedDeckId`/`isPreconDeckId`), pour qu'aucun appel ne puisse
 * débloquer autre chose que ce que la spec prévoit.
 */

export interface DeckCatalogSummary extends DeckCatalogView {
  isSignedIn: boolean;
}

export async function fetchDeckCatalog(): Promise<DeckCatalogSummary> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const view = await readDeckCatalog(user?.id ?? null);
    return { ...view, isSignedIn: Boolean(user) };
  } catch (error) {
    console.error("[fetchDeckCatalog] Lecture impossible :", error);
    const view = await readDeckCatalog(null);
    return { ...view, isSignedIn: false };
  }
}

/** Choisit le deck d'emprunt gratuit (§3) — une seule fois par compte. */
export async function chooseBorrowedDeck(deckId: string): Promise<UnlockResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour choisir ton premier deck." };

  const result = await claimBorrowedDeck(user.id, deckId);
  if (result.ok) {
    revalidatePath("/decks");
    revalidatePath("/collection");
    revalidatePath("/partie");
  }
  return result;
}

/** Débloque un préconstruit en dépensant un Jeton de Préconstruit (§4). */
export async function unlockPreconstructedDeck(deckId: string): Promise<UnlockResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour débloquer un préconstruit." };

  const result = await unlockPreconDeck(user.id, deckId);
  if (result.ok) {
    revalidatePath("/decks");
    revalidatePath("/partie");
  }
  return result;
}
