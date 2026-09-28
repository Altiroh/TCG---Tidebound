import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safeRedirect";

/** `/auth/callback?next=…` : seule une page du site est une destination acceptable. */
describe("safeInternalPath", () => {
  it("garde un chemin interne, requête comprise", () => {
    expect(safeInternalPath("/reinitialiser-mot-de-passe")).toBe("/reinitialiser-mot-de-passe");
    expect(safeInternalPath("/decks?tri=nom#haut")).toBe("/decks?tri=nom#haut");
  });

  it("retombe sur l'accueil sans destination", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/\tevil",
    "evil.example/connexion",
  ])("refuse %s", (next) => {
    expect(safeInternalPath(next)).toBe("/");
  });
});
