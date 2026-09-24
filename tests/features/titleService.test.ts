import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TITRES — le service serveur.
 *
 * Deux promesses : on ne peut pas porter un titre non gagné (la preuve est
 * relue en base AVANT l'écriture), et l'appli ne casse pas tant que la
 * migration `player_titles` n'est pas passée (pas de titre, pas d'erreur).
 */

/** Lignes par table, filtrées par égalité. */
const tables: Record<string, Array<Record<string, unknown>>> = {};
/** Tables absentes de la base (migration pas encore appliquée). */
const missing = new Set<string>();
/** Réponse de chaque fonction Postgres. */
const rpcResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

function fakeClient() {
  return {
    from(name: string) {
      const filters: Array<[string, unknown]> = [];
      const result = () =>
        missing.has(name)
          ? { data: null, error: { message: `relation "public.${name}" does not exist` } }
          : { data: (tables[name] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value)), error: null };
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return builder;
        },
        maybeSingle: () => {
          const { data, error } = result();
          return Promise.resolve({ data: data ? (data[0] ?? null) : null, error });
        },
      };
      return builder;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResults[fn] ?? { data: { ok: true }, error: null });
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => fakeClient(),
  createSupabaseServerClient: () => fakeClient(),
}));

const { equipTitleFor, loadTitles } = await import("@/features/progression/titleService");

const USER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(rpcResults)) delete rpcResults[key];
  missing.clear();
  rpcCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("lecture des titres", () => {
  it("marque débloqués les titres dont l'exploit est obtenu", async () => {
    const titles = await loadTitles(USER, new Set(["level_10"]));
    expect(titles.available).toBe(true);
    expect(titles.options.find((option) => option.id === "loup-de-mer")?.unlocked).toBe(true);
    expect(titles.options.find((option) => option.id === "capitaine")?.unlocked).toBe(false);
    expect(titles.options.find((option) => option.id === "capitaine")?.condition).toContain("Niveau 40");
  });

  it("rend le titre porté", async () => {
    tables.player_titles = [{ user_id: USER, title_id: "loup-de-mer" }];
    const titles = await loadTitles(USER, new Set(["level_10"]));
    expect(titles.equipped).toBe("loup-de-mer");
  });

  it("ignore un titre porté inconnu du catalogue ou dont l'exploit manque", async () => {
    tables.player_titles = [{ user_id: USER, title_id: "roi-des-pirates" }];
    expect((await loadTitles(USER, new Set())).equipped).toBeNull();
    tables.player_titles = [{ user_id: USER, title_id: "capitaine" }];
    expect((await loadTitles(USER, new Set(["level_10"]))).equipped).toBeNull();
  });

  it("sans la table (migration en attente) : aucun titre, aucune erreur", async () => {
    missing.add("player_titles");
    const titles = await loadTitles(USER, new Set(["level_10"]));
    expect(titles.equipped).toBeNull();
    expect(titles.available).toBe(false);
    expect(titles.options.length).toBeGreaterThan(0);
  });
});

describe("équipement", () => {
  it("refuse un titre inconnu sans toucher à la base", async () => {
    const result = await equipTitleFor(USER, "roi-des-pirates");
    expect(result.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("refuse un titre non débloqué AVANT d'écrire", async () => {
    tables.player_achievements = [{ user_id: USER, code: "level_10" }];
    const result = await equipTitleFor(USER, "capitaine");
    expect(result).toEqual({ ok: false, error: "Ce titre n'est pas encore débloqué." });
    expect(rpcCalls).toEqual([]);
  });

  it("ne compte pas l'exploit d'un autre joueur", async () => {
    tables.player_achievements = [{ user_id: "autre", code: "level_40" }];
    const result = await equipTitleFor(USER, "capitaine");
    expect(result.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("équipe un titre gagné, en passant à la base l'exploit exigé par le catalogue", async () => {
    tables.player_achievements = [{ user_id: USER, code: "level_10" }];
    const result = await equipTitleFor(USER, "loup-de-mer");
    expect(result).toEqual({ ok: true, equipped: "loup-de-mer" });
    expect(rpcCalls).toEqual([
      { fn: "set_player_title", args: { p_user_id: USER, p_title_id: "loup-de-mer", p_required_achievement: "level_10" } },
    ]);
  });

  it("« Aucun titre » retire le titre sans condition", async () => {
    const result = await equipTitleFor(USER, null);
    expect(result).toEqual({ ok: true, equipped: null });
    expect(rpcCalls[0]?.args).toEqual({ p_user_id: USER, p_title_id: null, p_required_achievement: null });
  });

  it("relaie le refus de la base", async () => {
    tables.player_achievements = [{ user_id: USER, code: "level_10" }];
    rpcResults.set_player_title = { data: { ok: false, error: "not_unlocked" }, error: null };
    const result = await equipTitleFor(USER, "loup-de-mer");
    expect(result).toEqual({ ok: false, error: "Ce titre n'est pas encore débloqué." });
  });

  it("sans la fonction en base (migration en attente) : refus lisible, pas d'exception", async () => {
    tables.player_achievements = [{ user_id: USER, code: "level_10" }];
    rpcResults.set_player_title = { data: null, error: { message: "Could not find the function public.set_player_title" } };
    const result = await equipTitleFor(USER, "loup-de-mer");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pas encore disponibles/);
  });
});
