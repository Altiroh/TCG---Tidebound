import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import type { CardEdition } from "@/game/cosmetics/editions";
import { readDisplayedEditions, readOwnedEditions, type OwnedEditionsByCard } from "@/lib/supabase/cardEditions";

export interface ViewerCollection {
  isSignedIn: boolean;
  ownedCardIds: string[];
  /** Exemplaires possédés par carte (`player_cards.quantity`), cartes possédées uniquement. */
  ownedCounts: Record<string, number>;
  /**
   * ÉDITIONS rares possédées (illustration × finition, Collection visuelle
   * V2), par carte. Elles sont AUSSI comptées dans `ownedCounts`
   * (l'exemplaire est d'abord une carte). Vides sans `withEditions`.
   */
  ownedEditions: OwnedEditionsByCard;
  /** Édition choisie pour la partie, par carte ; absente : la Classique. Vide sans `withEditions`. */
  displayedEditions: Record<string, CardEdition>;
}

const NOT_SIGNED_IN: ViewerCollection = { isSignedIn: false, ownedCardIds: [], ownedCounts: {}, ownedEditions: {}, displayedEditions: {} };

/**
 * Résout la collection du joueur connecté (`player_cards`, quantité > 0),
 * sans jamais faire planter la page appelante — une config Supabase
 * manquante/invalide dégrade juste vers "non connecté, collection vide".
 * Partagé par la page Collection et l'éditeur de deck (panneau du milieu :
 * seules les cartes possédées sont piochables). Les éditions ne sont lues
 * que sur demande (`withEditions`) : seule la Collection les montre. Elles
 * passent par le SERVEUR (`editionsService`) : leurs tables n'ont pas de
 * policy pour le navigateur.
 */
export async function getOwnedCardIds({ withEditions = false }: { withEditions?: boolean } = {}): Promise<ViewerCollection> {
  try {
    const supabase = createSupabaseServerClient();
    const user = await getSessionUser();
    if (!user) return NOT_SIGNED_IN;

    const [{ data, error }, ownedEditions, displayed] = await Promise.all([
      supabase.from("player_cards").select("card_id, quantity").eq("user_id", user.id).gt("quantity", 0),
      withEditions ? readOwnedEditions(user.id) : Promise.resolve({}),
      withEditions ? readDisplayedEditions([user.id]) : Promise.resolve({} as Record<string, Record<string, CardEdition>>),
    ]);
    if (error) console.error("[getOwnedCardIds] Échec de la lecture de player_cards :", error.message);
    const rows = data ?? [];
    return {
      isSignedIn: true,
      ownedCardIds: rows.map((row) => row.card_id),
      ownedCounts: Object.fromEntries(rows.map((row) => [row.card_id, row.quantity])),
      ownedEditions,
      displayedEditions: displayed[user.id] ?? {},
    };
  } catch (error) {
    console.error("[getOwnedCardIds] Impossible de résoudre la collection du joueur :", error);
    return NOT_SIGNED_IN;
  }
}
