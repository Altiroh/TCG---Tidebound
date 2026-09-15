import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATALOG,
  achievementByCode,
  unlockedAchievements,
  type AchievementStats,
} from "@/game/achievements";
import {
  BORROWED_DECKS,
  CATALOG_DECKS,
  PRECON_DECKS,
  catalogDeckById,
  deckOwnership,
  isBorrowedDeckId,
  isPreconDeckId,
  ownershipLabel,
  RULES,
  validateDeckList,
} from "@/game";

const NO_PROGRESS: AchievementStats = {
  level: 1,
  wins: 0,
  matchesPlayed: 0,
  boostersOpened: 0,
  distinctCardsOwned: 0,
  ownsAbyssalCard: false,
  preconDecksUnlocked: 0,
  decksFullyOwned: 0,
  tutorialCompleted: false,
};

describe("catalogue d'exploits (Notion « Progression joueur » §10)", () => {
  it("a des codes uniques et une récompense positive", () => {
    const codes = ACHIEVEMENT_CATALOG.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const achievement of ACHIEVEMENT_CATALOG) {
      expect(achievement.rewardTides).toBeGreaterThan(0);
      expect(achievement.name.length).toBeGreaterThan(0);
      expect(achievement.description.length).toBeGreaterThan(0);
    }
  });

  it("un compte neuf n'a débloqué aucun exploit", () => {
    expect(unlockedAchievements(NO_PROGRESS)).toEqual([]);
  });

  it("couvre les jalons cités par la spec", () => {
    for (const code of ["first_win", "first_booster", "first_abyssal", "first_precon", "deck_fully_owned", "level_10", "level_50"]) {
      expect(achievementByCode(code), code).toBeDefined();
    }
  });

  it("se débloque à partir des compteurs persistés, donc rattrapable", () => {
    const stats: AchievementStats = { ...NO_PROGRESS, level: 22, wins: 3, matchesPlayed: 40, boostersOpened: 5, distinctCardsOwned: 70 };
    const codes = unlockedAchievements(stats).map((a) => a.code);
    expect(codes).toContain("first_win");
    expect(codes).toContain("first_booster");
    expect(codes).toContain("level_10");
    expect(codes).toContain("level_20");
    expect(codes).not.toContain("level_30");
    expect(codes).toContain("collection_60");
    expect(codes).not.toContain("collection_100");
    // Jamais débloqués : les compteurs correspondants sont à zéro.
    expect(codes).not.toContain("first_abyssal");
    expect(codes).not.toContain("first_precon");
  });

  it("est monotone : un compteur qui grandit ne retire jamais un exploit", () => {
    const low = unlockedAchievements({ ...NO_PROGRESS, level: 10, wins: 1 }).map((a) => a.code);
    const high = unlockedAchievements({ ...NO_PROGRESS, level: 30, wins: 50 }).map((a) => a.code);
    for (const code of low) expect(high).toContain(code);
  });
});

describe("catalogue de decks fournis (§3 et §4)", () => {
  it("sépare decks d'emprunt et préconstruits, sans recouvrement", () => {
    expect(BORROWED_DECKS.length).toBeGreaterThan(0);
    expect(PRECON_DECKS.length).toBeGreaterThan(0);
    for (const deck of BORROWED_DECKS) {
      expect(isBorrowedDeckId(deck.id)).toBe(true);
      expect(isPreconDeckId(deck.id)).toBe(false);
    }
    for (const deck of PRECON_DECKS) expect(isBorrowedDeckId(deck.id)).toBe(false);
  });

  it("propose un deck d'emprunt par Navire de départ, tous distincts", () => {
    const ships = BORROWED_DECKS.map((deck) => deck.shipId);
    expect(new Set(ships).size).toBe(ships.length);
  });

  it("donne à chaque deck les métadonnées que la fiche doit afficher", () => {
    for (const deck of CATALOG_DECKS) {
      expect(deck.style.length, deck.id).toBeGreaterThan(0);
      expect(deck.difficulty, deck.id).toBeGreaterThanOrEqual(1);
      expect(deck.difficulty, deck.id).toBeLessThanOrEqual(5);
      expect(deck.mechanics.length, deck.id).toBeGreaterThan(0);
      expect(catalogDeckById(deck.id)).toBe(deck);
    }
  });

  it("ne propose que des listes réellement jouables — un deck d'emprunt ne doit jamais être refusé par le serveur", () => {
    for (const deck of CATALOG_DECKS) {
      const result = validateDeckList(deck);
      expect(result.ok, `${deck.id} : ${result.ok ? "" : result.error}`).toBe(true);
      expect(deck.cardIds.length).toBeGreaterThanOrEqual(RULES.DECK_SIZE_MIN);
    }
  });
});

describe("possession d'un deck — possédé contre prêté (§3)", () => {
  const deck = ["a", "a", "a", "b", "b", "c"];

  it("compte à l'EXEMPLAIRE, pas à la carte distincte", () => {
    const ownership = deckOwnership(deck, { a: 1, b: 2 });
    expect(ownership.total).toBe(6);
    expect(ownership.owned).toBe(3);
    expect(ownership.borrowed).toBe(3);
    expect(ownership.complete).toBe(false);
  });

  it("ne compte jamais plus d'exemplaires que le deck n'en demande", () => {
    const ownership = deckOwnership(deck, { a: 99, b: 99, c: 99 });
    expect(ownership.owned).toBe(6);
    expect(ownership.borrowed).toBe(0);
    expect(ownership.complete).toBe(true);
  });

  it("traite une collection vide comme entièrement prêtée", () => {
    const ownership = deckOwnership(deck, {});
    expect(ownership.owned).toBe(0);
    expect(ownership.borrowed).toBe(6);
    expect(ownership.cards.every((card) => card.owned === 0)).toBe(true);
  });

  it("reprend les formulations de la spec", () => {
    expect(ownershipLabel(deckOwnership(deck, {}))).toBe("6 prêtées");
    expect(ownershipLabel(deckOwnership(deck, { a: 1, b: 2 }))).toBe("3 possédées · 3 prêtées");
    expect(ownershipLabel(deckOwnership(deck, { a: 3, b: 2, c: 1 }))).toBe("Équipage complété — 6/6");
  });

  it("résout les noms et coûts réels pour un vrai deck du catalogue", () => {
    const real = BORROWED_DECKS[0]!;
    const ownership = deckOwnership(real.cardIds, {});
    expect(ownership.total).toBe(real.cardIds.length);
    expect(ownership.cards.every((card) => card.name !== card.cardId)).toBe(true);
    // Trié par Raison croissante — l'ordre de lecture d'une liste de deck.
    const costs = ownership.cards.map((card) => card.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it("ne casse pas sur une carte retirée du catalogue : elle reste comptée prêtée", () => {
    const ownership = deckOwnership(["carte-qui-nexiste-plus"], { "carte-qui-nexiste-plus": 3 });
    // Possédée au sens du compteur, mais listée sans nom résolu.
    expect(ownership.total).toBe(1);
    expect(ownership.cards[0]!.name).toBe("carte-qui-nexiste-plus");
  });
});
