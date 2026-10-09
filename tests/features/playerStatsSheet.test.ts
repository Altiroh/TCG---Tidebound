import { describe, expect, it } from "vitest";
import { buildPlayerStatsSheet, formatDuration, formatRate } from "@/features/progression/playerStatsSheet";
import { MATCH_STATS } from "@/game/quests";

/** Onglet Statistiques du profil : la fiche est pure, ses libellés pointent des clés réelles. */
describe("fiche des statistiques du joueur", () => {
  const input = {
    matchesPlayed: 12,
    wins: 7,
    losses: 5,
    level: 9,
    distinctCardsOwned: 80,
    boostersOpened: 4,
    lifetime: { play_seconds: 3 * 3600 + 7 * 60, play_creatures: 40, summon_units: 5, play_pvp_matches: 4, play_bot_matches: 6 },
    records: { play_seconds: 1500 },
  };

  it("met en forme durées et taux", () => {
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(12 * 60 + 5)).toBe("12 min");
    expect(formatDuration(3 * 3600 + 7 * 60)).toBe("3 h 07");
    expect(formatRate(7, 12)).toBe("58 %");
    expect(formatRate(1, 0)).toBe("—");
  });

  it("chiffres phares : bilan de la progression, temps et créatures des compteurs", () => {
    const sheet = buildPlayerStatsSheet(input);
    const value = (key: string) => sheet.highlights.find((row) => row.key === key)?.value;
    expect(value("matches")).toBe("12");
    expect(value("win_rate")).toBe("58 %");
    expect(value("play_seconds")).toBe("3 h 07");
    expect(value("play_creatures")).toBe("45");
    const avg = sheet.sections.flatMap((section) => section.rows).find((row) => row.key === "avg_seconds");
    expect(avg?.value).toBe("18 min");
  });

  it("chaque ligne de compteur lit une clé du catalogue", () => {
    const derived = new Set(["matches", "wins", "losses", "win_rate", "pvp", "bot", "first", "avg_seconds", "level", "distinct_cards", "boosters", "detailed_matches"]);
    for (const section of buildPlayerStatsSheet(input).sections) {
      for (const row of section.rows) {
        if (derived.has(row.key)) continue;
        const key = row.key.replace(/^record:/, "");
        expect(MATCH_STATS[key as keyof typeof MATCH_STATS], row.key).toBeDefined();
      }
    }
  });
});
