import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * LE TÉLÉPHONE COUCHÉ A UN SEUL SEUIL : 560 px de haut.
 *
 * Le jeu est verrouillé en paysage (CLAUDE.md) : sur un téléphone, la
 * largeur est généreuse (844 à 932 px) et la hauteur ne l'est pas — 390 à
 * 412 px, bandeau déduit. Chaque écran qui se réagence pour ce format le
 * fait donc sur la HAUTEUR, et tous sur la même valeur : une seconde
 * bascule à 540 ou 580 px laisserait une bande d'appareils avec la moitié
 * des règles seulement, et personne ne s'en apercevrait avant un retour de
 * test.
 *
 * Ce fichier tient cette règle-là, comme `pwaViewport.test.ts` tient
 * celles de `dvh` et de la zone sûre.
 */

/** La hauteur en dessous de laquelle un écran se considère « couché ». */
const LANDSCAPE_BREAKPOINT = 560;

/**
 * Les feuilles qui portent une bascule de téléphone couché. Y être, c'est
 * s'engager à la garder : si un écran n'a plus besoin de sa bascule, on
 * retire la ligne d'ici en même temps que le bloc.
 */
const SCREENS = [
  "app/tokens.css",
  "features/shell/GameScreen.module.css",
  "features/collection/CardBrowser.module.css",
  "features/cosmetics/Collectables.module.css",
  "features/decks/DecksList.module.css",
  "features/decks/DeckBuilder.module.css",
  "features/progression/Profile.module.css",
  "features/progression/ProfileIdentity.module.css",
  "features/quests/Quests.module.css",
  "features/boosters/Boosters.module.css",
  "features/match/NewMatch.module.css",
  "features/match/MatchEndScreen.module.css",
];

/**
 * Seuils VOISINS interdits. En dehors de cette fourchette, une bascule dit
 * autre chose qu'« un téléphone couché » : 480 px est un mini-écran, 620 à
 * 800 px sont les paliers de renoncement progressif d'une fenêtre basse —
 * ils ne prétendent pas au même public.
 *
 * 520 px (`features/match/table/Table.module.css`) est la seule exception,
 * et elle est explicite : le PLATEAU n'est pas une page, il se mesure à sa
 * scène et non au bandeau, et sa bascule se déclenche plus tard.
 */
const NEIGHBOUR_RANGE = { min: 521, max: 619 };
const NEIGHBOUR_EXCEPTIONS = ["features/match/table/Table.module.css"];

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Toutes les valeurs de `@media (max-height: Npx)` d'une feuille. */
function heightBreakpoints(source: string): number[] {
  return [...source.matchAll(/@media[^{]*max-height:\s*(\d+)px/g)].map((match) => Number(match[1]));
}

describe("Téléphone couché — un seul seuil", () => {
  it("chaque écran qui se réagence en paysage le fait à 560 px", () => {
    const missing = SCREENS.filter((file) => !heightBreakpoints(read(file)).includes(LANDSCAPE_BREAKPOINT));

    expect(missing, "ces feuilles n'ont plus de bascule de téléphone couché").toEqual([]);
  });

  it("aucun seuil voisin ne vient doubler celui-ci", () => {
    const offenders: string[] = [];
    for (const file of SCREENS) {
      for (const value of heightBreakpoints(read(file))) {
        if (value >= NEIGHBOUR_RANGE.min && value <= NEIGHBOUR_RANGE.max && value !== LANDSCAPE_BREAKPOINT) {
          offenders.push(`${file} (${value}px)`);
        }
      }
    }

    expect(offenders, `utiliser ${LANDSCAPE_BREAKPOINT}px, le seuil commun`).toEqual([]);
  });

  it("garde la seule exception connue, le plateau, hors de la liste", () => {
    // Le test précédent passerait tout seul si le plateau entrait dans
    // `SCREENS` : il y porterait un 520 px parfaitement légitime.
    for (const file of NEIGHBOUR_EXCEPTIONS) {
      expect(SCREENS).not.toContain(file);
    }
  });

  it("la typographie de page a sa variante d'écran court", () => {
    // Les tailles se mesurent en `vw` : sans cette reprise, un titre de
    // page sortait à sa taille de laptop (28 px) sur 390 px de hauteur.
    const tokens = read("app/tokens.css");
    const shortScreen = tokens.slice(tokens.indexOf(`@media (max-height: ${LANDSCAPE_BREAKPOINT}px)`));

    expect(shortScreen).toContain("--tb-fs-page-title");
  });
});
