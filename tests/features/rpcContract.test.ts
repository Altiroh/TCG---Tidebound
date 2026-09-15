import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CONTRAT ENTRE LE CODE ET LA BASE.
 *
 * Chaque service serveur appelle des fonctions Postgres par leur nom, avec
 * des paramètres nommés. Rien ne vérifiait que les deux côtés parlent de la
 * même chose : le typage Supabase est écrit À LA MAIN
 * (`lib/supabase/types.ts`), donc il ment dès qu'on oublie de le mettre à
 * jour, et une migration peut renommer un paramètre sans que rien ne casse
 * à la compilation. L'erreur ne se voit qu'à l'exécution, en production, et
 * silencieusement : ces services attrapent leurs erreurs et dégradent.
 *
 * Deux dérives de ce genre ont déjà été trouvées dans ce dépôt :
 *   - `recycle_card` déclarait une variable du type `card_rarity`, supprimé
 *     par une migration ultérieure — la fonction ne compilait plus ;
 *   - son barème ignorait deux raretés ajoutées depuis.
 *
 * Ce test relit les migrations et les appels, et les confronte. Il ne
 * demande aucune base de données.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SOURCE_DIRS = ["features", "app", "lib"];

interface SqlFunction {
  name: string;
  /** Paramètres, dans l'ordre déclaré. */
  params: { name: string; optional: boolean }[];
}

/**
 * Signatures telles que la base les portera APRÈS toutes les migrations :
 * les fichiers sont lus dans l'ordre, et une redéfinition écrase la
 * précédente — exactement ce que fait `create or replace`.
 */
function declaredFunctions(): Map<string, SqlFunction> {
  const found = new Map<string, SqlFunction>();

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const pattern = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(([^)]*)\)/gi;

    for (const match of sql.matchAll(pattern)) {
      const [, name, rawParams] = match;
      const params = (rawParams ?? "")
        .split(",")
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => ({
          name: chunk.split(/\s+/)[0]!.toLowerCase(),
          // `default …` rend le paramètre facultatif à l'appel.
          optional: /\bdefault\b/i.test(chunk),
        }));
      found.set(name!.toLowerCase(), { name: name!.toLowerCase(), params });
    }
  }

  return found;
}

interface RpcCall {
  fn: string;
  args: string[];
  where: string;
}

/** Tous les `.rpc("nom", { … })` du code, avec les clés passées. */
function rpcCalls(): RpcCall[] {
  const calls: RpcCall[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;

      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/\.rpc\(\s*"([a-z_0-9]+)"\s*,\s*\{/gi)) {
        const fn = match[1]!;
        // Objet d'arguments : on suit les accolades jusqu'à la fermeture.
        let depth = 0;
        let i = source.indexOf("{", match.index! + match[0].length - 1);
        const start = i;
        for (; i < source.length; i += 1) {
          if (source[i] === "{") depth += 1;
          else if (source[i] === "}") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        // Les commentaires sont retirés AVANT analyse : un `// …` entre deux
        // arguments cassait la détection du séparateur qui précède la clé.
        const body = source
          .slice(start + 1, i)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/[^\n]*/g, "");
        // Clés de PREMIER niveau seulement : un objet imbriqué ne compte pas.
        // Le suivi se fait CARACTÈRE par caractère et non ligne par ligne :
        // `{ p_user_id: x, p_deck_id: y }` tient sur une seule ligne, et un
        // parcours par lignes n'y verrait que la première clé.
        const args: string[] = [];
        let nested = 0;
        for (let c = 0; c < body.length; c += 1) {
          const ch = body[c]!;
          if (ch === "{" || ch === "[" || ch === "(") nested += 1;
          else if (ch === "}" || ch === "]" || ch === ")") nested -= 1;
          else if (nested === 0 && ch === "p") {
            const key = /^(p_[a-z_0-9]+)\s*:/i.exec(body.slice(c));
            // Précédé d'un séparateur : évite d'attraper un `p_x` au milieu
            // d'une expression passée en valeur.
            const prev = c === 0 ? "," : body.slice(0, c).trimEnd().slice(-1);
            if (key && (prev === "," || prev === "" || prev === "{")) {
              args.push(key[1]!.toLowerCase());
              c += key[1]!.length;
            }
          }
        }
        calls.push({ fn: fn.toLowerCase(), args, where: path.replace(process.cwd() + "/", "") });
      }
    }
  }

  for (const dir of SOURCE_DIRS) walk(join(process.cwd(), dir));
  return calls;
}

describe("contrat RPC : le code et les migrations sont d'accord", () => {
  const functions = declaredFunctions();
  const calls = rpcCalls();

  it("relit bien les deux côtés", () => {
    expect(functions.size).toBeGreaterThan(10);
    expect(calls.length).toBeGreaterThan(10);
  });

  it("chaque fonction appelée existe dans les migrations", () => {
    const missing = calls.filter((call) => !functions.has(call.fn)).map((call) => `${call.fn} (${call.where})`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it("chaque argument passé est un paramètre déclaré", () => {
    const wrong: string[] = [];
    for (const call of calls) {
      const declared = functions.get(call.fn);
      if (!declared) continue;
      const names = new Set(declared.params.map((p) => p.name));
      for (const arg of call.args) {
        if (!names.has(arg)) wrong.push(`${call.fn} ← « ${arg} » inconnu (${call.where})`);
      }
    }
    expect([...new Set(wrong)]).toEqual([]);
  });

  it("aucun paramètre OBLIGATOIRE n'est oublié", () => {
    const missing: string[] = [];
    for (const call of calls) {
      const declared = functions.get(call.fn);
      if (!declared) continue;
      const passed = new Set(call.args);
      for (const param of declared.params) {
        if (!param.optional && !passed.has(param.name)) {
          missing.push(`${call.fn} ← « ${param.name} » manquant (${call.where})`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
