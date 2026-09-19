"use server";

import { revalidatePath } from "next/cache";
import { getCardDefinition, isDeckStyleId, type DeckList, type DeckStyleId } from "@/game";
import { validateDeckList } from "@/game/rules/deckValidation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DECK_DESCRIPTION_MAX } from "@/features/decks/constants";
import { trashPurgeCutoff } from "@/features/decks/deckTrash";
import { signatureCardId } from "@/features/decks/nameplateArt";
import { getSessionUser } from "@/lib/supabase/sessionUser";

export interface PlayerDeckSummary {
  id: string;
  name: string;
  shipId: string;
  cardCount: number;
  /** `is_valid` tel que recalculé par `saveDeck` (`validateDeckList`) à la dernière sauvegarde. */
  isValid: boolean;
  /**
   * Date de mise à la corbeille (ISO), `null` pour un deck actif. Un deck
   * daté n'apparaît que dans le rayon « Récemment supprimés » de l'écran
   * Decks : jamais dans Jouer, l'éditeur ni une partie (`deckTrash.ts`).
   */
  deletedAt: string | null;
  /** Deck par défaut du joueur : présélectionné à l'écran Jouer. Un seul à la fois (`setDefaultDeck`). */
  isDefault: boolean;
  /** Jusqu'à 5 `card_id` du deck, pour l'empilement d'en-tête de la tuile — ordre arbitraire pour l'instant. */
  headerCardIds: string[];
  /**
   * Carte qui sert d'illustration à la tuile (`signatureCardId`), choisie
   * sur la liste ENTIÈRE et non sur les cinq de `headerCardIds` : la tuile
   * et la plaque de l'éditeur montrent ainsi la même carte. `null` pour un
   * deck vide — le Navire prend alors le relais côté écran.
   */
  artCardId: string | null;
  /**
   * La carte CHOISIE par le joueur, sans le repli automatique ci-dessus :
   * `null` veut dire « laisse la règle décider ». Les deux se distinguent
   * dans le sélecteur d'illustration, qui doit pouvoir montrer « Choix
   * automatique » comme l'option retenue.
   */
  artCardChosen: string | null;
  /**
   * Le CONTENU du deck, un exemplaire compté par carte. L'écran Decks en a
   * besoin pour trois choses que l'effectif seul ne donne pas : le début de
   * la liste dans la fiche, le style de jeu déduit (`deckProfile`) qui sert
   * de filtre, et la courbe. Cinquante lignes par deck au plus, la table
   * est déjà lue pour compter les cartes.
   */
  cards: { cardId: string; quantity: number }[];
  /** Phrase libre du joueur (`player_decks.description`), vide si jamais écrite. */
  description: string;
  /**
   * Ce que le joueur a CHOISI d'écrire lui-même sur son deck. Chaque champ
   * à `null` veut dire « laisse le jeu deviner » : l'écran retombe alors
   * sur `deckProfile`, déduit des cartes. La fusion se fait côté client
   * (`features/decks/deckEntries.ts`), qui a déjà la liste sous la main.
   */
  profile: {
    styleId: DeckStyleId | null;
    difficulty: number | null;
    mechanics: string[] | null;
  };
  /** Création et dernière sauvegarde (ISO) — la fiche les affiche, le tri s'en sert. */
  createdAt: string;
  updatedAt: string;
}

export interface DeckActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/**
 * Toute action de deck rend un `DeckActionResult`, jamais une exception :
 * une configuration Supabase absente (`createSupabaseServerClient` lève
 * alors) ou une panne réseau doivent arriver dans l'éditeur comme un
 * message sous le bouton, pas comme une erreur non rattrapée qui casse
 * l'écran. Même principe que `getOwnedCardIds`.
 */
async function guarded(label: string, run: () => Promise<DeckActionResult>): Promise<DeckActionResult> {
  try {
    return await run();
  } catch (error) {
    console.error(`[${label}] Échec inattendu :`, error);
    return { ok: false, error: "Sauvegarde indisponible pour le moment : réessaie dans un instant." };
  }
}

