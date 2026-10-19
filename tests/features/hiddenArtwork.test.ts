import { describe, expect, it } from "vitest";
import { isArtworkHidden } from "@/features/collection/hiddenArtwork";

describe("isArtworkHidden", () => {
  it("floute Styled et Full-Art hors mode Dev, jamais la Classique", () => {
    expect(isArtworkHidden("styled", false)).toBe(true);
    expect(isArtworkHidden("styled-fa", false)).toBe(true);
    expect(isArtworkHidden("classique", false)).toBe(false);
    expect(isArtworkHidden(undefined, false)).toBe(false);
  });

  it("montre tout en mode Dev", () => {
    expect(isArtworkHidden("styled", true)).toBe(false);
    expect(isArtworkHidden("styled-fa", true)).toBe(false);
  });
});
