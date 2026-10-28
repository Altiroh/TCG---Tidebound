import { describe, expect, it } from "vitest";
import { BOOSTER_POOLS, PURCHASABLE_BOOSTER_IDS, BOOSTER_NECESSAIRE_DU_MARIN } from "@/game/boosters/pools";
import { boosterArtworksFor, cardChancePerBooster, drawBooster, rarityForCardId } from "@/game/boosters";
import type { BoosterPoolCard, BoosterSlotRule, CardRarity } from "@/game/boosters/types";
import { BOOSTER_SPECIALIZED_PRICE, BOOSTER_STANDARD_PRICE } from "@/game/economy/constants";
import { BOOSTER_DEFAUT } from "@/game/boosters/pools";
import { CARD_ARTWORK_ODDS } from "@/game/cosmetics/editions";
import { CARD_FINISH_ODDS, rareFinishChance } from "@/game/cosmetics/finishes";
import { editionRecycleValueOf } from "@/features/collection/recycleValue";

/**
 * CHANCES D'OBTENTION (18/10/2026) — combien de boosters pour une carte,
 * une illustration, une finition, et ce que rapporte un booster revendu.
 *
 * Tout passe par le VRAI tirage (`drawBooster`), les VRAIS pools
 * (`BOOSTER_POOLS`) et les formats d'emplacements des migrations
 * (`booster_slots`) : ce test mesure ce que le joueur vivra, pas un modèle à
 * part. Le joueur simulé possède déjà tout le pool — la protection Abyssale
 * et la garantie de carte nouvelle, qui AIDENT un débutant, n'interviennent
 * donc pas : ce sont les chances BRUTES, le pire cas.
 *
 * Le tableau s'affiche dans la sortie du test :
 *   npx vitest run tests/game/obtentionCartes.test.ts
 */

/** Format des boosters à huit cartes (migrations 20260916120000 et suivantes). */
const HUIT_CARTES: BoosterSlotRule[] = [
  { slotIndex: 1, guaranteedRarity: "common" },
  { slotIndex: 2, guaranteedRarity: "common" },
  { slotIndex: 3, guaranteedRarity: "common" },
  { slotIndex: 4, guaranteedRarity: "common" },
  { slotIndex: 5, guaranteedRarity: "uncommon" },
  { slotIndex: 6, guaranteedRarity: "uncommon" },
  { slotIndex: 7, weightedRarities: { rare: 85, epic: 12, legendary: 3 } },
  { slotIndex: 8, weightedRarities: { uncommon: 55, rare: 35, abyssal: 10 } },
];

/** Nécessaire du Marin : six cartes (migration 20261002120000). */
const SIX_CARTES: BoosterSlotRule[] = [
  { slotIndex: 1, guaranteedRarity: "common" },
  { slotIndex: 2, guaranteedRarity: "common" },
  { slotIndex: 3, guaranteedRarity: "uncommon" },
  { slotIndex: 4, guaranteedRarity: "uncommon" },
  { slotIndex: 5, weightedRarities: { rare: 85, epic: 12, legendary: 3 } },
  { slotIndex: 6, weightedRarities: { uncommon: 55, rare: 35, abyssal: 10 } },
];

const TIRAGES = 12_000;
const RARETES: CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "abyssal"];

interface Mesure {
  boosterId: string;
  /** Chance qu'une carte PRÉCISE sorte dans un booster, par carte. */
  parCarte: Map<string, number>;
  rarete: Map<string, CardRarity>;
  /** Chance d'au moins une Styled / une Full-Art / une finition rare dans un booster. */
  styled: number;
  fullArt: number;
  finition: number;
  /** Tides moyens d'un booster entièrement revendu, éditions comprises. */
  revente: number;
}

