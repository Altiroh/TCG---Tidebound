/**
 * Un échec de chargement d'image ne se retient pas à vie : une illustration
 * livrée pendant que l'app est ouverte doit finir par s'afficher sans
 * rechargement complet (retour du 24/09/2026).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_RETRY_MS, knownImageStatus, loadImageStatus } from "@/features/match/imageStatusCache";

/** `window.Image` factice : chaque URL de `disponibles` charge, les autres échouent. */
function fakeImages(disponibles: Set<string>) {
  class FakeImage {
    decoding = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      queueMicrotask(() => (disponibles.has(url) ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal("window", { Image: FakeImage });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("imageStatusCache", () => {
  it("un succès reste acquis", async () => {
    fakeImages(new Set(["/ok.webp"]));
    expect(await loadImageStatus("/ok.webp")).toBe("ok");
    expect(knownImageStatus("/ok.webp")).toBe("ok");
  });

  it("un échec est retenu un temps, puis l'image est redemandée — et s'affiche si elle est arrivée entre-temps", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const disponibles = new Set<string>();
    fakeImages(disponibles);

    expect(await loadImageStatus("/nouvelle.webp")).toBe("error");
    expect(knownImageStatus("/nouvelle.webp")).toBe("error");

    // Le déploiement livre l'illustration.
    disponibles.add("/nouvelle.webp");
    vi.setSystemTime(Date.now() + ERROR_RETRY_MS + 1);

    expect(knownImageStatus("/nouvelle.webp")).toBe("loading");
    expect(await loadImageStatus("/nouvelle.webp")).toBe("ok");
  });
});
