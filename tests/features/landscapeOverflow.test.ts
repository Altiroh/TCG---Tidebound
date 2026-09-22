import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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
  { file: "features/market/Market.module.css", selector: ".market" },
  { file: "features/match/table/Table.module.css", selector: ".cardZoom" },
];

/** Toutes les feuilles de module du produit. */
function cssModules(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) cssModules(full, out);
    else if (entry.endsWith(".module.css")) out.push(full.split(path.sep).join("/"));
  }
  return out;
}

/**
 * Les classes qu'un bloc `@media` ALLUME (`display` autre que `none`), avec
 * la position du bloc — et les classes qu'une règle de base ÉTEINT
 * (`display: none`), avec la leur.
 *
 * Analyse volontairement grossière : on ne lit que les blocs `{ … }` d'un
 * seul niveau et la seule propriété `display`. C'est assez pour le piège
 * visé, et assez peu pour ne jamais crier au loup.
 */
function displayRules(source: string) {
  const lit: { cls: string; at: number }[] = [];
  const eteint: { cls: string; at: number }[] = [];
  let depth = 0;
  const re = /@media[^{]*\{|([.#][\w-]+)(?:[^{};]*?)\{([^{}]*)\}|\{|\}/g;

  for (let match = re.exec(source); match; match = re.exec(source)) {
    const [text, selector, body] = match;
    if (text.startsWith("@media")) {
      depth += 1;
      continue;
    }
    if (text === "{") {
      depth += 1;
      continue;
    }
    if (text === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (!selector || !body) continue;
    const display = /(?:^|[;{\s])display:\s*([\w-]+)/.exec(body)?.[1];
    if (!display) continue;
    if (depth > 0 && display !== "none") lit.push({ cls: selector, at: match.index });
    if (depth === 0 && display === "none") eteint.push({ cls: selector, at: match.index });
  }
  return { lit, eteint };
}

describe("Cascade — une règle de base n'éteint pas ce qu'un bloc média allume", () => {
  it("aucune classe allumée en écran court n'est réécrasée plus bas", () => {
    /*
     * À SPÉCIFICITÉ ÉGALE, C'EST LA DERNIÈRE RÈGLE ÉCRITE QUI GAGNE.
     *
     * Le bouton d'ouverture d'un booster porte deux écritures, dont la
     * courte est masquée par défaut. La règle de base était déclarée 580
     * lignes SOUS le bloc « téléphone couché » qui l'allume : les deux
     * écritures se masquaient l'une l'autre et le bouton sortait vide, sur
     * l'écran même que la manœuvre devait servir (retour du 22/09).
     *
     * Rien ne le signale — ni le typage, ni le linter, ni l'œil sur un
     * écran de bureau, où la règle média ne s'applique pas.
     */
    const offenders: string[] = [];
    for (const file of cssModules("features")) {
      const { lit, eteint } = displayRules(read(file));
      for (const on of lit) {
        const off = eteint.find((entry) => entry.cls === on.cls && entry.at > on.at);
        if (off) offenders.push(`${file} (${on.cls})`);
      }
    }

    expect(offenders, "déplacer le basculement APRÈS la règle de base").toEqual([]);
  });
});

describe("Téléphone couché — rien ne passe sous le bord", () => {
  it("les écrans qui court-circuitent `.content` tiennent eux-mêmes la zone sûre", () => {
    // Ces écrans ressemblent de loin à tous les autres : rien dans leur
    // balisage ne dit qu'ils sautent `.content`. Le profil a mis trois
    // retours de test à être repéré, le Market un de plus.
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
