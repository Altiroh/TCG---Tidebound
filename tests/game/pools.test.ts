import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game/cards/sets/core";
import {
  BOOSTER_BIENVENUE,
  BOOSTER_DEFAUT,
  BOOSTER_ETRANGETE_SOUS_MARINE,
  BOOSTER_POISSONS_PAS_FRAIS,
  BOOSTER_POOLS,
  boostersContaining,
  PURCHASABLE_BOOSTER_IDS,
  unobtainableCardIds,
} from "@/game/boosters/pools";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { RARITY_ORDER } from "@/game/boosters/types";

const CATALOGUE = new Set(CORE_SET.map((def) => def.id));

describe("pools de boosters", () => {
  it("ne référence que des cartes qui existent, sans doublon", () => {
    for (const [boosterId, cardIds] of Object.entries(BOOSTER_POOLS)) {
      const unknown = cardIds.filter((id) => !CATALOGUE.has(id));
      expect(unknown, `${boosterId} référence des cartes inconnues`).toEqual([]);
      expect(new Set(cardIds).size, `${boosterId} contient un doublon`).toBe(cardIds.length);
    }
  });

  it("respecte les effectifs de la répartition Notion du 15 septembre", () => {
    expect(BOOSTER_POOLS[BOOSTER_DEFAUT]).toHaveLength(46);
    expect(BOOSTER_POOLS[BOOSTER_POISSONS_PAS_FRAIS]).toHaveLength(50);
    expect(BOOSTER_POOLS[BOOSTER_ETRANGETE_SOUS_MARINE]).toHaveLength(51);
  });

  it("n'a que trois cartes passerelles, exactement celles que le cadrage nomme", () => {
    const bridges = [...CATALOGUE]
      .filter((id) => PURCHASABLE_BOOSTER_IDS.filter((b) => BOOSTER_POOLS[b]!.includes(id)).length > 1)
      .sort();
    expect(bridges).toEqual(["arlecchino-des-profondeurs", "le-masque-fendu", "pulcinella-gonfle"]);
  });

  it("place chaque passerelle dans les deux boosters annoncés", () => {
    expect(boostersContaining("pulcinella-gonfle")).toContain(BOOSTER_DEFAUT);
    expect(boostersContaining("pulcinella-gonfle")).toContain(BOOSTER_ETRANGETE_SOUS_MARINE);
    expect(boostersContaining("arlecchino-des-profondeurs")).toContain(BOOSTER_POISSONS_PAS_FRAIS);
    expect(boostersContaining("le-masque-fendu")).toContain(BOOSTER_POISSONS_PAS_FRAIS);
  });

  it("garde chaque booster achetable capable de remplir tous ses slots", () => {
    // Un pool sans Commune, sans Peu commune ou sans Rare ferait retomber
    // des slots sur le palier voisin et fausserait tout le booster.
    for (const boosterId of PURCHASABLE_BOOSTER_IDS) {
      const rarities = new Set(BOOSTER_POOLS[boosterId]!.map((id) => rarityForCardId(id)));
      for (const needed of ["common", "uncommon", "rare"] as const) {
        expect(rarities.has(needed), `${boosterId} n'a aucune carte ${needed}`).toBe(true);
      }
    }
  });

  it("donne à chaque booster achetable ses propres Abyssales", () => {
    // « Lorsqu'il produit une Abyssale, le tirage se fait uniquement parmi
    // les variantes rattachées au booster ouvert » : un booster sans
    // Abyssale rendrait son slot Profondeur et son pity sans objet.
    for (const boosterId of PURCHASABLE_BOOSTER_IDS) {
      const abyssals = BOOSTER_POOLS[boosterId]!.filter((id) => rarityForCardId(id) === "abyssal");
      expect(abyssals.length, `${boosterId} n'a aucune Abyssale`).toBeGreaterThan(0);
    }
  });

  it("exclut du Booster de Bienvenue les Abyssales et les cartes d'archétype", () => {
    const welcome = BOOSTER_POOLS[BOOSTER_BIENVENUE]!;
    expect(welcome.length).toBeGreaterThan(0);
    for (const id of welcome) {
      expect(rarityForCardId(id)).not.toBe("abyssal");
      expect(CORE_SET.find((def) => def.id === id)?.archetype).toBeUndefined();
    }
    // Il reste un sous-ensemble strict de B1.
    expect(welcome.every((id) => BOOSTER_POOLS[BOOSTER_DEFAUT]!.includes(id))).toBe(true);
  });

  it("n'utilise que des raretés connues", () => {
    for (const cardIds of Object.values(BOOSTER_POOLS)) {
      for (const id of cardIds) expect(RARITY_ORDER).toContain(rarityForCardId(id));
    }
  });

  it("laisse hors booster exactement les trois cartes absentes de la répartition Notion", () => {
    // Elles ne sont mentionnées dans aucun des trois pools du cadrage :
    // elles sont donc inobtenables aujourd'hui. Constat volontairement
    // figé ici pour qu'un ajout de carte oublié se voie tout de suite.
    expect(unobtainableCardIds().sort()).toEqual([
      "guetteur-mefiant",
      "masse-sombre-abyssal",
      "revenante-de-la-fosse-abyssal",
    ]);
  });
});
