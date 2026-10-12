import { afterEach, describe, expect, it, vi } from "vitest";
import { PRESENCE_GRACE_MS, isOffline, presenceVerdict, presentUserIds, waitUntilOnline } from "@/features/online/connection";

describe("presenceVerdict — l'adversaire est-il encore à la table ?", () => {
  const T0 = 1_000_000;

  it("ne dit rien tant que le canal n'a rien dit", () => {
    expect(presenceVerdict({ present: false, watchingSince: null, lastSeenAt: null, now: T0 }).status).toBe("unknown");
  });

  it("annoncé sur le canal : présent", () => {
    expect(presenceVerdict({ present: true, watchingSince: T0, lastSeenAt: T0, now: T0 }).status).toBe("present");
  });

  it("un hoquet de réseau ne l'annonce pas parti : la grâce le tient pour présent, et dit quand revoir", () => {
    const verdict = presenceVerdict({ present: false, watchingSince: T0, lastSeenAt: T0 + 5_000, now: T0 + 8_000 });
    expect(verdict.status).toBe("present");
    expect(verdict.recheckInMs).toBe(PRESENCE_GRACE_MS - 3_000);
  });

  it("parti au-delà de la grâce", () => {
    const verdict = presenceVerdict({ present: false, watchingSince: T0, lastSeenAt: T0, now: T0 + PRESENCE_GRACE_MS });
    expect(verdict.status).toBe("away");
    expect(verdict.recheckInMs).toBeUndefined();
  });

  it("jamais vu depuis l'ouverture de la table : inconnu pendant la grâce, parti ensuite", () => {
    // Le joueur rouvre une partie que l'autre a déjà quittée.
    expect(presenceVerdict({ present: false, watchingSince: T0, lastSeenAt: null, now: T0 + 2_000 }).status).toBe("unknown");
    expect(presenceVerdict({ present: false, watchingSince: T0, lastSeenAt: null, now: T0 + PRESENCE_GRACE_MS + 1 }).status).toBe("away");
  });

  it("revenu : présent aussitôt, sans attendre", () => {
    expect(presenceVerdict({ present: true, watchingSince: T0, lastSeenAt: T0, now: T0 + 60_000 }).status).toBe("present");
  });
});

describe("presentUserIds", () => {
  it("les clés annoncées sont les joueurs présents ; une clé sans annonce ne compte pas", () => {
    const ids = presentUserIds({ alice: [{ at: 1 }], bob: [], carol: [{ at: 2 }, { at: 3 }], dave: undefined });
    expect([...ids].sort()).toEqual(["alice", "carol"]);
  });
});

describe("hors ligne", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete (globalThis as { navigator?: unknown }).navigator;
    vi.unstubAllGlobals();
  });

  function setOnline(onLine: boolean) {
    Object.defineProperty(globalThis, "navigator", { value: { onLine }, configurable: true, writable: true });
  }

  it("ne se dit hors ligne que si le navigateur l'affirme", () => {
    setOnline(true);
    expect(isOffline()).toBe(false);
    setOnline(false);
    expect(isOffline()).toBe(true);
  });

  it("en ligne, un coup part tout de suite", async () => {
    setOnline(true);
    await expect(waitUntilOnline()).resolves.toBeUndefined();
  });

  it("hors ligne, un coup attend le retour du réseau", async () => {
    setOnline(false);
    const listeners = new Set<() => void>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: () => void) => type === "online" && listeners.add(listener),
      removeEventListener: (type: string, listener: () => void) => type === "online" && listeners.delete(listener),
    });

    let sent = false;
    const waiting = waitUntilOnline().then(() => {
      sent = true;
    });
    await Promise.resolve();
    expect(sent).toBe(false);

    setOnline(true);
    listeners.forEach((listener) => listener());
    await waiting;
    expect(sent).toBe(true);
    // L'écouteur s'est retiré : rien ne traîne après le retour du réseau.
    expect(listeners.size).toBe(0);
  });
});
