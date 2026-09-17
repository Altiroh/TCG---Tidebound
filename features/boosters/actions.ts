"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createSeed } from "@/game/rng";
import { MAX_BATCH_OPEN, MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";
import { drawBooster, rarityForCardId, type BoosterPoolCard, type BoosterSlotRule, type CardRarity, type DrawnCard } from "@/game/boosters";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Boosters — achat et ouverture, entièrement autoritaires côté serveur.
 *
 * Exigence verrouillée du cadrage (Notion "Boosters & économie de
 * collection") : « L'ouverture d'un booster est entièrement autoritaire
 * côté serveur [...] Le client ne doit jamais générer ni reroll les
 * cartes. » D'où le découpage :
 *
 *   1. l'identité de l'appelant vient de la SESSION (`auth.getUser()`),
 *      jamais d'un paramètre — impossible d'ouvrir le booster d'autrui ;
 *   2. le tirage est fait ici, côté serveur, par `drawBooster()` (pur,
 *      testé) à partir du pool et du pity lus en base ;
 *   3. toutes les écritures passent par UNE fonction Postgres atomique
 *      (`open_booster`), qui re-vérifie la possession, le format du
 *      booster et la rareté des cartes.
 *
 * Le client n'envoie donc qu'un id de booster, et ne reçoit le résultat
 * qu'après écriture.
 */

export interface ActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface BoosterInventoryEntry {
  boosterId: string;
  name: string;
  cardCount: number;
  /** Prix en Tides, `null` si non achetable (ex: Mini Booster de Bienvenue). */
  price: number | null;
  isPurchasable: boolean;
  /** Exemplaires possédés, non encore ouverts. */
  owned: number;
  /**
   * Dernier mouvement de la réserve pour CE type de booster
   * (`player_boosters.updated_at`), en ISO. `null` si on n'en possède
   * aucun. Sert à présenter l'étagère du plus récent au plus ancien — la
   * base ne date pas chaque exemplaire, seulement la ligne du type.
   */
  obtainedAt: string | null;
  /** Boosters ouverts depuis la dernière Abyssale, pour CE type de booster. */
  packsSinceAbyssal: number;
  /** Cartes qui peuvent tomber dans ce booster (`booster_pool_cards`), avec leur rareté. */
  pool: Array<{ cardId: string; rarity: CardRarity }>;
}

export interface BoosterInventory {
  isSignedIn: boolean;
  /** Solde de Tides. */
  balance: number;
  boosters: BoosterInventoryEntry[];
  /** Cartes possédées (quantité > 0) — le Market dit, carte par carte, ce qu'on a déjà. */
  ownedCardIds: string[];
}

export interface OpenedCard {
  slotIndex: number;
  cardId: string;
  rarity: CardRarity;
  isNew: boolean;
}

export interface OpenBoosterResult {
  cards: OpenedCard[];
  abyssalPulled: boolean;
  packsSinceAbyssal: number;
}

export interface OpenBoostersResult {
  /** Un tirage par sachet, dans l'ordre d'ouverture. */
  packs: OpenBoosterResult[];
}

/**
 * Ouvre PLUSIEURS sachets du même booster, l'un après l'autre.
 *
 * Séquentiel et non parallèle : chaque ouverture lit le pity et la
 * collection que la précédente vient de modifier — les ouvrir en parallèle
 * ferait tirer tous les sachets dans le même état, donc fausserait à la
 * fois la garantie Abyssale et la préférence pour les cartes manquantes.
 *
 * Un échec en cours de lot ne perd rien : les sachets déjà ouverts sont
 * acquis et rendus, l'appelant montre ce qui a été obtenu.
 */
export async function openBoosters(boosterId: string, quantity: number): Promise<ActionResult<OpenBoostersResult>> {
  const count = Math.max(1, Math.min(MAX_BATCH_OPEN, Math.floor(quantity)));
  const packs: OpenBoosterResult[] = [];

  for (let index = 0; index < count; index += 1) {
    const result = await openBooster(boosterId);
    if (!result.ok || !result.data) {
      if (packs.length === 0) return { ok: false, error: result.error ?? "Ouverture impossible." };
      return { ok: true, data: { packs } };
    }
    packs.push(result.data);
  }

  return { ok: true, data: { packs } };
}

/**
 * Traduit un échec inattendu en message utile.
 *
 * Achat et ouverture passent tous deux par `createSupabaseServiceRoleClient`,
 * qui LÈVE si `SUPABASE_SERVICE_ROLE_KEY` est absente : les deux tombaient
 * alors sur le même « impossible pour le moment », qui n'aide personne à
 * comprendre qu'il manque une variable d'environnement. On nomme donc la
 * cause quand on la reconnaît, et on laisse le message d'origine passer
 * sinon — cet écran est déjà réservé au joueur connecté, et un message
 * vague coûte plus qu'il ne protège.
 */
function describeFailure(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return "Configuration serveur incomplète : SUPABASE_SERVICE_ROLE_KEY est absente. Achat et ouverture de boosters passent par elle (`.env.local` en local, variables d'environnement Vercel en prod).";
  }
  return `${fallback} (${message})`;
}

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const user = await getSessionUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/** Inventaire de boosters + solde de Tides du joueur connecté. */
export async function fetchBoosterInventory(): Promise<BoosterInventory> {
  const empty: BoosterInventory = { isSignedIn: false, balance: 0, boosters: [], ownedCardIds: [] };

  try {
    const session = await requireUser();
    if (!session) return empty;
    const { supabase, userId } = session;

    const [definitions, owned, pity, currency, pools, ownedCards] = await Promise.all([
      supabase.from("booster_definitions").select("*").eq("is_enabled", true).order("id"),
      supabase.from("player_boosters").select("booster_definition_id, quantity, updated_at").eq("user_id", userId),
      supabase.from("player_pity").select("booster_definition_id, packs_since_abyssal").eq("user_id", userId),
      supabase.from("player_currency").select("balance").eq("user_id", userId).maybeSingle(),
      // Même filtre que le tirage (`openBooster`) : ce qui est montré est
      // exactement ce qui peut tomber.
      supabase
        .from("booster_pool_cards")
        .select("booster_definition_id, card_id, cards!inner(id, rarity, is_collectible, is_enabled)")
        .eq("is_enabled", true)
        .eq("cards.is_collectible", true)
        .eq("cards.is_enabled", true),
      supabase.from("player_cards").select("card_id").eq("user_id", userId).gt("quantity", 0),
    ]);

    if (pools.error) console.error("[fetchBoosterInventory] Pools illisibles :", pools.error.message);
    const poolByBooster = new Map<string, Array<{ cardId: string; rarity: CardRarity }>>();
    for (const row of pools.data ?? []) {
      const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
      if (!card) continue;
      const list = poolByBooster.get(row.booster_definition_id) ?? [];
      // Même source de vérité que le tirage : le code.
      list.push({ cardId: row.card_id, rarity: rarityForCardId(row.card_id) ?? (card.rarity as CardRarity) });
      poolByBooster.set(row.booster_definition_id, list);
    }

    const ownedByBooster = new Map((owned.data ?? []).map((row) => [row.booster_definition_id, row.quantity]));
    const obtainedByBooster = new Map((owned.data ?? []).map((row) => [row.booster_definition_id, row.updated_at]));
    const pityByBooster = new Map((pity.data ?? []).map((row) => [row.booster_definition_id, row.packs_since_abyssal]));

    return {
      isSignedIn: true,
      balance: currency.data?.balance ?? 0,
      boosters: (definitions.data ?? []).map((def) => ({
        boosterId: def.id,
        name: def.name,
        cardCount: def.card_count,
        price: def.price_currency,
        isPurchasable: def.is_purchasable,
        owned: ownedByBooster.get(def.id) ?? 0,
        obtainedAt: obtainedByBooster.get(def.id) ?? null,
        packsSinceAbyssal: pityByBooster.get(def.id) ?? 0,
        pool: poolByBooster.get(def.id) ?? [],
      })),
      ownedCardIds: (ownedCards.data ?? []).map((row) => row.card_id),
    };
  } catch (error) {
    console.error("[fetchBoosterInventory] Lecture impossible :", error);
    return empty;
  }
}

/**
 * Achat d'un ou plusieurs boosters contre des Tides.
 *
 * Le prix, le solde et le débit sont entièrement décidés en base
 * (`purchase_booster`, atomique et `security definer`) : la quantité est
 * la SEULE chose que le client envoie, et elle est bornée ici avant même
 * d'atteindre la fonction. Aucun prix ne transite par le navigateur.
 */
export async function purchaseBooster(boosterId: string, quantity = 1): Promise<ActionResult<{ balance: number }>> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Connecte-toi pour acheter un booster." };

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
    return { ok: false, error: `Quantité invalide (1 à ${MAX_PURCHASE_QUANTITY}).` };
  }

  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("purchase_booster", {
      p_user_id: session.userId,
      p_booster_id: boosterId,
      p_quantity: quantity,
    });

    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? "Achat refusé." };

    revalidatePath("/market");
    revalidatePath("/boosters");
    return { ok: true, data: { balance: data.balance ?? 0 } };
  } catch (error) {
    console.error("[purchaseBooster] Échec :", error);
    return { ok: false, error: describeFailure(error, "Achat impossible pour le moment.") };
  }
}

