import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `resolveMatchDeck` — le deck qu'un joueur emmène dans une partie arbitrée.
 *
 * Ce qui est vérifié ici n'est pas « la requête est bien écrite » mais les
 * trois propriétés dont dépendent l'XP et la sécurité :
 *   - un deck personnel devient une vraie liste jouable (sinon la partie
 *     bascule en local et ne rapporte rien) ;
 *   - il n'est résolu que pour son PROPRIÉTAIRE ;
 *   - une liste illégale est refusée côté serveur, quoi qu'en dise la
 *     colonne `is_valid`.
 */

interface DeckRow {
  id: string;
  user_id: string;
  name: string;
  ship_id: string;
}

const deckRows: DeckRow[] = [];
const deckCardRows: { deck_id: string; card_id: string; quantity: number }[] = [];
/** Erreur simulée sur la prochaine lecture — pour le cas « base injoignable ». */
let readError: string | null = null;

/** Faux client Supabase : juste assez de `from().select().eq().maybeSingle()` pour ce module. */
function fakeService() {
  return {
    from(table: string) {
      const filters: Record<string, string> = {};
      const builder = {
        select: () => builder,
        eq(column: string, value: string) {
          filters[column] = value;
          return builder;
        },
        maybeSingle() {
          if (readError) return Promise.resolve({ data: null, error: { message: readError } });
          const row = deckRows.find((deck) =>
            Object.entries(filters).every(([column, value]) => deck[column as keyof DeckRow] === value)
          );
          return Promise.resolve({ data: row ?? null, error: null });
        },
        then(resolve: (value: { data: unknown; error: { message: string } | null }) => unknown) {
          if (readError) return Promise.resolve({ data: null, error: { message: readError } }).then(resolve);
          const rows = table === "player_deck_cards" ? deckCardRows.filter((card) => card.deck_id === filters.deck_id) : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => fakeService(),
  createSupabaseServerClient: () => fakeService(),
}));

const { resolveMatchDeck, findCatalogDeck } = await import("@/features/decks/matchDeck");
const { PLAYABLE_DECKS } = await import("@/game");

const OWNER = "11111111-1111-1111-1111-111111111111";
const STRANGER = "22222222-2222-2222-2222-222222222222";
const DECK_ID = "33333333-3333-3333-3333-333333333333";

/** Un deck personnel légal : la liste d'un deck du catalogue, recopiée sous un uuid. */
function seedPersonalDeck(cardIds: readonly string[]) {
  const model = PLAYABLE_DECKS[0]!;
  deckRows.push({ id: DECK_ID, user_id: OWNER, name: "Mon deck", ship_id: model.shipId });
  const counts = new Map<string, number>();
  for (const cardId of cardIds) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  for (const [cardId, quantity] of counts) deckCardRows.push({ deck_id: DECK_ID, card_id: cardId, quantity });
}

beforeEach(() => {
  deckRows.length = 0;
  deckCardRows.length = 0;
  readError = null;
});

describe("resolveMatchDeck", () => {
  it("rend une liste du jeu sans interroger la base", async () => {
    const catalog = PLAYABLE_DECKS[0]!;
    const result = await resolveMatchDeck(OWNER, catalog.id);
    expect(result).toEqual({ ok: true, deck: catalog });
    expect(findCatalogDeck(catalog.id)).toBe(catalog);
  });

  it("rend le deck personnel de son propriétaire, un exemplaire par carte", async () => {
    const model = PLAYABLE_DECKS[0]!;
    seedPersonalDeck(model.cardIds);

    const result = await resolveMatchDeck(OWNER, DECK_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.id).toBe(DECK_ID);
    expect(result.deck.shipId).toBe(model.shipId);
    expect([...result.deck.cardIds].sort()).toEqual([...model.cardIds].sort());
  });

  it("ne rend pas le deck d'un autre joueur", async () => {
    seedPersonalDeck(PLAYABLE_DECKS[0]!.cardIds);
    expect(await resolveMatchDeck(STRANGER, DECK_ID)).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuse une liste illégale, même enregistrée en base", async () => {
    seedPersonalDeck(PLAYABLE_DECKS[0]!.cardIds.slice(0, 3));
    const result = await resolveMatchDeck(OWNER, DECK_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
  });

  it("distingue « deck inconnu » de « base injoignable »", async () => {
    expect(await resolveMatchDeck(OWNER, "pas-un-uuid")).toEqual({ ok: false, reason: "unknown" });

    readError = "connexion perdue";
    expect(await resolveMatchDeck(OWNER, DECK_ID)).toEqual({ ok: false, reason: "unavailable" });
  });
});
