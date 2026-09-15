"use server";

import { revalidatePath } from "next/cache";
import { recycleCardFor, recycleSurplusFor, type RecycleResult, type RecycleSurplusResult } from "@/features/collection/recycleService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Revente d'une carte, depuis la Collection.
 *
 * Le joueur vient de sa SESSION, jamais d'un paramètre : sans ça, l'action
 * serait un point d'entrée HTTP permettant de vider la collection de
 * n'importe qui.
 */
export async function recycleCard(cardId: string, quantity = 1): Promise<RecycleResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour revendre une carte." };

  const result = await recycleCardFor(user.id, cardId, quantity);
  // La collection et le solde du bandeau changent : les pages qui les
  // affichent doivent être relues au prochain rendu.
  if (result.ok) {
    revalidatePath("/collection");
    revalidatePath("/market");
  }
  return result;
}

/** « Revendre le surplus » de la Collection : les quantités confirmées par le joueur, plafonds compris. */
export async function recycleSurplus(expected: Array<{ cardId: string; quantity: number }>): Promise<RecycleSurplusResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour revendre tes cartes." };
  if (!Array.isArray(expected)) return { ok: false, error: "Liste de revente invalide." };

  const result = await recycleSurplusFor(user.id, expected);
  if (result.ok) {
    revalidatePath("/collection");
    revalidatePath("/market");
  }
  return result;
}
