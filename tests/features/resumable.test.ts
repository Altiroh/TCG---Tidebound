import { describe, expect, it } from "vitest";
import { BOT_MATCH_IDLE_MS, WAITING_MATCH_IDLE_MS, resumeVerdict } from "@/features/online/resumable";

/** « Une partie t'attend » ne se propose que pour une partie qui se reprend vraiment (28/09/2026). */
const now = Date.parse("2026-09-28T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("Bandeau « Une partie t'attend »", () => {
  it("propose une partie contre le bot récente et en cours", () => {
    expect(resumeVerdict({ mode: "bot", status: "active", updatedAt: ago(60_000) }, "active", now)).toBe("resume");
  });

  it("ferme une table contre le bot délaissée depuis trop longtemps", () => {
    expect(resumeVerdict({ mode: "bot", status: "active", updatedAt: ago(BOT_MATCH_IDLE_MS + 1) }, "active", now)).toBe("close");
  });

  it("ferme une partie dont l'état de jeu manque ou ne se relit plus", () => {
    expect(resumeVerdict({ mode: "bot", status: "active", updatedAt: ago(1000) }, "missing", now)).toBe("close");
    expect(resumeVerdict({ mode: "matchmaking", status: "active", updatedAt: ago(1000) }, "broken", now)).toBe("close");
  });

  it("tait une partie terminée en jeu, sans la réécrire (sa fin se règle ailleurs)", () => {
    expect(resumeVerdict({ mode: "bot", status: "active", updatedAt: ago(1000) }, "finished", now)).toBe("hide");
  });

  it("garde une PvP en cours même ancienne : ses échéances la font avancer", () => {
    expect(resumeVerdict({ mode: "matchmaking", status: "active", updatedAt: ago(BOT_MATCH_IDLE_MS * 3) }, "active", now)).toBe("resume");
  });

  it("expire une invitation que personne n'a rejointe", () => {
    expect(resumeVerdict({ mode: "private_invite", status: "waiting", updatedAt: ago(1000) }, "missing", now)).toBe("resume");
    expect(resumeVerdict({ mode: "private_invite", status: "waiting", updatedAt: ago(WAITING_MATCH_IDLE_MS + 1) }, "missing", now)).toBe("close");
  });
});