async function currentUserId(supabase: ReturnType<typeof createSupabaseServerClient>): Promise<string | null> {
  const user = await getSessionUser();
  return user?.id ?? null;
}

/**
 * Liste les decks personnels du joueur connecté — actifs ET à la corbeille
 * (`deletedAt`), c'est l'écran qui les range en rayons — avec de quoi
 * peupler la tuile (nombre de cartes, aperçu d'en-tête). Tableau vide si
 * non connecté — jamais d'erreur qui casse la page.
 *
 * C'est aussi ici que la corbeille est vidée de ce qui a dépassé les 30
 * jours : le seul moment où le joueur regarde ses decks, donc le seul où
 * un deck échu pourrait encore lui être montré à tort. La politique RLS
 * (chacun gère ses propres decks) suffit, sans job de fond.
 */
export async function listPlayerDecks(): Promise<PlayerDeckSummary[]> {
  const supabase = createSupabaseServerClient();
  const userId = await currentUserId(supabase);
  if (!userId) return [];

  const { error: purgeError } = await supabase
    .from("player_decks")
    .delete()
    .eq("user_id", userId)
    .lt("deleted_at", trashPurgeCutoff().toISOString());
  if (purgeError) console.error("[listPlayerDecks] Échec du vidage de la corbeille :", purgeError.message);

  let { data: decks, error: decksError } = await supabase
    .from("player_decks")
    .select("id, name, ship_id, is_valid, art_card_id, deleted_at, is_default, description, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (decksError) {
    // Base pas encore migrée (`20260923120000_deck_trash.sql` : colonne
    // `deleted_at` ; `20260924120000_default_deck.sql` : `is_default`) :
    // la liste ne doit pas se vider pour autant. On relit sans ces
    // colonnes — tout est alors actif, sans corbeille ni deck par défaut —
    // et on le dit dans les journaux, pour que les migrations soient passées.
    console.error(
      "[listPlayerDecks] Échec de la lecture de player_decks (migrations deck_trash / default_deck appliquées ?) :",
      decksError.message
    );
    const fallback = await supabase
      .from("player_decks")
      .select("id, name, ship_id, is_valid, art_card_id, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    decks = (fallback.data ?? []).map((deck) => ({ ...deck, deleted_at: null, is_default: false, description: null }));
    decksError = fallback.error;
    if (decksError) console.error("[listPlayerDecks] Échec de la relecture sans corbeille :", decksError.message);
  }
  if (!decks || decks.length === 0) return [];

  /*
   * Le profil écrit à la main se lit À PART, et son échec ne coûte rien
   * d'autre que lui-même : la migration `20260930120000` s'applique à la
   * main, et tant qu'elle n'est pas passée, un `select` groupé ferait
   * tomber toute la lecture sur son repli — la corbeille et le deck par
   * défaut disparaîtraient de l'écran pour une colonne manquante qui ne
   * les concerne pas.
   */
  const written = new Map<string, { style: string | null; difficulty: number | null; mechanics: string[] | null }>();
  const { data: profiles, error: profilesError } = await supabase
    .from("player_decks")
    .select("id, style, difficulty, mechanics")
    .eq("user_id", userId);
  if (profilesError) {
    console.error("[listPlayerDecks] Profils de deck illisibles (migration player_deck_profile appliquée ?) :", profilesError.message);
  }
  for (const row of profiles ?? []) written.set(row.id, { style: row.style, difficulty: row.difficulty, mechanics: row.mechanics });

  const { data: cards, error: cardsError } = await supabase
    .from("player_deck_cards")
    .select("deck_id, card_id, quantity")
    .in(
      "deck_id",
      decks.map((deck) => deck.id)
    );
  if (cardsError) console.error("[listPlayerDecks] Échec de la lecture de player_deck_cards :", cardsError.message);

  const cardsByDeck = new Map<string, { card_id: string; quantity: number }[]>();
  for (const row of cards ?? []) {
    const list = cardsByDeck.get(row.deck_id) ?? [];
    list.push(row);
    cardsByDeck.set(row.deck_id, list);
  }

  return decks.map((deck) => {
    const deckCards = cardsByDeck.get(deck.id) ?? [];
    return {
      id: deck.id,
      name: deck.name,
      shipId: deck.ship_id,
      isValid: Boolean(deck.is_valid),
      deletedAt: deck.deleted_at ?? null,
      isDefault: Boolean(deck.is_default),
      cardCount: deckCards.reduce((sum, card) => sum + card.quantity, 0),
      cards: deckCards.map((card) => ({ cardId: card.card_id, quantity: card.quantity })),
      description: deck.description ?? "",
      profile: profileOf(written.get(deck.id)),
      createdAt: deck.created_at,
      updatedAt: deck.updated_at,
      headerCardIds: deckCards.slice(0, 5).map((card) => card.card_id),
      // Choix explicite s'il existe, sinon la règle par défaut : la carte
      // la plus chère (`signatureCardId` ignore les exemplaires).
      artCardId: deck.art_card_id ?? signatureCardId(deckCards.map((card) => card.card_id)),
      artCardChosen: deck.art_card_id ?? null,
    };
  });
}

/**
 * Les decks personnels sous la forme que la partie consomme (`DeckList`,
 * un `cardId` par exemplaire) — pour l'écran Jouer. Même tolérance que
 * `listPlayerDecks` : tableau vide si non connecté ou si Supabase manque.
 */
export async function listPlayerDeckLists(): Promise<DeckList[]> {
  try {
    const supabase = createSupabaseServerClient();
    const userId = await currentUserId(supabase);
    if (!userId) return [];

    // Un deck à la corbeille ne se joue pas : il ne figure pas dans Jouer.
    const { data: decks, error: decksError } = await supabase
      .from("player_decks")
      .select("id, name, ship_id, is_default, description")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (decksError) console.error("[listPlayerDeckLists] Échec de la lecture de player_decks :", decksError.message);
    if (!decks || decks.length === 0) return [];

    const { data: cards, error: cardsError } = await supabase
      .from("player_deck_cards")
      .select("deck_id, card_id, quantity")
      .in(
        "deck_id",
        decks.map((deck) => deck.id)
      );
    if (cardsError) console.error("[listPlayerDeckLists] Échec de la lecture de player_deck_cards :", cardsError.message);

    const cardsByDeck = new Map<string, string[]>();
    for (const row of cards ?? []) {
      const list = cardsByDeck.get(row.deck_id) ?? [];
      for (let i = 0; i < row.quantity; i += 1) list.push(row.card_id);
      cardsByDeck.set(row.deck_id, list);
    }

    return decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      shipId: deck.ship_id,
      // Ce que le joueur en a écrit, sinon la phrase générique : le reste
      // de la fiche (rôle, difficulté, mécaniques) se déduit des cartes.
      description: deck.description?.trim() || "Deck personnel",
      cardIds: cardsByDeck.get(deck.id) ?? [],
      isDefault: Boolean(deck.is_default),
    }));
  } catch (error) {
    console.error("[listPlayerDeckLists] Échec inattendu :", error);
    return [];
  }
}

