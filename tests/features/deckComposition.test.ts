import { describe, expect, it } from "vitest";
import { CORE_SET, getMaxCopies, RULES } from "@/game";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import {
  CURVE_OVERFLOW,
  costCurve,
  countInDeck,
  deckRuleIssue,
  deckSizeStatus,
  groupDeck,
  ownedPartOf,
  typeBreakdown,
} from "@/features/decks/deckComposition";

/** Lecture d'un deck en construction — dérivations pures sur la liste brute. */

const first = CORE_SET[0];
const second = CORE_SET[1];
if (!first || !second) throw new Error("Catalogue trop petit pour ces tests.");

describe("composition de deck", () => {
  it("regroupe les exemplaires en une ligne par carte, avec sa limite propre", () => {
    const entries = groupDeck([first.id, second.id, first.id]);
    expect(entries).toHaveLength(2);
    const line = entries.find((entry) => entry.cardId === first.id);
    expect(line?.count).toBe(2);
    expect(line?.max).toBe(getMaxCopies(first));
  });

  it("trie les lignes par Raison puis par nom", () => {
    const entries = groupDeck(CORE_SET.slice(0, 12).map((def) => def.id));
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1];
      const b = entries[i];
      if (!a || !b) continue;
      expect(a.def.cost < b.def.cost || (a.def.cost === b.def.cost && a.def.name.localeCompare(b.def.name, "fr") <= 0)).toBe(true);
    }
  });

  it("ignore une carte disparue du catalogue sans casser la liste", () => {
    const entries = groupDeck([first.id, "carte-qui-n-existe-plus"]);
    expect(entries.map((entry) => entry.cardId)).toEqual([first.id]);
  });

  it("compte les exemplaires d'une carte", () => {
    expect(countInDeck([first.id, second.id, first.id], first.id)).toBe(2);
    expect(countInDeck([], first.id)).toBe(0);
  });

  it("construit une courbe dont la somme est l'effectif, tout ce qui dépasse sur le dernier palier", () => {
    const ids = CORE_SET.slice(0, 20).map((def) => def.id);
    const curve = costCurve(ids);
    expect(curve.reduce((sum, value) => sum + value, 0)).toBe(ids.length);
    const expensive = CORE_SET.filter((def) => def.cost >= CURVE_OVERFLOW).map((def) => def.id);
    if (expensive.length > 0) expect(costCurve(expensive)[CURVE_OVERFLOW]).toBe(expensive.length);
  });

  it("ventile par type, somme égale à l'effectif", () => {
    const ids = CORE_SET.slice(0, 15).map((def) => def.id);
    const breakdown = typeBreakdown(ids);
    expect(breakdown.reduce((sum, item) => sum + item.count, 0)).toBe(ids.length);
  });

  it("qualifie la taille selon les règles du projet, jamais des valeurs en dur", () => {
    expect(deckSizeStatus(RULES.DECK_SIZE_MIN - 1)).toBe("short");
    expect(deckSizeStatus(RULES.DECK_SIZE_MIN)).toBe("valid");
    expect(deckSizeStatus(RULES.DECK_SIZE_MAX)).toBe("valid");
    expect(deckSizeStatus(RULES.DECK_SIZE_MAX + 1)).toBe("over");
  });

  it("remonte le message de validateDeckList, et rien quand le deck est jouable", () => {
    expect(deckRuleIssue([first.id], DEFAULT_SHIP_ID, "Test")).toMatch(/entre \d+ et \d+ cartes/);

    // Un deck jouable : on empile des cartes distinctes jusqu'au minimum,
    // chacune en dessous de sa limite.
    const playable: string[] = [];
    for (const def of CORE_SET) {
      if (playable.length >= RULES.DECK_SIZE_MIN) break;
      for (let i = 0; i < getMaxCopies(def) && playable.length < RULES.DECK_SIZE_MIN; i++) playable.push(def.id);
    }
    expect(deckRuleIssue(playable, DEFAULT_SHIP_ID, "Test")).toBeNull();
  });
});

describe("ownedPartOf — copier un deck avec ses seules cartes possédées", () => {
  it("garde chaque carte au plus autant de fois qu'on la possède, dans l'ordre, et compte le reste", () => {
    const list = ["a", "b", "a", "c", "a", "b"];
    const { kept, missing } = ownedPartOf(list, { a: 2, b: 5 });
    expect(kept).toEqual(["a", "b", "a", "b"]);
    expect(missing).toEqual([
      { cardId: "c", count: 1 },
      { cardId: "a", count: 1 },
    ]);
  });

  it("ne garde rien d'une collection vide, et tout d'une collection complète", () => {
    expect(ownedPartOf(["a", "a"], {}).kept).toEqual([]);
    expect(ownedPartOf(["a", "a"], { a: 3 })).toEqual({ kept: ["a", "a"], missing: [] });
  });
});