function mesurer(boosterId: string): Mesure {
  const pool: BoosterPoolCard[] = (BOOSTER_POOLS[boosterId] ?? []).map((id) => ({ id, rarity: rarityForCardId(id) ?? "common" }));
  const slots = boosterId === BOOSTER_NECESSAIRE_DU_MARIN ? SIX_CARTES : HUIT_CARTES;
  const possede = new Set(pool.map((card) => card.id));
  const presences = new Map<string, number>(pool.map((card) => [card.id, 0]));
  let styled = 0;
  let fullArt = 0;
  let finition = 0;
  let revente = 0;
  let seed = 7;
  for (let i = 0; i < TIRAGES; i += 1) {
    const result = drawBooster({
      slots,
      pool,
      ownedCardIds: possede,
      packsSinceAbyssal: 0,
      seed,
      artworksFor: (cardId) => boosterArtworksFor(boosterId, cardId),
    });
    seed = result.nextSeed;
    const vues = new Set<string>();
    for (const card of result.cards) {
      vues.add(card.cardId);
      revente += editionRecycleValueOf(card.cardId, { artwork: card.artwork ?? "classique", finish: card.finish ?? "classique" }) ?? 0;
    }
    for (const id of vues) presences.set(id, (presences.get(id) ?? 0) + 1);
    if (result.cards.some((c) => c.artwork === "styled")) styled += 1;
    if (result.cards.some((c) => c.artwork === "styled-fa")) fullArt += 1;
    if (result.cards.some((c) => c.finish)) finition += 1;
  }
  return {
    boosterId,
    parCarte: new Map([...presences].map(([id, n]) => [id, n / TIRAGES])),
    rarete: new Map(pool.map((card) => [card.id, card.rarity])),
    styled: styled / TIRAGES,
    fullArt: fullArt / TIRAGES,
    finition: finition / TIRAGES,
    revente: revente / TIRAGES,
  };
}

/**
 * Boosters attendus pour TOUT le pool (collectionneur de vignettes, chances
 * inégales) : E = ∫₀^∞ (1 − Π(1 − e^(−p·t))) dt, intégré numériquement.
 */
function boostersPourCompleter(chances: number[]): number {
  let total = 0;
  const pas = 0.5;
  for (let t = 0; t < 200_000; t += pas) {
    const toutes = chances.reduce((prod, p) => prod * (1 - Math.exp(-p * t)), 1);
    total += (1 - toutes) * pas;
    if (1 - toutes < 1e-6) break;
  }
  return total;
}

const arrondi = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

const MESURES = PURCHASABLE_BOOSTER_IDS.map(mesurer);