export interface SaveDeckInput {
  /** `null` pour un deck pas encore créé (première sauvegarde depuis `/decks/nouveau`). */
  id: string | null;
  name: string;
  shipId: string;
  /** Un élément par exemplaire (pas groupé) — reflète directement la liste de l'éditeur. */
  cardIds: string[];
  /**
   * Carte choisie comme illustration du deck, ou `null` pour laisser la
   * règle décider (la plus chère). `undefined` ne touche à rien — ce qui
   * permet à un appelant qui ignore ce champ de ne pas l'effacer.
   */
  artCardId?: string | null;
  /**
   * Résumé libre, affiché sur la fiche de deck. Vide ou absent : la fiche
   * retombe sur sa phrase générique. Le RESTE de la fiche — rôle,
   * difficulté, mécaniques — se déduit des cartes et ne se saisit pas.
   */
  description?: string | null;
}

/**
 * Sauvegarde intégrale d'un deck personnel (nom + contenu), depuis
 * l'éditeur : crée le deck s'il n'existe pas encore, sinon remplace tout
 * son contenu. `is_valid` est recalculé ici via `validateDeckList` — jamais
 * fait confiance à un état client (cf. commentaire de la migration SQL) ;
 * un deck hors de `RULES.DECK_SIZE_MIN`/`MAX` se sauvegarde quand même,
 * juste marqué non jouable.
 */
