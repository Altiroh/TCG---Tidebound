import { PLAYABLE_DECKS, validateDeckList, type DeckList } from "@/game";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Résolution SERVEUR du deck qu'un joueur emmène dans une partie arbitrée.
 *
 * Deux origines, une seule sortie :
 *   - une liste du jeu (`PLAYABLE_DECKS`) — emprunt, archétype, laboratoire ;
 *   - un deck MONTÉ par le joueur (`player_decks`), relu ici carte par
 *     carte.
 *
 * Jusqu'ici seule la première existait, et une partie contre le bot jouée
 * avec un deck personnel basculait en partie locale : elle ne rapportait ni
 * XP ni progression de quête. C'était la cause la plus fréquente d'un
 * « j'ai fini ma partie et je n'ai rien gagné ».
 *
 * Le contenu du deck n'est JAMAIS pris du navigateur : le client n'envoie
 * qu'un identifiant, et c'est cette fonction qui va chercher les cartes. Un
 * deck qu'on ne possède pas est introuvable (`user_id` dans le filtre, pas
 * seulement dans une politique RLS qu'un client service_role ignorerait),
 * et un deck illégal est refusé ici même — `is_valid` de la table n'est
 * qu'un cache, on revalide la liste réelle (`validateDeckList`).
 */

/** Pourquoi un deck ne peut pas entrer en partie — l'appelant en fait un message. */
export type MatchDeckRejection =
  /** Aucun deck de ce nom, ni au catalogue ni chez ce joueur. */
  | { reason: "unknown" }
  /** Le deck existe mais n'est pas jouable en l'état (taille, exemplaires, navire). */
  | { reason: "invalid"; detail: string }
  /** La base n'a pas répondu : ce n'est pas la faute du deck. */
  | { reason: "unavailable" };

export type MatchDeckResult = { ok: true; deck: DeckList } | ({ ok: false } & MatchDeckRejection);

/** Les identifiants du catalogue ne sont pas des uuid : inutile d'interroger `player_decks` avec, Postgres refuserait la comparaison. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le deck du catalogue portant cet identifiant, s'il existe. Synchrone : aucune lecture en base. */
export function findCatalogDeck(deckId: string): DeckList | undefined {
  return PLAYABLE_DECKS.find((deck) => deck.id === deckId);
}

/**
 * Le deck que `userId` emmène en partie, catalogue ou deck personnel.
 *
 * `userId` n'est pas facultatif : un deck personnel n'est résolu que pour
 * son propriétaire. Une partie PvP résout donc le deck de chaque joueur
 * avec son propre identifiant, jamais celui de l'adversaire.
 */
export async function resolveMatchDeck(userId: string, deckId: string): Promise<MatchDeckResult> {
  const fromCatalog = findCatalogDeck(deckId);
  if (fromCatalog) return { ok: true, deck: fromCatalog };
  if (!UUID.test(deckId)) return { ok: false, reason: "unknown" };

  try {
    const service = createSupabaseServiceRoleClient();

    // Le filtre porte le `user_id` : la clé service_role passe outre RLS, la
    // propriété doit donc être vérifiée dans la requête elle-même.
    const { data: row, error } = await service
      .from("player_decks")
      .select("id, name, ship_id")
      .eq("id", deckId)
      .eq("user_id", userId)
      // Un deck à la corbeille n'entre pas en partie.
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[resolveMatchDeck] Lecture du deck impossible :", error.message);
      return { ok: false, reason: "unavailable" };
    }
    if (!row) return { ok: false, reason: "unknown" };

    const { data: cards, error: cardsError } = await service
      .from("player_deck_cards")
      .select("card_id, quantity")
      .eq("deck_id", deckId);
    if (cardsError) {
      console.error("[resolveMatchDeck] Lecture des cartes impossible :", cardsError.message);
      return { ok: false, reason: "unavailable" };
    }

    const cardIds: string[] = [];
    for (const card of cards ?? []) {
      for (let copy = 0; copy < card.quantity; copy += 1) cardIds.push(card.card_id);
    }

    const deck: DeckList = {
      id: row.id,
      name: row.name,
      shipId: row.ship_id,
      description: "Deck personnel",
      cardIds,
    };

    const validation = validateDeckList(deck);
    if (!validation.ok) return { ok: false, reason: "invalid", detail: validation.error };

    return { ok: true, deck };
  } catch (cause) {
    console.error("[resolveMatchDeck] Échec inattendu :", cause);
    return { ok: false, reason: "unavailable" };
  }
}
