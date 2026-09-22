import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * LE NÉCESSAIRE DU MARIN, DE L'ACHAT À LA COLLECTION.
 *
 * Même méthode que `matchLoopE2E.test.ts` : les VRAIS services serveur
 * (`features/boosters/actions.ts`, `features/progression/*`) sur une base
 * en mémoire transcrite des migrations. Ce qui est vérifié, ce sont les
 * LIGNES ÉCRITES — un solde débité, une réserve créditée, des cartes qui
 * arrivent en collection — et pas seulement qu'un service rend `ok: true`.
 *
 * Le booster est ajouté à un système qui en portait déjà quatre : la
 * moitié de ces tests sert donc à vérifier qu'il s'y insère SANS RIEN
 * DÉPLACER — le Défaut s'achète et s'ouvre toujours comme avant, avec son
 * prix, son format et son pity à lui.
 */

const USER = "11111111-1111-1111-1111-111111111111";

const db = new FakeDatabase();
let sessionUserId: string | null = USER;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));

vi.mock("@/lib/supabase/sessionUser", () => ({
  getSessionUser: async () => (sessionUserId ? { id: sessionUserId, email: "joueur@tidebound.test" } : null),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { purchaseBooster, openBooster, fetchBoosterInventory } = await import("@/features/boosters/actions");
const { cardRows, boosterPoolCardRows } = await import("@/scripts/seedRows");
const { BOOSTER_POOLS } = await import("@/game/boosters/pools");
const { rarityForCardId } = await import("@/game/boosters/cardRarity");
const { LEVEL_REWARDS } = await import("@/game/progression/levelRewards");
const { BOOSTER_STANDARD_PRICE } = await import("@/game/economy/constants");

const NECESSAIRE = "necessaire-du-marin";
const STANDARD = "standard";

/**
 * Définitions et slots des deux boosters, recopiés de leurs migrations —
 * les migrations les portent en SQL littéral, elles ne sont pas dérivables
 * du code.
 */
function seedReferenceData(): void {
  for (const row of cardRows()) db.table("cards").push({ ...row });
  for (const row of boosterPoolCardRows()) db.table("booster_pool_cards").push({ ...row });

  db.table("booster_definitions").push({
    id: STANDARD,
    name: "Booster Défaut",
    card_count: 8,
    price_currency: 100,
    is_purchasable: true,
    is_enabled: true,
  });
  db.table("booster_definitions").push({
    id: NECESSAIRE,
    name: "Nécessaire du Marin",
    card_count: 6,
    price_currency: 100,
    is_purchasable: true,
    is_enabled: true,
  });

  const standardSlots = [
    { slot_index: 1, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 2, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 3, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 4, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 5, guaranteed_rarity: "uncommon", weighted_rarities: null },
    { slot_index: 6, guaranteed_rarity: "uncommon", weighted_rarities: null },
    { slot_index: 7, guaranteed_rarity: null, weighted_rarities: { rare: 85, epic: 12, legendary: 3 } },
    { slot_index: 8, guaranteed_rarity: null, weighted_rarities: { uncommon: 55, rare: 35, abyssal: 10 } },
  ];
  for (const slot of standardSlots) db.table("booster_slots").push({ booster_definition_id: STANDARD, ...slot });

  // `20261002120000_booster_necessaire_du_marin.sql`.
  const necessaireSlots = [
    { slot_index: 1, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 2, guaranteed_rarity: "common", weighted_rarities: null },
    { slot_index: 3, guaranteed_rarity: "uncommon", weighted_rarities: null },
    { slot_index: 4, guaranteed_rarity: "uncommon", weighted_rarities: null },
    { slot_index: 5, guaranteed_rarity: null, weighted_rarities: { rare: 85, epic: 12, legendary: 3 } },
    { slot_index: 6, guaranteed_rarity: null, weighted_rarities: { uncommon: 55, rare: 35, abyssal: 10 } },
  ];
  for (const slot of necessaireSlots) db.table("booster_slots").push({ booster_definition_id: NECESSAIRE, ...slot });
}

function crediterTides(montant: number): void {
  db.upsert("player_currency", { user_id: USER, balance: montant }, (row) => {
    row.balance = montant;
  });
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.rpcCalls.length = 0;
  sessionUserId = USER;
  seedReferenceData();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Nécessaire du Marin — prix et achat", () => {
  it("coûte exactement 100 Tides, comme le booster d'entrée", () => {
    expect(db.one("booster_definitions", { id: NECESSAIRE })!.price_currency).toBe(100);
    expect(db.one("booster_definitions", { id: NECESSAIRE })!.price_currency).toBe(BOOSTER_STANDARD_PRICE);
  });

  it("un achat retire 100 Tides et crédite un exemplaire", async () => {
    crediterTides(250);
    const result = await purchaseBooster(NECESSAIRE, 1);

    expect(result.ok).toBe(true);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(150);
    expect(db.one("player_boosters", { user_id: USER, booster_definition_id: NECESSAIRE })!.quantity).toBe(1);
  });

  it("refuse l'achat sous 100 Tides, sans rien débiter ni créditer", async () => {
    crediterTides(99);
    const result = await purchaseBooster(NECESSAIRE, 1);

    expect(result.ok).toBe(false);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(99);
    expect(db.one("player_boosters", { user_id: USER, booster_definition_id: NECESSAIRE })).toBeUndefined();
  });
});

describe("Nécessaire du Marin — ouverture", () => {
  async function ouvrirUn() {
    crediterTides(1000);
    await purchaseBooster(NECESSAIRE, 1);
    return openBooster(NECESSAIRE);
  }

  it("rend exactement 6 cartes", async () => {
    const result = await ouvrirUn();
    expect(result.ok).toBe(true);
    expect(result.data!.cards).toHaveLength(6);
  });

  it("ne tire QUE des cartes du pool autorisé", async () => {
    const pool = new Set(BOOSTER_POOLS[NECESSAIRE]!);
    // Dix ouvertures : une seule ne dirait rien d'un tirage aléatoire.
    crediterTides(10_000);
    await purchaseBooster(NECESSAIRE, 10);
    for (let i = 0; i < 10; i += 1) {
      const result = await openBooster(NECESSAIRE);
      expect(result.ok).toBe(true);
      for (const card of result.data!.cards) expect(pool.has(card.cardId)).toBe(true);
    }
  });

  it("respecte la rareté annoncée par chaque slot", async () => {
    const result = await ouvrirUn();
    const cards = result.data!.cards;
    expect(cards.slice(0, 2).map((c) => c.rarity)).toEqual(["common", "common"]);
    expect(cards.slice(2, 4).map((c) => c.rarity)).toEqual(["uncommon", "uncommon"]);
    // Slot 5 : « Rare ou mieux ». Slot 6 : Profondeur.
    expect(["rare", "epic", "legendary"]).toContain(cards[4]!.rarity);
    expect(["uncommon", "rare", "abyssal"]).toContain(cards[5]!.rarity);
  });

  it("ajoute les cartes à la collection, et consomme l'exemplaire ouvert", async () => {
    const result = await ouvrirUn();
    const tirees = result.data!.cards.map((c) => c.cardId);

    for (const cardId of new Set(tirees)) {
      const ligne = db.one("player_cards", { user_id: USER, card_id: cardId });
      expect(ligne, cardId).toBeDefined();
      expect(ligne!.quantity).toBe(tirees.filter((id) => id === cardId).length);
    }
    expect(db.one("player_boosters", { user_id: USER, booster_definition_id: NECESSAIRE })!.quantity).toBe(0);
  });

  it("cumule les doublons sur la ligne existante plutôt que d'en créer une seconde", async () => {
    crediterTides(10_000);
    await purchaseBooster(NECESSAIRE, 6);

    const total = new Map<string, number>();
    for (let i = 0; i < 6; i += 1) {
      const result = await openBooster(NECESSAIRE);
      for (const card of result.data!.cards) total.set(card.cardId, (total.get(card.cardId) ?? 0) + 1);
    }

    for (const [cardId, attendu] of total) {
      const lignes = db.table("player_cards").filter((r) => r.user_id === USER && r.card_id === cardId);
      // La clé primaire (user_id, card_id) interdit une seconde ligne : un
      // doublon s'accumule sur la même.
      expect(lignes, cardId).toHaveLength(1);
      expect(lignes[0]!.quantity, cardId).toBe(attendu);
    }
  });

  it("suit le pity Abyssal existant : garantie au 20e booster, sans règle propre au lot", async () => {
    crediterTides(100_000);
    await purchaseBooster(NECESSAIRE, 1);
    // 19 boosters déjà ouverts sans Abyssale : le 20e la garantit.
    db.upsert(
      "player_pity",
      { user_id: USER, booster_definition_id: NECESSAIRE, packs_since_abyssal: 19, packs_since_new_card: 0 },
      (row) => {
        row.packs_since_abyssal = 19;
      }
    );

    const result = await openBooster(NECESSAIRE);
    expect(result.ok).toBe(true);
    expect(result.data!.abyssalPulled).toBe(true);
    expect(result.data!.cards.some((c) => c.rarity === "abyssal")).toBe(true);
  });

  it("garde un pity SÉPARÉ par booster : ouvrir le Nécessaire ne touche pas celui du Défaut", async () => {
    crediterTides(10_000);
    await purchaseBooster(NECESSAIRE, 1);
    await openBooster(NECESSAIRE);

    expect(db.one("player_pity", { user_id: USER, booster_definition_id: NECESSAIRE })).toBeDefined();
    expect(db.one("player_pity", { user_id: USER, booster_definition_id: STANDARD })).toBeUndefined();
  });
});

describe("Nécessaire du Marin — récompense de progression", () => {
  it("figure dans la table des paliers, à plusieurs niveaux", () => {
    const niveaux = Object.entries(LEVEL_REWARDS)
      .filter(([, items]) => items.some((item) => item.kind === "booster" && item.boosterId === NECESSAIRE))
      .map(([level]) => Number(level));

    expect(niveaux.length).toBeGreaterThanOrEqual(5);
    // Le premier tombe tôt : le joueur doit tenir des outils avant d'avoir
    // fini de découvrir le jeu.
    expect(Math.min(...niveaux)).toBeLessThanOrEqual(10);
  });

  it("n'a remplacé AUCUN booster Standard ni aucun gros palier", () => {
    // Les sept Standard du cadrage restent en place : le Nécessaire
    // s'ajoute à la découverte, il ne la remplace pas.
    const standard = Object.entries(LEVEL_REWARDS)
      .filter(([, items]) => items.some((item) => item.kind === "booster" && item.boosterId === STANDARD))
      .map(([level]) => Number(level));
    expect(standard.sort((a, b) => a - b)).toEqual([4, 14, 24, 34, 39, 44, 49]);

    // Jetons de Préconstruit tous les 10 niveaux, intacts.
    for (const niveau of [10, 20, 30, 40, 50]) {
      expect(LEVEL_REWARDS[niveau]!.some((item) => item.kind === "preconToken"), `niveau ${niveau}`).toBe(true);
    }
  });

  it("reçu en récompense, il ne coûte aucun Tide", async () => {
    crediterTides(500);
    // Le crédit d'un booster de palier passe par `claim_level_reward`, qui
    // écrit dans `player_boosters` sans toucher à la bourse.
    const avant = db.one("player_currency", { user_id: USER })!.balance;
    db.upsert(
      "player_boosters",
      { user_id: USER, booster_definition_id: NECESSAIRE, quantity: 1 },
      (row) => {
        row.quantity += 1;
      }
    );

    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(avant);
    const result = await openBooster(NECESSAIRE);
    expect(result.ok).toBe(true);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(avant);
  });
});

describe("les boosters existants ne bougent pas", () => {
  it("le Défaut coûte toujours 100 Tides et rend toujours 8 cartes", async () => {
    crediterTides(500);
    const achat = await purchaseBooster(STANDARD, 1);
    expect(achat.ok).toBe(true);
    expect(db.one("player_currency", { user_id: USER })!.balance).toBe(400);

    const result = await openBooster(STANDARD);
    expect(result.ok).toBe(true);
    expect(result.data!.cards).toHaveLength(8);
    const pool = new Set(BOOSTER_POOLS[STANDARD]!);
    for (const card of result.data!.cards) expect(pool.has(card.cardId)).toBe(true);
  });

  it("l'inventaire présente les deux boosters, chacun avec son format et son prix", async () => {
    const inventaire = await fetchBoosterInventory();
    const parId = new Map(inventaire.boosters.map((b) => [b.boosterId, b]));

    expect(parId.get(STANDARD)).toMatchObject({ cardCount: 8, price: 100, isPurchasable: true });
    expect(parId.get(NECESSAIRE)).toMatchObject({ cardCount: 6, price: 100, isPurchasable: true });
    expect(parId.get(NECESSAIRE)!.pool.length).toBeGreaterThan(40);
  });

  it("chaque carte du pool porte une rareté connue du moteur", () => {
    for (const cardId of BOOSTER_POOLS[NECESSAIRE]!) {
      expect(rarityForCardId(cardId), cardId).not.toBeNull();
    }
  });
});