export async function saveDeck(input: SaveDeckInput): Promise<DeckActionResult> {
  return guarded("saveDeck", () => saveDeckUnguarded(input));
}

/** Nombre maximal d'identifiants inconnus cités dans le message d'erreur — au-delà, la liste devient illisible. */
const MAX_LISTED_UNKNOWN_CARDS = 3;

/**
 * Les identifiants de `cardIds` absents de la table `cards`, dédupliqués.
 *
 * `cards` n'est qu'un MIROIR du catalogue TypeScript (cf.
 * `scripts/seedCards.ts`) : elle peut donc être en retard sur lui, et
 * c'est exactement ce que cette fonction détecte, avant d'écrire quoi que
 * ce soit.
 */
async function unknownCardIds(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  cardIds: readonly string[]
): Promise<string[]> {
  const distinct = Array.from(new Set(cardIds));
  if (distinct.length === 0) return [];

  const { data, error } = await supabase.from("cards").select("id").in("id", distinct);
  // Lecture impossible (RLS, panne) : on ne bloque pas la sauvegarde sur un
  // contrôle qui n'a pas pu s'exécuter — l'INSERT tranchera.
  if (error) {
    console.error("[saveDeck] Contrôle des cartes impossible :", error.message);
    return [];
  }

  const known = new Set((data ?? []).map((row) => row.id as string));
  return distinct.filter((cardId) => !known.has(cardId));
}

/** Message montré dans l'éditeur pour des cartes absentes de la base — nomme les cartes et le geste qui répare. */
function unknownCardsMessage(missing: string[]): string {
  const named = missing.slice(0, MAX_LISTED_UNKNOWN_CARDS).map(cardDisplayName).join(", ");
  const rest = missing.length - MAX_LISTED_UNKNOWN_CARDS;
  const list = rest > 0 ? `${named} (+${rest})` : named;
  return `${missing.length > 1 ? "Ces cartes ne sont pas encore" : "Cette carte n'est pas encore"} synchronisée${
    missing.length > 1 ? "s" : ""
  } avec la base : ${list}. Lance \`npm run seed:cards\` pour mettre le catalogue à jour, puis réessaie. Ton deck n'a pas été modifié.`;
}

/** Nom lisible d'une carte, ou son identifiant si le catalogue ne la connaît pas non plus. */
function cardDisplayName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

