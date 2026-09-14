"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createSeed } from "@/game/rng";
import { MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";
import { drawBooster, type BoosterPoolCard, type BoosterSlotRule, type CardRarity, type DrawnCard } from "@/game/boosters";

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
  /** Boosters ouverts depuis la dernière Abyssale, pour CE type de booster. */
  packsSinceAbyssal: number;
}

export interface BoosterInventory {
  isSignedIn: boolean;
  /** Solde de Tides. */
  balance: number;
  boosters: BoosterInventoryEntry[];
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

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/** Inventaire de boosters + solde de Tides du joueur connecté. */
export async function fetchBoosterInventory(): Promise<BoosterInventory> {
  const empty: BoosterInventory = { isSignedIn: false, balance: 0, boosters: [] };

  try {
    const session = await requireUser();
    if (!session) return empty;
    const { supabase, userId } = session;

    const [definitions, owned, pity, currency] = await Promise.all([
      supabase.from("booster_definitions").select("*").eq("is_enabled", true).order("id"),
      supabase.from("player_boosters").select("booster_definition_id, quantity").eq("user_id", userId),
      supabase.from("player_pity").select("booster_definition_id, packs_since_abyssal").eq("user_id", userId),
      supabase.from("player_currency").select("balance").eq("user_id", userId).maybeSingle(),
    ]);

    const ownedByBooster = new Map((owned.data ?? []).map((row) => [row.booster_definition_id, row.quantity]));
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
        packsSinceAbyssal: pityByBooster.get(def.id) ?? 0,
      })),
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
    return { ok: false, error: "Achat impossible pour le moment." };
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
    const [definition, slots, pool, pity, ownedCards] = await Promise.all([
      service.from("booster_definitions").select("pool_excluded_rarities").eq("id", boosterId).maybeSingle(),
      service
        .from("booster_slots")
        .select("slot_index, guaranteed_rarity, weighted_rarities")
        .eq("booster_definition_id", boosterId)
        .order("slot_index"),
      // Pool restreint au lot "core" : les lots d'archétype (Lot 10
      // Cra-Poiscail) sont dans le catalogue et jouables, mais ne doivent
      // tomber que dans LEUR booster dédié — le plan de diffusion interdit
      // notamment tout Cra-Poiscail dans le Mini Booster de Bienvenue. Tant
      // que ces boosters n'existent pas, leurs cartes ne sont tirées nulle
      // part.
      service.from("cards").select("id, rarity").eq("is_collectible", true).eq("is_enabled", true).eq("set_code", "core"),
      service
        .from("player_pity")
        .select("packs_since_abyssal")
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
      // Cas réel si `npm run seed:cards` n'a jamais tourné : mieux vaut le
      // dire que consommer le booster pour rien.
      return { ok: false, error: "Aucune carte collectionnable en base — lance `npm run seed:cards`." };
    }

    const slotRules: BoosterSlotRule[] = slots.data.map((row) => ({
      slotIndex: row.slot_index,
      guaranteedRarity: row.guaranteed_rarity,
      weightedRarities: row.weighted_rarities,
    }));

    // Exclusions de pool (ex: pas d'Abyssale dans le Mini Booster de
    // Bienvenue). Filtrées ICI, avant le tirage : un slot qui viserait une
    // rareté exclue retombera sur le palier voisin peuplé via le repli de
    // `drawBooster`, plutôt que de produire une carte interdite.
    const excluded = new Set<CardRarity>(definition.data?.pool_excluded_rarities ?? []);
    const poolCards: BoosterPoolCard[] = pool.data
      .filter((row) => !excluded.has(row.rarity))
      .map((row) => ({ id: row.id, rarity: row.rarity }));

    if (poolCards.length === 0) {
      return { ok: false, error: "Le pool de ce booster ne contient aucune carte éligible." };
    }

    const ownedCardIds = new Set((ownedCards.data ?? []).map((row) => row.card_id));

    const draw = drawBooster({
      slots: slotRules,
      pool: poolCards,
      ownedCardIds,
      packsSinceAbyssal: pity.data?.packs_since_abyssal ?? 0,
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
    return { ok: false, error: "Ouverture impossible pour le moment." };
  }
}

function toOpenedCard(card: DrawnCard): OpenedCard {
  return { slotIndex: card.slotIndex, cardId: card.cardId, rarity: card.rarity, isNew: card.isNew };
}
