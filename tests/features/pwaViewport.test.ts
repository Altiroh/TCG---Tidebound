import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Les deux règles d'écran de CLAUDE.md, tenues par un test plutôt que par la
 * bonne volonté.
 *
 * Elles y étaient écrites depuis le début — « hauteurs plein écran en `dvh`,
 * jamais `vh` », « ces quatre variables sont le seul endroit où `env()` est
 * lu hors plateau » — et six endroits les enfreignaient quand même
 * (18/09/2026). Une règle qu'aucun test ne lit finit toujours par se perdre
 * dans une revue : celle-ci coûte une seconde et se remarque tout de suite.
 */

const ROOTS = ["app", "features", "components"];
const EXTENSIONS = [".css", ".ts", ".tsx"];

/**
 * Seuls endroits autorisés à lire `env(safe-area-inset-*)` : les variables
 * partagées, et la scène de partie, qui a les siennes (le plateau se cale au
 * pixel près et ne passe pas par la coquille).
 */
const SAFE_AREA_OWNERS = ["app/globals.css", "features/match/table/Table.module.css"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.includes(path.extname(full))) out.push(full);
  }
  return out;
}

/** Sans les commentaires : une règle qui se CITE dans une explication n'est pas une infraction. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = ROOTS.flatMap((root) => walk(root)).map((file) => ({
  file: file.split(path.sep).join("/"),
  code: withoutComments(readFileSync(file, "utf8")),
}));

describe("PWA — hauteurs et zone sûre", () => {
  it("n'emploie aucune hauteur plein écran en `vh`", () => {
    // Sur iOS, `100vh` est le viewport LARGE (barre d'adresse masquée) : un
    // écran ainsi dimensionné déborde sous la barre, et un contenu centré
    // s'y retrouve poussé vers le bas. `dvh` suit la hauteur réellement
    // visible. `min-h-screen` / `h-screen` de Tailwind valent `100vh`.
    const offenders = FILES.filter(({ code }) =>
      /\bmin-h-screen\b|\bh-screen\b|(?:min-)?height:\s*100vh/.test(code)
    ).map(({ file }) => file);

    expect(offenders, "utiliser `100dvh` (ou `min-h-[100dvh]`)").toEqual([]);
  });

  it("ne lit `env(safe-area-inset-*)` que dans les deux fichiers qui le doivent", () => {
    // Ailleurs, on passe par `--tb-safe-*`. Un `env()` de plus, c'est une
    // quatrième définition de la zone sûre qui diverge en silence — et c'est
    // exactement comme ça que le tiroir de quêtes s'est retrouvé sous la
    // Dynamic Island en paysage.
    const offenders = FILES.filter(
      ({ file, code }) => /env\(\s*safe-area-inset/.test(code) && !SAFE_AREA_OWNERS.includes(file)
    ).map(({ file }) => file);

    expect(offenders, "utiliser les variables `--tb-safe-*` de `app/globals.css`").toEqual([]);
  });

  it("garde les deux propriétaires de la zone sûre", () => {
    // Le test précédent passerait tout seul si ces deux-là disparaissaient.
    for (const owner of SAFE_AREA_OWNERS) {
      const source = FILES.find(({ file }) => file === owner);
      expect(source, `${owner} introuvable`).toBeDefined();
      expect(/env\(\s*safe-area-inset/.test(source!.code), `${owner} ne lit plus la zone sûre`).toBe(true);
    }
  });
});
