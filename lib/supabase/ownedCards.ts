import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { isCardFinish, type RareCardFinish } from "@/game/cosmetics/finishes";

export interface ViewerCollection {
  isSignedIn: boolean;
  ownedCardIds: string[];
  /** Exemplaires possédés par carte (`player_cards.quantity`), cartes possédées uniquement. */
  ownedCounts: Record<string, number>;
  /**
   * Exemplaires possédés dans une finition TRÈS rare, par carte puis par
   * finition (`player_card_finishes`) — vide sans la migration. Ils sont
   * AUSSI comptés dans `ownedCounts` (l'exemplaire est d'abord une carte).
   */
  ownedFinishes: Record<string, Partial<Record<RareCardFinish, number>>>;
}

/**
 * Finitions rares du joueur. Lues par le SERVEUR (la table n'a pas de policy
 * pour le navigateur) ; une base sans la migration 20261105120000 rend
 * simplement « aucune », sans faire échouer la page.
 */
async function readOwnedFinishes(userId: string): Promise<ViewerCollection["ownedFinishes"]> {
  try {
    const { data, error } = await createSupabaseServiceRoleClient()
      .from("player_card_finishes")
      .select("card_id, finish, quantity")
      .eq("user_id", userId)
      .gt("quantity", 0);
    if (error) {
      console.warn("[getOwnedCardIds] Finitions illisibles :", error.message);
      return {};
    }
    const result: ViewerCollection["ownedFinishes"] = {};
    for (const row of data ?? []) {
      const finish: string = row.finish;
      if (!isCardFinish(finish) || finish === "classique") continue;
      (result[row.card_id] ??= {})[finish] = row.quantity;
    }
    return result;
  } catch (error) {
    console.warn("[getOwnedCardIds] Finitions illisibles :", error);
    return {};
  }
}

/**
 * Résout la collection du joueur connecté (`player_cards`, quantité > 0),
 * sans jamais faire planter la page appelante — une config Supabase
 * manquante/invalide dégrade juste vers "non connecté, collection vide".
 * Partagé par la page Collection et l'éditeur de deck (panneau du milieu :
 * seules les cartes possédées sont piochables). Les finitions rares ne sont
 * lues que sur demande (`withFinishes`) : seule la Collection les montre.
 */
export async function getOwnedCardIds({ withFinishes = false }: { withFinishes?: boolean } = {}): Promise<ViewerCollection> {
  try {
    const supabase = createSupabaseServerClient();
    const user = await getSessionUser();
    if (!user) return { isSignedIn: false, ownedCardIds: [], ownedCounts: {}, ownedFinishes: {} };

    const [{ data, error }, ownedFinishes] = await Promise.all([
      supabase.from("player_cards").select("card_id, quantity").eq("user_id", user.id).gt("quantity", 0),
      withFinishes ? readOwnedFinishes(user.id) : Promise.resolve({}),
    ]);
    if (error) console.error("[getOwnedCardIds] Échec de la lecture de player_cards :", error.message);
    const rows = data ?? [];
    return {
      isSignedIn: true,
      ownedCardIds: rows.map((row) => row.card_id),
      ownedCounts: Object.fromEntries(rows.map((row) => [row.card_id, row.quantity])),
      ownedFinishes,
    };
  } catch (error) {
    console.error("[getOwnedCardIds] Impossible de résoudre la collection du joueur :", error);
    return { isSignedIn: false, ownedCardIds: [], ownedCounts: {}, ownedFinishes: {} };
  }
}