async function saveDeckUnguarded(input: SaveDeckInput): Promise<DeckActionResult> {
  const name = input.name.trim() || "Deck sans nom";
  const supabase = createSupabaseServerClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "Connecte-toi pour sauvegarder ce deck." };

  const validation = validateDeckList({
    id: input.id ?? "draft",
    name,
    shipId: input.shipId,
    description: "",
    cardIds: input.cardIds,
  });

  // Contrôle AVANT toute écriture : `player_deck_cards.card_id` référence
  // `cards.id`, une table miroir du catalogue TypeScript alimentée par
  // `npm run seed:cards`. Une carte ajoutée au catalogue mais pas encore
  // seedée faisait échouer l'INSERT sur
  // `player_deck_cards_card_id_fkey` — APRÈS le DELETE du contenu
  // précédent, donc en vidant le deck au passage. On vérifie donc
  // d'abord, et on rend un message qui dit quoi faire plutôt que le texte
  // brut de Postgres.
  const missing = await unknownCardIds(supabase, input.cardIds);
  if (missing.length > 0) {
    return { ok: false, error: unknownCardsMessage(missing) };
  }

  /*
   * Illustration : seule une carte PRÉSENTE dans le deck est retenue. Sans
   * ce filtre, retirer la carte choisie laisserait le deck illustré par une
   * carte qu'il ne contient plus — et la plaque mentirait sur son contenu.
   * Écartée, on retombe sur la règle par défaut.
   */
  const artCardId = input.artCardId && input.cardIds.includes(input.artCardId) ? input.artCardId : null;
  // Bornée comme le nom : une fiche n'est pas un journal de bord.
  const description = input.description?.trim().slice(0, DECK_DESCRIPTION_MAX) || null;

  let deckId = input.id;

  if (!deckId) {
    const { data, error } = await supabase
      .from("player_decks")
      .insert({ user_id: userId, ship_id: input.shipId, name, is_valid: validation.ok, art_card_id: artCardId, description })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Échec de la création du deck." };
    deckId = data.id;
  } else {
    const { error: updateError } = await supabase
      .from("player_decks")
      .update({
        name,
        ship_id: input.shipId,
        is_valid: validation.ok,
        art_card_id: artCardId,
        description,
        // Écrit À LA MAIN : `updated_at` n'a pas de trigger en base, il
        // serait resté à la date de création et la fiche aurait annoncé
        // « modifié » le jour de la naissance du deck.
        updated_at: new Date().toISOString(),
      })
      .eq("id", deckId);
    if (updateError) return { ok: false, error: updateError.message };

    const { error: deleteError } = await supabase.from("player_deck_cards").delete().eq("deck_id", deckId);
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  const quantities = new Map<string, number>();
  for (const cardId of input.cardIds) quantities.set(cardId, (quantities.get(cardId) ?? 0) + 1);

  if (quantities.size > 0) {
    const finalDeckId = deckId;
    const { error: insertError } = await supabase
      .from("player_deck_cards")
      .insert(Array.from(quantities.entries()).map(([card_id, quantity]) => ({ deck_id: finalDeckId, card_id, quantity })));
    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  return { ok: true, id: deckId };
}

export async function renameDeck(deckId: string, name: string): Promise<DeckActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Le nom ne peut pas être vide." };

  return guarded("renameDeck", async () => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("player_decks")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", deckId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/decks");
    return { ok: true };
  });
}

/**
 * LE PROFIL ÉCRIT À LA MAIN — type de jeu, difficulté, mécaniques.
 *
 * Chaque champ à `null` REND la main à la déduction : c'est l'unique façon
 * de revenir en arrière, et c'est aussi l'état de départ de tout deck. Un
 * champ renseigné, au contraire, fige ce que la fiche affichera, quoi que
 * la composition devienne ensuite.
 *
 * Le type passe par l'énumération `deck_style` : une valeur inconnue est
 * refusée ici plutôt que par Postgres, pour que le message reste lisible.
 */
export async function updateDeckProfile(
  deckId: string,
  profile: { styleId: string | null; difficulty: number | null; mechanics: string[] | null }
): Promise<DeckActionResult> {
  if (profile.styleId !== null && !isDeckStyleId(profile.styleId)) {
    return { ok: false, error: "Type de jeu inconnu." };
  }
  if (profile.difficulty !== null && (!Number.isInteger(profile.difficulty) || profile.difficulty < 1 || profile.difficulty > 5)) {
    return { ok: false, error: "La difficulté va de 1 à 5." };
  }

  // Quatre entrées courtes au plus, comme les listes du jeu : une fiche
  // n'est pas un journal de bord, et une ligne de vingt étiquettes ne se
  // lit plus.
  const mechanics =
    profile.mechanics === null
      ? null
      : profile.mechanics
          .map((entry) => entry.trim().slice(0, 40))
          .filter((entry) => entry.length > 0)
          .slice(0, 4);

  return guarded("updateDeckProfile", async () => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("player_decks")
      .update({
        style: profile.styleId,
        difficulty: profile.difficulty,
        mechanics,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deckId);
    if (error) {
      console.error("[updateDeckProfile] Échec (migration player_deck_profile appliquée ?) :", error.message);
      return { ok: false, error: error.message };
    }
    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    return { ok: true };
  });
}

