import { describe, expect, it } from "vitest";
import {
  QUEST_OBJECTIVE_LABELS,
  VOYAGE_CATALOG,
  VOYAGE_STEP_COUNT,
  advanceVoyage,
  currentVoyage,
  freshVoyageProgress,
  nextClaimableTier,
  voyageById,
  voyageStepLabel,
  type VoyageProgress,
} from "@/game/quests";
import { SHELF_BOOSTER_IDS } from "@/game/boosters/extensions";
import { ACHIEVEMENT_CATALOG } from "@/game/achievements/catalog";
import { TITLE_CATALOG } from "@/game/titles/catalog";

/**
 * TRAVERSÉES — suites de cinq escales à paliers (audit du 24/09/2026).
 */

const premierQuart = voyageById("premier-quart")!;

describe("catalogue des Traversées", () => {
  it("trois Traversées de cinq escales, identifiants uniques, objectifs connus", () => {
    expect(VOYAGE_CATALOG.map((voyage) => voyage.id)).toEqual(["premier-quart", "eaux-troubles", "grand-fond"]);
    const codes = VOYAGE_CATALOG.flatMap((voyage) => voyage.steps.map((step) => `${voyage.id}/${step.code}`));
    expect(new Set(codes).size).toBe(codes.length);
    for (const voyage of VOYAGE_CATALOG) {
      expect(voyage.steps).toHaveLength(VOYAGE_STEP_COUNT);
      for (const step of voyage.steps) {
        expect(QUEST_OBJECTIVE_LABELS[step.objectiveKey], step.code).toBeDefined();
        expect(step.targetValue).toBeGreaterThan(0);
        expect(step.reward.xp).toBeGreaterThan(0);
      }
    }
  });

  it("les paliers montent en valeur, et le dernier porte le booster", () => {
    for (const voyage of VOYAGE_CATALOG) {
      const xp = voyage.steps.map((step) => step.reward.xp);
      expect([...xp].sort((a, b) => a - b), voyage.id).toEqual(xp);
      const withBooster = voyage.steps.filter((step) => step.reward.boosterId);
      expect(withBooster).toEqual([voyage.steps[VOYAGE_STEP_COUNT - 1]]);
      expect(SHELF_BOOSTER_IDS).toContain(withBooster[0]!.reward.boosterId);
    }
  });

  it("peu de Tides : l'économie des quêtes est déjà au-dessus de la cible", () => {
    const tides = VOYAGE_CATALOG.flatMap((voyage) => voyage.steps.map((step) => step.reward.tides)).reduce((a, b) => a + b, 0);
    expect(tides).toBeLessThanOrEqual(200);
  });

  it("chaque Traversée bouclée a son exploit, et son titre", () => {
    for (const voyage of VOYAGE_CATALOG) {
      expect(ACHIEVEMENT_CATALOG.some((achievement) => achievement.code === voyage.achievementCode), voyage.id).toBe(true);
      expect(TITLE_CATALOG.some((title) => title.unlock.code === voyage.achievementCode), voyage.id).toBe(true);
    }
  });

  it("des libellés lisibles", () => {
    expect(voyageStepLabel(premierQuart.steps[1]!)).toBe("Activer la capacité de votre Navire 3 fois");
  });
});

describe("avancement", () => {
  const progress = (partial: Partial<VoyageProgress> = {}): VoyageProgress => ({ ...freshVoyageProgress("premier-quart"), ...partial });

  it("n'avance que l'escale en cours", () => {
    const advance = advanceVoyage(premierQuart, progress(), { progress: { play_matches: 1, ship_ability_uses: 4 }, sets: {} });
    expect(advance).toMatchObject({ before: 0, after: 1, target: 3, completedStep: false });
    expect(advance!.next).toMatchObject({ stepIndex: 0, stepProgress: 1 });
  });

  it("boucler une escale monte d'un palier et ouvre la suivante à zéro — une seule par partie", () => {
    const advance = advanceVoyage(premierQuart, progress({ stepProgress: 2 }), { progress: { play_matches: 1, ship_ability_uses: 9 }, sets: {} });
    expect(advance).toMatchObject({ after: 3, completedStep: true });
    expect(advance!.next).toMatchObject({ stepIndex: 1, stepProgress: 0 });
  });

  it("rien qui bouge : rien à écrire", () => {
    expect(advanceVoyage(premierQuart, progress({ stepIndex: 1 }), { progress: { play_matches: 1 }, sets: {} })).toBeNull();
  });

  it("une Traversée bouclée ne bouge plus", () => {
    expect(advanceVoyage(premierQuart, progress({ stepIndex: VOYAGE_STEP_COUNT }), { progress: { win_matches: 1 }, sets: {} })).toBeNull();
  });

  it("une escale d'objectif `set` compte des decks DISTINCTS d'une partie à l'autre", () => {
    const grandFond = voyageById("grand-fond")!;
    const start = { ...freshVoyageProgress("grand-fond"), stepIndex: 2 };
    const first = advanceVoyage(grandFond, start, { progress: {}, sets: { distinct_decks_won: ["deck-a"] } })!;
    expect(first.next).toMatchObject({ stepProgress: 1, stepMeta: ["deck-a"] });
    expect(advanceVoyage(grandFond, first.next, { progress: {}, sets: { distinct_decks_won: ["deck-a"] } })).toBeNull();
    const third = advanceVoyage(grandFond, { ...first.next, stepProgress: 2, stepMeta: ["deck-a", "deck-b"] }, { progress: {}, sets: { distinct_decks_won: ["deck-c"] } })!;
    expect(third.completedStep).toBe(true);
  });

  it("la Traversée en cours est la première non bouclée ; la suivante s'ouvre après", () => {
    expect(currentVoyage(new Map())?.id).toBe("premier-quart");
    const done = new Map([["premier-quart", progress({ stepIndex: VOYAGE_STEP_COUNT })]]);
    expect(currentVoyage(done)?.id).toBe("eaux-troubles");
    const all = new Map(VOYAGE_CATALOG.map((voyage) => [voyage.id, { ...freshVoyageProgress(voyage.id), stepIndex: VOYAGE_STEP_COUNT }]));
    expect(currentVoyage(all)).toBeUndefined();
  });

  it("les paliers se réclament dans l'ordre, jamais au-delà du palier atteint", () => {
    expect(nextClaimableTier({ stepIndex: 0, claimedTiers: 0 })).toBeNull();
    expect(nextClaimableTier({ stepIndex: 2, claimedTiers: 0 })).toBe(1);
    expect(nextClaimableTier({ stepIndex: 2, claimedTiers: 2 })).toBeNull();
    expect(nextClaimableTier({ stepIndex: 5, claimedTiers: 4 })).toBe(5);
  });
});
