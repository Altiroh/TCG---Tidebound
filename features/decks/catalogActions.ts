"use server";

import { revalidatePath } from "next/cache";
import { unlockPreconDeck, type UnlockResult } from "@/features/decks/catalogService";
import { readDeckCatalogSummary, type DeckCatalogSummary } from "@/features/decks/catalogSummary";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Decks fournis par le jeu — Server Actions exposées au navigateur.
 *
 * Le joueur vient toujours de la session ; l'identifiant de deck, lui, est
 * validé contre le catalogue TypeScript côté serveur (`isPreconDeckId`,
 * `offer`), pour qu'aucun appel ne puisse débloquer autre chose que ce que
 * la spec prévoit.
 *
 * Le choix GRATUIT d'un préconstruit n'existe plus (15/10/2026) : la
 * première mission offre les trois starters côté serveur, à la fin du
 * tutoriel (`features/onboarding/starterMission.ts`). L'action
 * `chooseFreePreconDeck` est retirée — aucun appel ne peut plus prendre un
 * deck gratuitement au rayon.
 */

export type { DeckCatalogSummary };

export async function fetchDeckCatalog(): Promise<DeckCatalogSummary> {
  return readDeckCatalogSummary();
}

/** Débloque un préconstruit du rayon en dépensant un Jeton de Préconstruit (§4). */
export async function unlockPreconstructedDeck(deckId: string): Promise<UnlockResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour débloquer un préconstruit." };

  const result = await unlockPreconDeck(user.id, deckId);
  if (result.ok) {
    revalidatePath("/decks");
    revalidatePath("/partie");
  }
  return result;
}