/**
 * Ouvre un booster possédé : tire les cartes côté serveur, puis applique
 * tout (consommation, collection, historique, pity) en une transaction.
 */
export async function openBooster(boosterId: string): Promise<ActionResult<OpenBoosterResult>> {
  const session = await requireUser();
  if (!session) return { ok: false, error: "Connecte-toi pour ouvrir un booster." };
  const { userId } = session;

  try {
    const service = createSupabaseServiceRoleClient();

    // Le pool, les règles de slots et le pity sont lus en base : c'est la
    // base qui décide de ce qui est tirable, pas le catalogue TypeScript
    // (une carte peut être désactivée ou rendue non collectionnable sans
    // toucher au moteur).
    const [slots, pool, pity, newCardPity, ownedCards] = await Promise.all([
      service
        .from("booster_slots")
        .select("slot_index, guaranteed_rarity, weighted_rarities")
        .eq("booster_definition_id", boosterId)
        .order("slot_index"),
      // Pool PROPRE À CE BOOSTER (`booster_pool_cards`) : c'est la table
      // qui fait autorité sur « dans quels boosters une carte peut
      // réellement apparaître ». La jointure ne garde que les cartes
      // encore collectionnables et actives — désactiver une carte la
      // retire de tous les boosters sans toucher aux pools.
      service
        .from("booster_pool_cards")
        .select("card_id, cards!inner(id, rarity, is_collectible, is_enabled)")
        .eq("booster_definition_id", boosterId)
        .eq("is_enabled", true)
        .eq("cards.is_collectible", true)
        .eq("cards.is_enabled", true),
      service
        .from("player_pity")
        .select("packs_since_abyssal")
        .eq("user_id", userId)
        .eq("booster_definition_id", boosterId)
        .maybeSingle(),
      // Compteur « sans nouveauté » à part : tant que la migration
      // `20260925120000_new_card_pity.sql` n'est pas appliquée, cette
      // requête échoue seule et la garantie reste simplement inactive.
      service
        .from("player_pity")
        .select("packs_since_new_card")
        .eq("user_id", userId)
        .eq("booster_definition_id", boosterId)
        .maybeSingle(),
      service.from("player_cards").select("card_id").eq("user_id", userId).gt("quantity", 0),
    ]);

    if (slots.error) return { ok: false, error: slots.error.message };
    if (pool.error) return { ok: false, error: pool.error.message };
    if (!slots.data || slots.data.length === 0) {
      return { ok: false, error: "Ce booster n'a pas de format défini." };
    }
    if (!pool.data || pool.data.length === 0) {
      // Cas réel si `npm run seed:cards` n'a jamais tourné, ou si le pool
      // de ce booster est vide : mieux vaut le dire que consommer le
      // booster du joueur pour ne rien lui rendre.
      return { ok: false, error: "Le pool de ce booster est vide — lance `npm run seed:cards`." };
    }

    const slotRules: BoosterSlotRule[] = slots.data.map((row) => ({
      slotIndex: row.slot_index,
      guaranteedRarity: row.guaranteed_rarity,
      weightedRarities: row.weighted_rarities,
    }));

    // Le pool lu en base est déjà celui de CE booster : plus rien à
    // exclure ici. L'ancien filtrage par rareté (`pool_excluded_rarities`)
    // n'avait de sens que tant que tous les boosters partageaient le même
    // pool — il ne pouvait de toute façon pas exprimer « ce booster-ci
    // contient ces cartes-là ».
    // La rareté vient du CODE (`rarityForCardId`), pas de la colonne
    // `cards.rarity` : c'est le code que `scripts/seedCards.ts` écrit en
    // base, donc une base pas encore resemée renvoyait la rareté standard
    // d'une variante Abyssale — et l'emplacement Abyssal tombait alors sur
    // la version normale de la carte. La divergence est signalée, jamais suivie.
    const poolCards: BoosterPoolCard[] = pool.data.map((row) => {
      const fromCode = rarityForCardId(row.cards.id);
      if (fromCode && fromCode !== row.cards.rarity) {
        console.warn(
          `[openBooster] Rareté périmée en base pour ${row.cards.id} : ${row.cards.rarity} en base, ${fromCode} dans le code — lance \`npm run seed:cards\`.`
        );
      }
      return { id: row.cards.id, rarity: fromCode ?? (row.cards.rarity as CardRarity) };
    });

    if (poolCards.length === 0) {
      return { ok: false, error: "Le pool de ce booster ne contient aucune carte éligible." };
    }

    const ownedCardIds = new Set((ownedCards.data ?? []).map((row) => row.card_id));

    const draw = drawBooster({
      slots: slotRules,
      pool: poolCards,
      ownedCardIds,
      packsSinceAbyssal: pity.data?.packs_since_abyssal ?? 0,
      packsSinceNewCard: newCardPity.data?.packs_since_new_card ?? 0,
      // Graine non déterministe : contrairement à une partie, une ouverture
      // n'a pas à être rejouable. C'est le seul endroit du code où on veut
      // explicitement de l'imprévisible.
      seed: createSeed(),
    });

    const { data, error } = await service.rpc("open_booster", {
      p_user_id: userId,
      p_booster_id: boosterId,
      p_card_ids: draw.cards.map((card) => card.cardId),
    });

    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? "Ouverture refusée." };

    // Compteur « sans nouveauté », à part de la fonction atomique : un
    // compteur qui dérive d'une unité après un incident est sans gravité,
    // là où réécrire `open_booster` demanderait de rejouer sa définition.
    if (newCardPity.error) {
      console.warn(
        "[openBooster] Garantie de nouveauté inactive : applique la migration 20260925120000_new_card_pity.sql.",
        newCardPity.error.message
      );
    } else {
      const { error: pityError } = await service.from("player_pity").upsert(
        {
          user_id: userId,
          booster_definition_id: boosterId,
          packs_since_new_card: draw.nextPacksSinceNewCard,
        },
        { onConflict: "user_id,booster_definition_id" }
      );
      if (pityError) console.error("[openBooster] Compteur de nouveauté non écrit :", pityError.message);
    }

    revalidatePath("/boosters");
    revalidatePath("/market");
    revalidatePath("/collection");

    return {
      ok: true,
      data: {
        cards: draw.cards.map(toOpenedCard),
        // `abyssal_pulled`/`packs_since_abyssal` viennent de la BASE, pas du
        // tirage : c'est `cards.rarity` qui fait autorité sur la rareté.
        abyssalPulled: data.abyssal_pulled ?? draw.abyssalPulled,
        packsSinceAbyssal: data.packs_since_abyssal ?? draw.nextPacksSinceAbyssal,
      },
    };
  } catch (error) {
    console.error("[openBooster] Échec :", error);
    return { ok: false, error: describeFailure(error, "Ouverture impossible pour le moment.") };
  }
}

function toOpenedCard(card: DrawnCard): OpenedCard {
  return { slotIndex: card.slotIndex, cardId: card.cardId, rarity: card.rarity, isNew: card.isNew };
}
