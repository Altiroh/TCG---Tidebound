import { describe, expect, it } from "vitest";
import { CORE_SET, UN_DEAD } from "@/game/cards/sets/core";
import {
  BOOSTER_BIENVENUE,
  BOOSTER_DEFAUT,
  BOOSTER_ETRANGETE_SOUS_MARINE,
  BOOSTER_POISSONS_PAS_FRAIS,
  BOOSTER_POOLS,
  BOOSTER_VEILLEE_DES_DISPARUS,
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

  it("respecte les effectifs de la répartition Notion, Lot 12 compris", () => {
    // 61 à l'origine, 63 depuis les deux Structures anti-swarm du
    // 21/09/2026 (La Nasse Trop Pleine, Le Rôle d'Équipage) : elles tiennent
    // du même socle « fondamentaux de Structures » que B1 enseigne déjà.
    expect(BOOSTER_POOLS[BOOSTER_DEFAUT]).toHaveLength(63);
    expect(BOOSTER_POOLS[BOOSTER_POISSONS_PAS_FRAIS]).toHaveLength(65);
    expect(BOOSTER_POOLS[BOOSTER_ETRANGETE_SOUS_MARINE]).toHaveLength(64);
  });

  it("n'a que trois cartes passerelles ENTRE LES TROIS PREMIERS boosters, exactement celles que le cadrage nomme", () => {
    // La règle des trois passerelles vient de la « Répartition globale des
    // boosters » (Notion), écrite quand B1-B3 étaient tout le Market : trois
    // cartes seulement pouvaient tomber dans deux boosters.
    //
    // La Veillée des Disparus (B4) est délibérément hors de ce compte : sa
    // page de lot demande « des cartes génériques ou RÉÉDITIONS
    // complémentaires », faute de quoi le booster serait mono-famille — un
    // archétype fermé, exactement ce que l'audit d'équilibrage reproche. Les
    // rééditions de B4 ne sont donc pas des passerelles au sens du cadrage.
    const trio = [BOOSTER_DEFAUT, BOOSTER_POISSONS_PAS_FRAIS, BOOSTER_ETRANGETE_SOUS_MARINE];
    const bridges = [...CATALOGUE]
      .filter((id) => trio.filter((b) => BOOSTER_POOLS[b]!.includes(id)).length > 1)
      .sort();
    expect(bridges).toEqual(["arlecchino-des-profondeurs", "le-masque-fendu", "pulcinella-gonfle"]);
  });

  it("donne à La Veillée des Disparus son noyau Un Dead et des rééditions, pas un booster fermé", () => {
    const pool = BOOSTER_POOLS[BOOSTER_VEILLEE_DES_DISPARUS]!;
    const unDead = pool.filter((id) => CORE_SET.find((def) => def.id === id)?.subtype === UN_DEAD);
    // Le cadrage du lot demande « environ 16 à 18 entrées Un Dead en
    // comptant les variantes ».
    expect(unDead.length).toBeGreaterThanOrEqual(16);
    expect(unDead.length).toBeLessThanOrEqual(18);
    // …et assez de compléments pour que le booster ne soit pas mono-famille.
    expect(pool.length - unDead.length).toBeGreaterThanOrEqual(10);
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

  it("ne laisse aucune carte du catalogue hors booster", () => {
    // Les trois dernières orphelines ont été rattachées le 18/09/2026
    // (Guetteur Méfiant en B1, Revenante de la Fosse — ABYSSALE en B2,
    // Masse-Sombre — ABYSSALE en B3) : tout le catalogue est obtenable.
    // Une carte ajoutée sans booster échoue donc ici, au lieu de rester
    // inobtenable sans que rien ne le signale.
    expect(unobtainableCardIds().sort()).toEqual([]);
  });
});
