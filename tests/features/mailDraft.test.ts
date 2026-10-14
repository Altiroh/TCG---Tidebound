import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game/cards/sets/core";
import { cardThumbnail, hasGifts, mailGiftItems, normalizeMailDraft, parseBoosterGifts, thumbnailCardId, type MailDraft } from "@/features/mail/mailDraft";

const base: MailDraft = { title: "Bienvenue", body: "", thumbnail: null, gifts: { tides: 0, xp: 0, boosters: [] }, audience: "self" };

describe("courrier de bord : brouillon", () => {
  it("rogne le titre et accepte un courrier sans cadeau", () => {
    const result = normalizeMailDraft({ ...base, title: "  Maintenance  " });
    expect(result).toEqual({ ok: true, draft: { ...base, title: "Maintenance" } });
  });

  it("refuse un titre vide ou trop long", () => {
    expect(normalizeMailDraft({ ...base, title: "   " }).ok).toBe(false);
    expect(normalizeMailDraft({ ...base, title: "x".repeat(81) }).ok).toBe(false);
  });

  it("refuse des cadeaux négatifs, fractionnaires ou démesurés", () => {
    expect(normalizeMailDraft({ ...base, gifts: { tides: -5, xp: 0, boosters: [] } }).ok).toBe(false);
    expect(normalizeMailDraft({ ...base, gifts: { tides: 0, xp: 1.5, boosters: [] } }).ok).toBe(false);
    expect(normalizeMailDraft({ ...base, gifts: { tides: 100_001, xp: 0, boosters: [] } }).ok).toBe(false);
  });

  it("fusionne les boosters d'un même sachet et retire les quantités nulles", () => {
    const result = normalizeMailDraft({
      ...base,
      gifts: {
        tides: 0,
        xp: 0,
        boosters: [
          { boosterId: "standard", count: 2 },
          { boosterId: "standard", count: 1 },
          { boosterId: "poissons-pas-frais", count: 0 },
        ],
      },
    });
    expect(result.ok && result.draft.gifts.boosters).toEqual([{ boosterId: "standard", count: 3 }]);
  });

  it("refuse un booster inconnu ; la miniature est l'illustration d'une carte qui existe", () => {
    expect(normalizeMailDraft({ ...base, gifts: { tides: 0, xp: 0, boosters: [{ boosterId: "pirate", count: 1 }] } }).ok).toBe(false);
    expect(normalizeMailDraft({ ...base, thumbnail: "javascript:alert(1)" }).ok).toBe(false);
    expect(normalizeMailDraft({ ...base, thumbnail: "data:image/webp;base64,AAAA" }).ok).toBe(false);
    expect(normalizeMailDraft({ ...base, thumbnail: "card:carte-qui-n-existe-pas" }).ok).toBe(false);
    const someCard = CORE_SET.find((card) => !card.token)!.id;
    expect(normalizeMailDraft({ ...base, thumbnail: cardThumbnail(someCard) }).ok).toBe(true);
    expect(thumbnailCardId(cardThumbnail(someCard))).toBe(someCard);
  });

  it("refuse une forme illisible venue du navigateur", () => {
    expect(normalizeMailDraft({ ...base, title: 42 } as unknown as MailDraft).ok).toBe(false);
    expect(normalizeMailDraft({ ...base, audience: "everyone" } as unknown as MailDraft).ok).toBe(false);
  });
});

describe("courrier de bord : cadeaux", () => {
  it("traduit les cadeaux en récompenses affichables", () => {
    const gifts = { tides: 50, xp: 100, boosters: [{ boosterId: "standard", count: 2 }] };
    expect(hasGifts(gifts)).toBe(true);
    expect(mailGiftItems(gifts)).toEqual([
      { kind: "tides", amount: 50 },
      { kind: "xp", amount: 100 },
      { kind: "booster", boosterId: "standard", count: 2 },
    ]);
    expect(hasGifts({ tides: 0, xp: 0, boosters: [] })).toBe(false);
  });

  it("ignore les entrées mal formées de la colonne des boosters", () => {
    expect(parseBoosterGifts([{ boosterId: "standard", count: 1 }, { boosterId: 3 }, "x", { boosterId: "a", count: 0 }])).toEqual([{ boosterId: "standard", count: 1 }]);
    expect(parseBoosterGifts(null)).toEqual([]);
  });
});
