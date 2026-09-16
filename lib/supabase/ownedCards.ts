import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";

export interface ViewerCollection {
  isSignedIn: boolean;
  ownedCardIds: string[];
  /** Exemplaires possédés par carte (`player_cards.quantity`), cartes possédées uniquement. */
  ownedCounts: Record<string, number>;
}

/**
 * Résout la collection du joueur connecté (`player_cards`, quantité > 0),
 * sans jamais faire planter la page appelante — une config Supabase
 * manquante/invalide dégrade juste vers "non connecté, collection vide".
 * Partagé par la page Collection et l'éditeur de deck (panneau du milieu :
 * seules les cartes possédées sont piochables).
 */
export async function getOwnedCardIds(): Promise<ViewerCollection> {
  try {
    const supabase = createSupabaseServerClient();
    const user = await getSessionUser();
    if (!user) return { isSignedIn: false, ownedCardIds: [], ownedCounts: {} };

    const { data, error } = await supabase
      .from("player_cards")
      .select("card_id, quantity")
      .eq("user_id", user.id)
      .gt("quantity", 0);
    if (error) console.error("[getOwnedCardIds] Échec de la lecture de player_cards :", error.message);
    const rows = data ?? [];
    return {
      isSignedIn: true,
      ownedCardIds: rows.map((row) => row.card_id),
      ownedCounts: Object.fromEntries(rows.map((row) => [row.card_id, row.quantity])),
    };
  } catch (error) {
    console.error("[getOwnedCardIds] Impossible de résoudre la collection du joueur :", error);
    return { isSignedIn: false, ownedCardIds: [], ownedCounts: {} };
  }
}
