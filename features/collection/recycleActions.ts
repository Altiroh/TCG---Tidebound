"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recycleCardFor, type RecycleResult } from "@/features/collection/recycleService";

/**
 * Revente d'une carte, depuis la Collection.
 *
 * Le joueur vient de sa SESSION, jamais d'un paramètre : sans ça, l'action
 * serait un point d'entrée HTTP permettant de vider la collection de
 * n'importe qui.
 */
export async function recycleCard(cardId: string, quantity = 1): Promise<RecycleResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
