import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Préférences du joueur sur le COMPTE (`lib/preferences.ts`, 10/10/2026) :
 * elles ne suivaient pas le joueur d'un navigateur à l'autre tant qu'elles
 * ne vivaient qu'en `localStorage`.
 */

const account = { stored: null as Record<string, unknown> | null, saved: [] as Record<string, unknown>[] };

vi.mock("@/features/settings/preferencesActions", () => ({
  fetchPreferences: vi.fn(async () => account.stored),
  savePreferences: vi.fn(async (values: Record<string, unknown>) => {
    account.saved.push(values);
    return { ok: account.stored !== null };
  }),
}));

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

async function freshStore(local: Record<string, string>) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(local)) storage.setItem(key, value);
  vi.stubGlobal("window", { localStorage: storage });
  vi.resetModules();
  const store = await import("@/lib/preferences");
  return { store, storage };
}

describe("préférences du joueur", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    account.stored = null;
    account.saved = [];
  });

  it("le compte l'emporte sur la copie de l'appareil, et la met à jour", async () => {
    account.stored = { "tidebound:audio-settings": { music: false } };
    const { store, storage } = await freshStore({ "tidebound:audio-settings": JSON.stringify({ music: true }) });
    const seen: string[] = [];
    store.subscribePreferences((key, origin) => seen.push(`${origin}:${key}`));

    expect(await store.hydratePreferences()).toBe(true);

    expect(store.getPreference("tidebound:audio-settings")).toEqual({ music: false });
    expect(JSON.parse(storage.getItem("tidebound:audio-settings")!)).toEqual({ music: false });
    expect(seen).toContain("account:tidebound:audio-settings");
  });

  it("verse sur le compte, une fois, ce que l'appareil connaissait avant", async () => {
    account.stored = {};
    const { store } = await freshStore({
      "tidebound:filtres:collection:tri": JSON.stringify("cout"),
      // Anciennes valeurs écrites brutes, pas en JSON.
      "tidebound:nouvelle-partie:niveau-bot": "difficile",
      // Propres à l'appareil : jamais envoyés.
      "tidebound:installation:fermee": "1",
      "tidebound:filtres:decks:favoris": JSON.stringify(["a"]),
    });

    await store.hydratePreferences();
    await vi.runAllTimersAsync();

    expect(account.saved).toEqual([{ "tidebound:filtres:collection:tri": "cout", "tidebound:nouvelle-partie:niveau-bot": "difficile" }]);
  });

  it("un réglage changé avant la relecture du compte n'est pas écrasé par elle", async () => {
    account.stored = { "tidebound:interface-settings": { rewardShortcuts: true } };
    const { store } = await freshStore({});

    store.setPreference("tidebound:interface-settings", { rewardShortcuts: false });
    await store.hydratePreferences();
    await vi.runAllTimersAsync();

    expect(store.getPreference("tidebound:interface-settings")).toEqual({ rewardShortcuts: false });
    expect(account.saved).toContainEqual({ "tidebound:interface-settings": { rewardShortcuts: false } });
  });

  it("sans session, la copie de l'appareil suffit et la relecture pourra être retentée", async () => {
    const { store, storage } = await freshStore({});

    expect(await store.hydratePreferences()).toBe(false);
    store.setPreference("tidebound:nouvelle-partie:dernier-deck", "la-veillee");

    expect(store.getPreference("tidebound:nouvelle-partie:dernier-deck")).toBe("la-veillee");
    expect(storage.getItem("tidebound:nouvelle-partie:dernier-deck")).toBe(JSON.stringify("la-veillee"));

    account.stored = { "tidebound:nouvelle-partie:niveau-bot": "facile" };
    expect(await store.hydratePreferences()).toBe(true);
    expect(store.getPreference("tidebound:nouvelle-partie:niveau-bot")).toBe("facile");
  });

  it("revenir à la valeur par défaut retire la clé, du compte comme de l'appareil", async () => {
    account.stored = {};
    const { store, storage } = await freshStore({ "tidebound:filtres:quetes": JSON.stringify("hebdo") });

    store.setPreference("tidebound:filtres:quetes", undefined);
    await vi.runAllTimersAsync();

    expect(storage.getItem("tidebound:filtres:quetes")).toBeNull();
    expect(account.saved).toContainEqual({ "tidebound:filtres:quetes": null });
  });
});