describe("chances d'obtention des cartes et des éditions", () => {
  it("la chance analytique d'une carte par booster (`cardChancePerBooster`) suit le tirage réel", () => {
    for (const m of MESURES) {
      const pool: BoosterPoolCard[] = (BOOSTER_POOLS[m.boosterId] ?? []).map((id) => ({ id, rarity: rarityForCardId(id) ?? "common" }));
      const slots = m.boosterId === BOOSTER_NECESSAIRE_DU_MARIN ? SIX_CARTES : HUIT_CARTES;
      for (const [cardId, mesuree] of m.parCarte) {
        const calculee = cardChancePerBooster(slots, pool, cardId);
        // Bruit d'échantillonnage : 4 écarts-types de la mesure sur TIRAGES boosters.
        const tolerance = 4 * Math.sqrt((calculee * (1 - calculee)) / TIRAGES) + 0.002;
        expect(Math.abs(calculee - mesuree), `${m.boosterId} / ${cardId}`).toBeLessThan(tolerance);
      }
    }
  });

  it("affiche le tableau des chances, booster par booster", () => {
    const lignes = MESURES.map((m) => {
      const ligne: Record<string, string | number> = { booster: m.boosterId };
      for (const rarete of RARETES) {
        const chances = [...m.parCarte].filter(([id]) => m.rarete.get(id) === rarete).map(([, p]) => p);
        if (chances.length === 0) continue;
        const moyenne = chances.reduce((a, b) => a + b, 0) / chances.length;
        // « 1 sur N » : boosters attendus pour voir UNE carte précise de cette rareté.
        ligne[rarete] = `${chances.length} × 1/${arrondi(1 / moyenne)}`;
      }
      ligne["tout le pool"] = Math.round(boostersPourCompleter([...m.parCarte.values()]));
      ligne["≥1 finition"] = `1/${arrondi(1 / m.finition)}`;
      ligne["≥1 Styled"] = m.styled > 0 ? `1/${arrondi(1 / m.styled)}` : "—";
      ligne["≥1 Full-Art"] = m.fullArt > 0 ? `1/${arrondi(1 / m.fullArt)}` : "—";
      ligne["revente moy."] = Math.round(m.revente);
      return ligne;
    });
    console.log("\nCHANCES PAR BOOSTER (carte précise : « nb cartes × 1 sur N boosters »)");
    console.table(lignes);
    expect(lignes.length).toBe(PURCHASABLE_BOOSTER_IDS.length);
  });

  it("chaque carte d'un pool peut sortir de son booster", () => {
    for (const m of MESURES) {
      for (const [cardId, p] of m.parCarte) expect(p, `${cardId} dans ${m.boosterId}`).toBeGreaterThan(0);
    }
  });

  it("une édition précise est rare, une Styled Full-Art Star Foil précise ultra ultra rare", () => {
    const lignes: Array<Record<string, string>> = [];
    for (const m of MESURES) {
      for (const [cardId, p] of m.parCarte) {
        const illustrations = boosterArtworksFor(m.boosterId, cardId);
        if (illustrations.length === 0) continue;
        const styled = illustrations.includes("styled") ? p * CARD_ARTWORK_ODDS.styled : 0;
        const fullArt = illustrations.includes("styled-fa") ? p * CARD_ARTWORK_ODDS["styled-fa"] : 0;
        const ultra = fullArt * CARD_FINISH_ODDS["star-foil"];
        lignes.push({
          carte: cardId,
          booster: m.boosterId,
          carte_seule: `1/${arrondi(1 / p)}`,
          styled: styled ? `1/${arrondi(1 / styled)}` : "—",
          full_art: fullArt ? `1/${arrondi(1 / fullArt)}` : "—",
          full_art_star_foil: ultra ? `1/${Math.round(1 / ultra).toLocaleString("fr-FR")}` : "—",
        });
        // Ultra ultra rare : moins d'une chance sur 500 000 par booster, même
        // pour une Commune d'un petit pool (Gaston, ≈ 1 sur 900 000).
        if (ultra) expect(ultra, cardId).toBeLessThan(2e-6);
        if (fullArt) expect(fullArt, cardId).toBeLessThan(styled || 1);
      }
    }
    console.log("\nÉDITIONS D'UNE CARTE PRÉCISE (par booster ouvert)");
    console.table(lignes);
    expect(lignes.length).toBeGreaterThan(0);
  });

  it("au moins une finition rare tombe environ dans un booster sur vingt-cinq", () => {
    for (const m of MESURES) {
      const cartes = m.boosterId === BOOSTER_NECESSAIRE_DU_MARIN ? 6 : 8;
      const attendu = 1 - (1 - rareFinishChance()) ** cartes;
      expect(m.finition, m.boosterId).toBeGreaterThan(attendu * 0.7);
      expect(m.finition, m.boosterId).toBeLessThan(attendu * 1.3);
    }
  });

  it("revendre un booster entier, éditions comprises, rapporte EN MOYENNE moins que son prix", () => {
    // Prix des `booster_definitions` : 100 Tides pour le Défaut et le
    // Nécessaire du Marin, 150 pour les extensions. Le jackpot d'une
    // Full-Art Star Foil ne doit jamais faire d'un booster un placement.
    const prix = (id: string) => (id === BOOSTER_DEFAUT || id === BOOSTER_NECESSAIRE_DU_MARIN ? BOOSTER_STANDARD_PRICE : BOOSTER_SPECIALIZED_PRICE);
    for (const m of MESURES) expect(m.revente, m.boosterId).toBeLessThan(prix(m.boosterId) * 0.95);
  });
});
