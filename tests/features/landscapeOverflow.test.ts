import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CE QUI DÉBORDE SOUS LE BORD D'UN TÉLÉPHONE COUCHÉ.
 *
 * `landscapePhone.test.ts` tient le SEUIL (560 px, un seul) et
 * `pwaViewport.test.ts` les unités (`dvh`, `--tb-safe-*`). Restait la
 * troisième famille de retours de test, celle du 22/09 : un contenu plus
 * haut que son cadre, coupé net au bord de l'écran, sans défilement pour
 * aller voir le reste.
 *
 * Deux causes, deux fois la même journée perdue à les retrouver — d'où ce
 * fichier.
 */

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Le bloc `{ … }` qui suit un sélecteur, accolades comprises. */
function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  if (start === -1) return "";
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i);
    }
  }
  return source.slice(open);
}

/**
 * Les écrans posés HORS de `.content` (`GameScreen.module.css`), qui est
 * le seul endroit où la coquille écarte le contenu de l'encoche et de la
 * barre de gestes. Un écran de cette liste ne défile pas : il tient sa
 * hauteur lui-même, court-circuite `.content`, et la zone sûre devient
 * donc SA charge.
 */
const OUTSIDE_CONTENT = [
  { file: "features/progression/Profile.module.css", selector: ".shell" },
  { file: "features/match/table/Table.module.css", selector: ".cardZoom" },
];

describe("Téléphone couché — rien ne passe sous le bord", () => {
  it("les écrans qui court-circuitent `.content` tiennent eux-mêmes la zone sûre", () => {
    // Le profil a mis trois retours de test à être repéré : il est le seul
    // onglet du jeu dans ce cas, et il ressemblait de loin aux autres.
    const offenders = OUTSIDE_CONTENT.filter(({ file, selector }) => {
      const body = ruleBody(read(file), selector);
      return !body.includes("--tb-safe-");
    }).map(({ file, selector }) => `${file} (${selector})`);

    expect(offenders, "employer les variables `--tb-safe-*` dans le rembourrage").toEqual([]);
  });

  it("la fiche de carte borne la rangée qui porte sa colonne défilante", () => {
    // `max-height` sur une grille ne rétrécit PAS une rangée `auto` : elle
    // déborde, et le `max-height: 100%` de la colonne se mesure alors sur
    // une rangée plus haute que le panneau — la barre de défilement
    // n'apparaît jamais et le bas de la fiche est coupé.
    const panel = ruleBody(read("features/collection/card-detail/CardDetail.module.css"), ".panel");

    expect(panel, "`.panel` doit poser `grid-template-rows: minmax(0, 1fr)`").toContain("grid-template-rows");
  });

  it("aucune reprise d'écran court ne retire son plafond à la colonne d'informations", () => {
    // `max-height: none` sur `.info` est légitime dans le repli UNE COLONNE
    // (`max-width: 660px`), où c'est le panneau entier qui défile. Dans les
    // deux colonnes — le mode du téléphone couché — il supprime le seul
    // défilement de la fiche.
    const source = read("features/collection/card-detail/CardDetail.module.css");
    const fallback = source.indexOf("@media (max-width: 660px)");
    const offenders = [...source.matchAll(/\.info\s*\{[^}]*max-height:\s*none/g)]
      .map((match) => match.index ?? 0)
      .filter((index) => fallback === -1 || index < fallback);

    expect(offenders, "la colonne de droite doit garder `max-height: 100%` et défiler").toEqual([]);
  });
});
