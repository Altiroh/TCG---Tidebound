import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game";
import {
  EMPTY_SHELF,
  FAVORITES_FILTER,
  NOTEBOOK_NAME_MAX,
  decodeShelfFilter,
  isStaleShelfFilter,
  normalizeNotebookName,
  notebookCover,
  notebookFilter,
  notebookNameTaken,
  shelfCardSet,
  withCardInNotebook,
  withFavorite,
  type CardShelf,
} from "@/features/collection/shelf/shelf";
import { EMPTY_FILTERS, countMatching, decodeCollectionFilters, hasActiveFilters, matchesFilters } from "@/features/collection/collectionFilters";

/**
 * L'ÉTAGÈRE — favoris et carnets. Règles pures partagées par les actions
 * serveur et l'écran : noms, couverture, filtre de la grille.
 */
const ID = "11111111-2222-4333-8444-555555555555";
const [a, b, c] = CORE_SET.slice(0, 3).map((def) => def.id) as [string, string, string];
const shelf: CardShelf = {
  favorites: [a],
  notebooks: [{ id: ID, name: "Combo Abysses", coverCardId: null, cardIds: [b, c], updatedAt: "2026-09-26T10:00:00Z" }],
};

describe("noms de carnet", () => {
  it("resserre les espaces et refuse le vide ou le trop long", () => {
    expect(normalizeNotebookName("  Combo   Abysses ")).toEqual({ ok: true, name: "Combo Abysses" });
    expect(normalizeNotebookName("   ").ok).toBe(false);
    expect(normalizeNotebookName("x".repeat(NOTEBOOK_NAME_MAX + 1)).ok).toBe(false);
  });

  it("deux carnets ne portent pas le même nom, casse ignorée — sauf lui-même au renommage", () => {
    expect(notebookNameTaken(shelf.notebooks, "combo  abysses")).toBe(true);
    expect(notebookNameTaken(shelf.notebooks, "Combo Abysses", ID)).toBe(false);
    expect(notebookNameTaken(shelf.notebooks, "Autre")).toBe(false);
  });
});

describe("couverture d'un carnet", () => {
  it("celle choisie tant qu'elle y est, sinon la première carte rangée", () => {
    expect(notebookCover({ coverCardId: c, cardIds: [b, c] })).toBe(c);
    expect(notebookCover({ coverCardId: null, cardIds: [b, c] })).toBe(b);
    // Retirée du carnet : la couverture choisie ne s'impose plus.
    expect(notebookCover({ coverCardId: a, cardIds: [b] })).toBe(b);
    expect(notebookCover({ coverCardId: null, cardIds: [] })).toBeNull();
  });
});

describe("mises à jour de l'étagère", () => {
  it("un favori s'ajoute et se retire, sans doublon", () => {
    expect(withFavorite(shelf, b, true).favorites).toEqual([a, b]);
    expect(withFavorite(shelf, a, true)).toBe(shelf);
    expect(withFavorite(shelf, a, false).favorites).toEqual([]);
  });

  it("ranger une carte rafraîchit le carnet ; la ranger deux fois ne change rien", () => {
    const now = "2026-09-26T12:00:00Z";
    const next = withCardInNotebook(shelf, ID, a, true, now);
    expect(next.notebooks[0]!.cardIds).toEqual([b, c, a]);
    expect(next.notebooks[0]!.updatedAt).toBe(now);
    expect(withCardInNotebook(shelf, ID, b, true, now).notebooks[0]).toBe(shelf.notebooks[0]);
    expect(withCardInNotebook(shelf, ID, b, false, now).notebooks[0]!.cardIds).toEqual([c]);
  });
});

describe("le filtre « Favoris & carnets » de la grille", () => {
  it("se relit depuis l'appareil sans laisser passer n'importe quoi", () => {
    expect(decodeShelfFilter(null)).toBeNull();
    expect(decodeShelfFilter(FAVORITES_FILTER)).toBe(FAVORITES_FILTER);
    expect(decodeShelfFilter(notebookFilter(ID))).toBe(`carnet:${ID}`);
    expect(decodeShelfFilter("carnet:pas-un-uuid")).toBeUndefined();
    expect(decodeShelfFilter(42)).toBeUndefined();
    expect(decodeCollectionFilters({ shelf: FAVORITES_FILTER }, EMPTY_FILTERS)?.shelf).toBe(FAVORITES_FILTER);
    expect(decodeCollectionFilters({ shelf: "n'importe quoi" }, EMPTY_FILTERS)?.shelf).toBeNull();
  });

  it("restreint la grille aux favoris ou aux cartes d'un carnet", () => {
    const favorites = shelfCardSet(shelf, FAVORITES_FILTER);
    const notebook = shelfCardSet(shelf, notebookFilter(ID));
    const filters = { ...EMPTY_FILTERS, shelf: notebookFilter(ID) };
    expect(CORE_SET.filter((def) => matchesFilters(def, filters, new Set(), undefined, notebook)).map((def) => def.id)).toEqual([b, c]);
    expect(favorites?.has(a)).toBe(true);
    expect(shelfCardSet(shelf, null)).toBeNull();
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("un carnet disparu ne vide pas la grille : le filtre est reconnu comme périmé", () => {
    const gone = notebookFilter("99999999-2222-4333-8444-555555555555");
    expect(shelfCardSet(shelf, gone)).toBeNull();
    expect(isStaleShelfFilter(shelf, gone)).toBe(true);
    expect(isStaleShelfFilter(shelf, notebookFilter(ID))).toBe(false);
    expect(isStaleShelfFilter(EMPTY_SHELF, FAVORITES_FILTER)).toBe(false);
  });

  it("les compteurs des autres axes tiennent compte du carnet choisi", () => {
    const notebook = shelfCardSet(shelf, notebookFilter(ID));
    const filters = { ...EMPTY_FILTERS, shelf: notebookFilter(ID) };
    expect(countMatching(filters, new Set(), "type", () => true, notebook)).toBe(2);
    // Le compteur de l'axe lui-même l'ignore : il annonce ce que donnerait un autre carnet.
    expect(countMatching(filters, new Set(), "shelf", () => true, notebook)).toBe(CORE_SET.length);
  });
});
