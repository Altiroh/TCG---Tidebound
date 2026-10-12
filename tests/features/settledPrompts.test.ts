import { describe, expect, it } from "vitest";
import type { GameState } from "@/game";
import { withoutSettledPrompts } from "@/features/match/settledPrompts";
import { testGameState } from "../game/testHelpers";

/**
 * Pendant un dé qui roule ou un sort en vol, l'état affiché est celui d'avant
 * le coup : la question à laquelle le joueur vient de répondre ne doit pas
 * s'y rouvrir (`features/match/settledPrompts.ts`).
 */
describe("fenêtres déjà tranchées pendant une mise en scène", () => {
  const reaction = { playerId: "p1" } as unknown as NonNullable<GameState["pendingReaction"]>;
  const choice = { playerId: "p1" } as unknown as NonNullable<GameState["pendingChoice"]>;

  it("retire la réaction et le choix auxquels le joueur vient de répondre", () => {
    const held = { ...testGameState(), pendingReaction: reaction, pendingChoice: choice };
    const live = testGameState();
    const shown = withoutSettledPrompts(held, live);
    expect(shown.pendingReaction).toBeUndefined();
    expect(shown.pendingChoice).toBeUndefined();
    // Le reste de l'état retenu ne bouge pas : seule la fenêtre s'en va.
    expect(shown.players).toBe(held.players);
  });

  it("garde une question qui attend toujours, et rend le même objet quand rien n'est tranché", () => {
    const held = { ...testGameState(), pendingReaction: reaction };
    const live = { ...held, turnNumber: held.turnNumber };
    expect(withoutSettledPrompts(held, live)).toBe(held);
  });

  it("n'avance pas une nouvelle question de l'état réel", () => {
    const held = testGameState();
    const live = { ...held, pendingChoice: choice };
    expect(withoutSettledPrompts(held, live).pendingChoice).toBeUndefined();
  });
});
