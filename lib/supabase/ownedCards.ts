import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ViewerCollection {
  isSignedIn: boolean;
  ownedCardIds: string[];
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { isSignedIn: false, ownedCardIds: [] };

    const { data, error } = await supabase.from("player_cards").select("card_id").eq("user_id", user.id).gt("quantity", 0);
    if (error) console.error("[getOwnedCardIds] Échec de la lecture de player_cards :", error.message);
    return { isSignedIn: true, ownedCardIds: (data ?? []).map((row) => row.card_id) };
  } catch (error) {
    console.error("[getOwnedCardIds] Impossible de résoudre la collection du joueur :", error);
    return { isSignedIn: false, ownedCardIds: [] };
  }
}
