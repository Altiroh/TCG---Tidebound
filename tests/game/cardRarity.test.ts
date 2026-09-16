import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game";
import { RARITY_ORDER } from "@/game/boosters";
import {
  PROVISIONAL_RARITY_CARD_IDS,
  assertRarityCoverage,
  cardIdsMissingRarity,
  rarityForCardId,
} from "@/game/boosters/cardRarity";

describe("couverture de rareté du catalogue", () => {
  /*
   * Ce test est le garde-fou du système de boosters. Sans lui, une carte
   * ajoutée au catalogue retombe en `common` par défaut côté base et
   * déséquilibre silencieusement tous les tirages. Une carte ajoutée DOIT
   * casser ce test jusqu'à ce que sa rareté soit décidée.
   */
  it("attribue une rareté explicite à chaque carte du catalogue", () => {
    expect(cardIdsMissingRarity()).toEqual([]);
    expect(() => assertRarityCoverage()).not.toThrow();
  });

  it("ne rend que des raretés valides", () => {
    for (const def of CORE_SET) {
      expect(RARITY_ORDER).toContain(rarityForCardId(def.id));
    }
  });

  it("classe toute variante Abyssale en rareté abyssale", () => {
    const variants = CORE_SET.filter((def) => def.id.endsWith("-abyssal"));
    expect(variants.length).toBeGreaterThan(0);
    for (const def of variants) {
      expect(rarityForCardId(def.id)).toBe("abyssal");
    }
  });

  it("garde chaque palier peuplé — un booster ne peut pas remplir ses slots sinon", () => {
    const counts = new Map<string, number>();
    for (const def of CORE_SET) {
      const rarity = rarityForCardId(def.id)!;
      counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
    }
    for (const rarity of RARITY_ORDER) {
      expect(counts.get(rarity) ?? 0).toBeGreaterThan(0);
    }
  });

  it("réserve la rareté Abyssale aux variantes « -abyssal », et à elles seules", () => {
    /*
     * RÈGLE VERROUILLÉE (design, 2026-09-16) : « une carte Abyssale est la
     * variante `-abyssal`, sinon au mieux c'est légendaire ». Le test la
     * vérifie dans LES DEUX SENS.
     *
     * Elle vient d'une régression : neuf cartes valaient `abyssal` parce
     * que l'audit les nommait ainsi avant que la variante n'existe comme
     * mécanique. La rareté avait suivi l'IDENTIFIANT au lieu de suivre la
     * carte, et un emplacement de booster tiré en Abyssale rendait la
     * version Standard, annoncée « ABYSSALE » à l'écran.
     */
    const usurpatrices = CORE_SET.filter((def) => !def.id.endsWith("-abyssal") && rarityForCardId(def.id) === "abyssal").map(
      (def) => def.id
    );
    expect(usurpatrices, "sans le suffixe « -abyssal », une carte plafonne à légendaire").toEqual([]);

    const oubliees = CORE_SET.filter((def) => def.id.endsWith("-abyssal") && rarityForCardId(def.id) !== "abyssal").map(
      (def) => def.id
    );
    expect(oubliees, "toute variante « -abyssal » est Abyssale par construction").toEqual([]);
  });

  it("n'a aucune rareté en attente d'arbitrage du design", () => {
    /*
     * Toutes les raretés sont validées (les six cartes postérieures à
     * l'audit l'ont été le 2026-09-12). Ajouter une entrée dans
     * `PROVISIONAL_RARITY` fera donc échouer ce test jusqu'à ce que le
     * design tranche : c'est un rappel qui bloque, pas un TODO qu'on oublie.
     */
    expect(PROVISIONAL_RARITY_CARD_IDS).toEqual([]);
  });
});