/**
 * L'ILLUSTRATION du deck, choisie depuis la fiche sans passer par
 * l'éditeur. `null` rend la main à la règle par défaut (la carte la plus
 * chère, `signatureCardId`).
 *
 * La carte doit être DANS le deck — une plaque qui montrerait une carte
 * absente mentirait sur son contenu, et c'est déjà la règle que `saveDeck`
 * s'impose.
 */
export async function setDeckArt(deckId: string, artCardId: string | null): Promise<DeckActionResult> {
  return guarded("setDeckArt", async () => {
    const supabase = createSupabaseServerClient();

    if (artCardId !== null) {
      const { data: card } = await supabase
        .from("player_deck_cards")
        .select("card_id")
        .eq("deck_id", deckId)
        .eq("card_id", artCardId)
        .maybeSingle();
      if (!card) return { ok: false, error: "Cette carte n'est pas dans le deck." };
    }

    const { error } = await supabase
      .from("player_decks")
      .update({ art_card_id: artCardId, updated_at: new Date().toISOString() })
      .eq("id", deckId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    return { ok: true };
  });
}

export async function duplicateDeck(deckId: string): Promise<DeckActionResult> {
  return guarded("duplicateDeck", () => duplicateDeckUnguarded(deckId));
}

async function duplicateDeckUnguarded(deckId: string): Promise<DeckActionResult> {
  const supabase = createSupabaseServerClient();
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "Connecte-toi pour dupliquer un deck." };

  const { data: original, error: fetchError } = await supabase
    .from("player_decks")
    .select("name, ship_id, description, art_card_id")
    .eq("id", deckId)
    .single();
  if (fetchError || !original) return { ok: false, error: "Deck introuvable." };

  // La copie reprend l'IDENTITÉ du deck — sa phrase et son illustration —
  // et pas seulement ses cartes : dupliquer pour bricoler une variante ne
  // devrait pas obliger à tout réécrire.
  //
  // Le profil écrit à la main (type, difficulté, mécaniques), lui, n'est
  // pas recopié : la copie repart du profil DÉDUIT de ses cartes, quitte à
  // ce que son auteur le corrige comme il l'a fait pour l'original. Le
  // recopier obligerait à écrire ici trois colonnes dont la migration
  // (`20260930120000`) peut n'être pas encore passée, au prix d'une
  // duplication qui échouerait pour cette seule raison.
  const { data: created, error: insertError } = await supabase
    .from("player_decks")
    .insert({
      user_id: userId,
      ship_id: original.ship_id,
      name: `${original.name} (copie)`,
      description: original.description,
      art_card_id: original.art_card_id,
    })
    .select("id")
    .single();
  if (insertError || !created) return { ok: false, error: insertError?.message ?? "Échec de la duplication." };

  const { data: cards } = await supabase.from("player_deck_cards").select("card_id, quantity").eq("deck_id", deckId);
  if (cards && cards.length > 0) {
    const { error: cardsError } = await supabase
      .from("player_deck_cards")
      .insert(cards.map((card) => ({ deck_id: created.id, card_id: card.card_id, quantity: card.quantity })));
    if (cardsError) return { ok: false, error: cardsError.message };
  }

  revalidatePath("/decks");
  return { ok: true, id: created.id };
}

/**
 * Le profil écrit à la main, nettoyé. Une valeur de type inconnue (colonne
 * lue avant migration, énumération élargie puis revenue en arrière) est
 * traitée comme un non-choix : mieux vaut deviner que propager dans
 * l'interface une valeur qu'elle ne saurait pas afficher.
 */
function profileOf(row: { style: string | null; difficulty: number | null; mechanics: string[] | null } | undefined): PlayerDeckSummary["profile"] {
  return {
    styleId: isDeckStyleId(row?.style) ? row!.style as DeckStyleId : null,
    difficulty: typeof row?.difficulty === "number" ? row.difficulty : null,
    mechanics: Array.isArray(row?.mechanics) ? row!.mechanics : null,
  };
}

