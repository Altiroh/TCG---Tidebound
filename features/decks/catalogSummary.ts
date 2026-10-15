import { readDeckCatalog, type DeckCatalogView } from "@/features/decks/catalogService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Le rayon des préconstruits vu par le joueur de la SESSION — module
 * SERVEUR (pas de `"use server"`). C'est le corps de l'action
 * `fetchDeckCatalog`, ouvert aux pages serveur qui ont déjà la collection
 * en main (`preloadedOwnedCounts`, voir `readDeckCatalog`) : hors directive,
 * le navigateur ne peut pas lui souffler une collection.
 *
 * À part de `catalogService.ts` pour que celui-ci reste importable sans la
 * session (`getSessionUser` repose sur `cache` de React côté serveur).
 */

export interface DeckCatalogSummary extends DeckCatalogView {
  isSignedIn: boolean;
}

export async function readDeckCatalogSummary(preloadedOwnedCounts?: PromiseLike<Record<string, number> | null>): Promise<DeckCatalogSummary> {
  try {
    const user = await getSessionUser();
    const view = await readDeckCatalog(user?.id ?? null, preloadedOwnedCounts);
    return { ...view, isSignedIn: Boolean(user) };
  } catch (error) {
    console.error("[fetchDeckCatalog] Lecture impossible :", error);
    const view = await readDeckCatalog(null);
    return { ...view, isSignedIn: false };
  }
}
