import { describe, expect, it } from "vitest";
import { CORE_SET, isAbyssalVariant, type CardDefinition } from "@/game";
import {
  EMPTY_FILTERS,
  costBucket,
  countMatching,
  hasActiveFilters,
  matchesFilters,
  type CollectionFilterState,
} from "@/features/collection/collectionFilters";

/**
 * Filtres de la Collection.
 *
 * L'axe « Statut de collection » ne peut pas être exercé depuis
 * l'interface sans une vraie session Supabase : c'est ici qu'il est
 * couvert, avec une possession simulée.
 */

const filters = (patch: Partial<CollectionFilterState> = {}): CollectionFilterState => ({ ...EMPTY_FILTERS, ...patch });
const NONE = new Set<string>();
const find = (predicate: (def: CardDefinition) => boolean): CardDefinition => {
  const found = CORE_SET.find(predicate);
  if (!found) throw new Error("Catalogue inattendu : aucune carte ne correspond à ce cas de test.");
  return found;
};

describe("filtres de la Collection", () => {
  it("sans filtre, laisse passer tout le catalogue", () => {
    const passing = CORE_SET.filter((def) => matchesFilters(def, filters(), NONE));
    expect(passing).toHaveLength(CORE_SET.length);
  });

  it("sépare Standard et Abyssal sans perdre ni compter deux fois une carte", () => {
    const standard = CORE_SET.filter((def) => matchesFilters(def, filters({ variant: "standard" }), NONE));
    const abyssal = CORE_SET.filter((def) => matchesFilters(def, filters({ variant: "abyssal" }), NONE));
    expect(standard.length + abyssal.length).toBe(CORE_SET.length);
    expect(abyssal.every((def) => isAbyssalVariant(def))).toBe(true);
    expect(standard.some((def) => isAbyssalVariant(def))).toBe(false);
  });

  it("partitionne Possédées / Manquantes selon la possession réelle", () => {
    const first = CORE_SET[0];
    const second = CORE_SET[1];
    if (!first || !second) throw new Error("Catalogue trop petit pour ce test.");
    const owned = new Set([first.id, second.id]);

    const possedees = CORE_SET.filter((def) => matchesFilters(def, filters({ ownership: "owned" }), owned));
    const manquantes = CORE_SET.filter((def) => matchesFilters(def, filters({ ownership: "missing" }), owned));

    expect(possedees.map((def) => def.id).sort()).toEqual([first.id, second.id].sort());
    expect(manquantes).toHaveLength(CORE_SET.length - 2);
    expect(possedees.length + manquantes.length).toBe(CORE_SET.length);
  });

  it("regroupe toutes les Raisons élevées sur le palier 6+", () => {
    expect(costBucket(0)).toBe(0);
    expect(costBucket(5)).toBe(5);
    expect(costBucket(6)).toBe(6);
    expect(costBucket(9)).toBe(6);

    const cheres = CORE_SET.filter((def) => matchesFilters(def, filters({ costs: [6] }), NONE));
    expect(cheres.every((def) => def.cost >= 6)).toBe(true);
  });

  it("traite la multi-sélection de Raison comme un OU", () => {
    const un = CORE_SET.filter((def) => matchesFilters(def, filters({ costs: [1] }), NONE)).length;
    const deux = CORE_SET.filter((def) => matchesFilters(def, filters({ costs: [2] }), NONE)).length;
    const unOuDeux = CORE_SET.filter((def) => matchesFilters(def, filters({ costs: [1, 2] }), NONE)).length;
    expect(unOuDeux).toBe(un + deux);
  });

  it("cherche dans le nom ET dans le texte de règles", () => {
    const parNom = find((def) => def.name.length > 0);
    expect(matchesFilters(parNom, filters({ search: parNom.name }), NONE)).toBe(true);

    const parTexte = find((def) => Boolean(def.text && def.text.length > 20));
    const extrait = (parTexte.text as string).slice(5, 22);
    expect(matchesFilters(parTexte, filters({ search: extrait }), NONE)).toBe(true);
  });

  it("ignore accents et casse dans la recherche", () => {
    const accentuee = find((def) => /[éèêàôûç]/i.test(def.name));
    const sansAccent = accentuee.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    expect(matchesFilters(accentuee, filters({ search: sansAccent }), NONE)).toBe(true);
  });

  it("combine les axes par ET", () => {
    const cible = find((def) => !isAbyssalVariant(def) && def.type === "creature");
    expect(matchesFilters(cible, filters({ variant: "standard", type: "creature" }), NONE)).toBe(true);
    expect(matchesFilters(cible, filters({ variant: "abyssal", type: "creature" }), NONE)).toBe(false);
  });

  it("compte une facette en neutralisant son propre axe", () => {
    // Le décompte affiché en face de « Abyssal » doit valoir ce qu'on
    // obtiendrait en cliquant dessus, même si « Standard » est actif.
    const actifs = filters({ variant: "standard" });
    const abyssales = countMatching(actifs, NONE, "variant", (def) => isAbyssalVariant(def));
    const reel = CORE_SET.filter((def) => matchesFilters(def, filters({ variant: "abyssal" }), NONE)).length;
    expect(abyssales).toBe(reel);
    expect(abyssales).toBeGreaterThan(0);
  });

  it("ne signale un filtre actif que s'il y en a un", () => {
    expect(hasActiveFilters(filters())).toBe(false);
    expect(hasActiveFilters(filters({ search: "   " }))).toBe(false);
    expect(hasActiveFilters(filters({ variant: "abyssal" }))).toBe(true);
    expect(hasActiveFilters(filters({ costs: [3] }))).toBe(true);
    expect(hasActiveFilters(filters({ ownership: "missing" }))).toBe(true);
  });
});