/** Identifiants dédupliqués et non vides — une sélection peut contenir des doublons ou des clés périmées. */
function distinctIds(deckIds: readonly string[]): string[] {
  return Array.from(new Set(deckIds.filter((id) => typeof id === "string" && id.length > 0)));
}

/**
 * Met un ou plusieurs decks à la corbeille (« Récemment supprimés ») : ils
 * sont DATÉS, pas effacés, et restent restaurables pendant 30 jours
 * (`features/decks/deckTrash.ts`). Un deck déjà à la corbeille garde sa
 * date : redater repousserait son effacement sans que le joueur l'ait
 * voulu. La propriété est garantie par RLS : on ne peut dater que ses
 * propres decks.
 */
export async function deleteDecks(deckIds: string[]): Promise<DeckActionResult> {
  return guarded("deleteDecks", async () => {
    const ids = distinctIds(deckIds);
    if (ids.length === 0) return { ok: true };
    const supabase = createSupabaseServerClient();
    // Un deck à la corbeille ne peut pas rester « par défaut » : il n'est
    // plus proposé à l'écran Jouer.
    const { error } = await supabase
      .from("player_decks")
      .update({ deleted_at: new Date().toISOString(), is_default: false })
      .in("id", ids)
      .is("deleted_at", null);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/decks");
    return { ok: true };
  });
}

/**
 * Marque un deck actif comme deck PAR DÉFAUT du joueur — celui que l'écran
 * Jouer présélectionne. Un seul à la fois : l'ancien est d'abord relâché
 * (l'index partiel unique de la base interdit de toute façon deux decks
 * par défaut pour un même joueur). RLS garantit la propriété.
 */
export async function setDefaultDeck(deckId: string): Promise<DeckActionResult> {
  return guarded("setDefaultDeck", async () => {
    const supabase = createSupabaseServerClient();
    const userId = await currentUserId(supabase);
    if (!userId) return { ok: false, error: "Connecte-toi pour choisir un deck par défaut." };

    const { error: clearError } = await supabase.from("player_decks").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
    if (clearError) return { ok: false, error: clearError.message };

    const { data, error } = await supabase
      .from("player_decks")
      .update({ is_default: true })
      .eq("id", deckId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: "Deck introuvable, ou à la corbeille." };

    revalidatePath("/decks");
    revalidatePath("/partie");
    revalidatePath("/en-ligne");
    return { ok: true, id: deckId };
  });
}

/** Met UN deck à la corbeille — l'éditeur et la tuile n'en suppriment qu'un à la fois. */
export async function deleteDeck(deckId: string): Promise<DeckActionResult> {
  return deleteDecks([deckId]);
}

/** Sort un ou plusieurs decks de la corbeille : ils retrouvent leur rayon (construit ou brouillon) tels qu'ils étaient. */
export async function restoreDecks(deckIds: string[]): Promise<DeckActionResult> {
  return guarded("restoreDecks", async () => {
    const ids = distinctIds(deckIds);
    if (ids.length === 0) return { ok: true };
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("player_decks").update({ deleted_at: null }).in("id", ids);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/decks");
    return { ok: true };
  });
}

/**
 * Efface DÉFINITIVEMENT des decks de la corbeille (leurs cartes suivent par
 * `on delete cascade`). Refuse en silence un deck actif : seul ce qui est
 * déjà à la corbeille peut disparaître pour de bon — la confirmation à
 * l'écran ne remplace pas ce garde-fou, elle s'y ajoute.
 */
export async function purgeDecks(deckIds: string[]): Promise<DeckActionResult> {
  return guarded("purgeDecks", async () => {
    const ids = distinctIds(deckIds);
    if (ids.length === 0) return { ok: true };
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("player_decks").delete().in("id", ids).not("deleted_at", "is", null);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/decks");
    return { ok: true };
  });
}
