import { describe, expect, it } from "vitest";
import { DECK_STYLES, deckStyleFromText, isDeckStyleId } from "@/game";
import { DECK_SORTS, filterDecks, sortDecks, type DeckEntry } from "@/features/decks/deckFilters";

function deck(entry: Partial<DeckEntry> & { id: string }): DeckEntry {
  return {
    name: entry.id,
    shipId: "le-courlis",
    style: "Tempo",
    cardCount: 40,
    ...entry,
  };
}

describe("type de jeu : une liste fermée", () => {
  it("range un style écrit à la main dans une case de l'énumération", () => {
    expect(deckStyleFromText("Agressif / swarm")).toBe("agressif");
    expect(deckStyleFromText("Défensif / lourd")).toBe("defensif");
    expect(deckStyleFromText("Polyvalent / midrange")).toBe("midrange");
    expect(deckStyleFromText("Synergies nommées")).toBe("combo");
  });

  it("laisse décider le mot-clé écrit EN PREMIER", () => {
    // « Tempo / contrôle léger » est du tempo : c'est ce que son auteur a
    // mis en tête. La règle inverse en aurait fait du contrôle.
    expect(deckStyleFromText("Tempo / contrôle léger")).toBe("tempo");
    expect(deckStyleFromText("Contrôle tempo")).toBe("controle");
  });

  it("ne range pas de force un style qu'il ne reconnaît pas", () => {
    expect(deckStyleFromText("Environnemental")).toBeNull();
  });

  it("ignore accents et casse", () => {
    expect(deckStyleFromText("CONTROLE")).toBe("controle");
    expect(deckStyleFromText("contrôle")).toBe("controle");
  });

  it("n'accepte comme type que les valeurs de l'énumération", () => {
    for (const style of DECK_STYLES) expect(isDeckStyleId(style.id)).toBe(true);
    expect(isDeckStyleId("aggro")).toBe(false);
    expect(isDeckStyleId(null)).toBe(false);
  });
});

describe("recherche de l'écran Decks", () => {
  const decks = [
    deck({ id: "a", name: "Cra-Poi Swarm", style: "Agressif / swarm", shipId: "le-brise-lames" }),
    deck({ id: "b", name: "Le Courlis", style: "Tempo / contrôle léger", shipId: "le-courlis" }),
    deck({ id: "c", name: "Marée Control", style: "Contrôle", shipId: "l-errant" }),
  ];

  it("sans recherche, ne retire rien", () => {
    expect(filterDecks(decks, "")).toHaveLength(3);
    expect(filterDecks(decks, "   ")).toHaveLength(3);
  });

  it("cherche sans tenir compte des accents ni de la casse", () => {
    expect(filterDecks(decks, "maree").map((d) => d.id)).toEqual(["c"]);
    expect(filterDecks(decks, "COURLIS").map((d) => d.id)).toEqual(["b"]);
  });
});

describe("tri des decks", () => {
  it("propose bien les quatre critères annoncés", () => {
    expect(DECK_SORTS.map((entry) => entry.id)).toEqual(["updated", "created", "name", "size"]);
  });

  it("met la modification la plus récente en tête", () => {
    const decks = [
      deck({ id: "vieux", updatedAt: "2026-01-01T00:00:00Z" }),
      deck({ id: "recent", updatedAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(sortDecks(decks, "updated").map((d) => d.id)).toEqual(["recent", "vieux"]);
  });

  it("garde l'ordre d'origine à critère égal — un rayon ne saute pas d'une visite à l'autre", () => {
    // Les decks fournis par le jeu n'ont aucune date : sans stabilité, leur
    // ordre dépendrait de l'implémentation du tri.
    const decks = [deck({ id: "un" }), deck({ id: "deux" }), deck({ id: "trois" })];
    expect(sortDecks(decks, "updated").map((d) => d.id)).toEqual(["un", "deux", "trois"]);
  });

  it("trie par nom et par taille", () => {
    const decks = [deck({ id: "b", name: "Brise", cardCount: 30 }), deck({ id: "a", name: "Abysses", cardCount: 50 })];
    expect(sortDecks(decks, "name").map((d) => d.id)).toEqual(["a", "b"]);
    expect(sortDecks(decks, "size").map((d) => d.id)).toEqual(["a", "b"]);
  });
});
