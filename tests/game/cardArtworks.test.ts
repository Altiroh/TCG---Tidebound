import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import {
  artworksOf,
  boardTileArtwork,
  cardIdsWithAlternateArt,
  paintedFullArt,
  paintedTextMatches,
  RARE_CARD_ARTWORKS,
} from "@/game/cosmetics/artworks";

const ILLUSTRATIONS = path.join(process.cwd(), "public", "assets", "cards", "illustrations");

/**
 * ILLUSTRATIONS ALTERNATIVES (Collection visuelle V2, 18/10/2026) : Styled
 * et Styled Full-Art. Le catalogue (`game/cosmetics/artworks.ts`) et les
 * fichiers déposés doivent se correspondre exactement, et une Full-Art —
 * dont le texte est peint — ne doit jamais dire autre chose que la carte.
 */
describe("illustrations Styled / Styled Full-Art", () => {
  it("ne concernent que des cartes du catalogue", () => {
    for (const cardId of cardIdsWithAlternateArt()) expect(CARD_DATABASE.has(cardId), cardId).toBe(true);
  });

  it("chaque illustration listée a son fichier et sa vignette", () => {
    for (const cardId of cardIdsWithAlternateArt()) {
      const listed = [...artworksOf(cardId), ...(paintedFullArt(cardId) ? (["styled-fa"] as const) : [])];
      for (const artwork of listed) {
        if (artwork === "classique") continue;
        expect(existsSync(path.join(ILLUSTRATIONS, artwork, `${cardId}.webp`)), `${artwork}/${cardId}`).toBe(true);
        expect(existsSync(path.join(ILLUSTRATIONS, "mini", artwork, `${cardId}.webp`)), `mini/${artwork}/${cardId}`).toBe(true);
      }
    }
  });

  it("aucun fichier déposé n'est orphelin (un nom qui ne suit pas l'id de la carte ne s'afficherait jamais)", () => {
    const listed = new Set(cardIdsWithAlternateArt());
    for (const artwork of RARE_CARD_ARTWORKS) {
      for (const file of readdirSync(path.join(ILLUSTRATIONS, artwork))) {
        const cardId = file.replace(/\.webp$/, "");
        expect(listed.has(cardId), `${artwork}/${file}`).toBe(true);
        if (artwork === "styled") expect(artworksOf(cardId), `${artwork}/${file}`).toContain("styled");
        else expect(paintedFullArt(cardId), `${artwork}/${file}`).toBeDefined();
      }
    }
  });

  it("une Full-Art dit exactement le texte de la carte, sinon elle est marquée à repeindre et retirée", () => {
    for (const cardId of cardIdsWithAlternateArt()) {
      const fullArt = paintedFullArt(cardId);
      if (!fullArt) continue;
      const juste = paintedTextMatches(fullArt.textePeint, CARD_DATABASE.get(cardId)!.text ?? "");
      if (fullArt.aRepeindre) {
        // Repeinte et juste : retirer le drapeau pour la rendre obtenable.
        expect(juste, `${cardId} : texte désormais juste, retirer « aRepeindre »`).toBe(false);
        expect(artworksOf(cardId)).not.toContain("styled-fa");
      } else {
        expect(juste, `${cardId} : le texte de la carte a changé, la Full-Art est à repeindre`).toBe(true);
      }
    }
  });

  it("la comparaison tolère casse et tirets, pas un mot ni un accent", () => {
    expect(paintedTextMatches("SUR 3-4, POUR -1", "sur 3–4, pour −1")).toBe(true);
    expect(paintedTextMatches("A son arrivée", "À son arrivée")).toBe(false);
    expect(paintedTextMatches("contrôle moins 4", "contrôle au moins 4")).toBe(false);
  });

  it("la tuile de plateau, qui écrit nom et stats, n'affiche jamais une Full-Art", () => {
    expect(boardTileArtwork("aberration-vorace", "styled-fa")).toBe("styled");
    expect(boardTileArtwork("aberration-vorace", "styled")).toBe("styled");
    expect(boardTileArtwork("mousse-des-quarts", "styled-fa")).toBe("classique");
    expect(boardTileArtwork("marin-des-jetees", "styled")).toBe("classique");
    expect(boardTileArtwork("aberration-vorace", undefined)).toBe("classique");
  });
});
