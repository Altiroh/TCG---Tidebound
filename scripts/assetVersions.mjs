// Empreinte de contenu de chaque fichier servi depuis le cache du service
// worker (`/assets/`, `/icons/`) : `public/asset-versions.json`, fabriqué à
// chaque build (`prebuild`), jamais commité.
//
// Les visuels ne sont PAS versionnés par leur nom : une illustration
// repeinte garde son chemin. Sans empreinte, le service worker (cache
// d'abord) servait l'ancienne image jusqu'à sa revalidation, un jour plus
// tard — une Full-Art corrigée restait fausse en partie et dans la
// collection (retour du 19/10/2026). Avec elle, il sait qu'un fichier a
// changé et va chercher le nouveau (`public/sw.js`).
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC = path.resolve("public");
const ROOTS = ["assets", "icons"];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const versions = {};
for (const root of ROOTS) {
  for await (const file of walk(path.join(PUBLIC, root))) {
    const url = "/" + path.relative(PUBLIC, file).split(path.sep).join("/");
    versions[url] = createHash("sha1").update(await readFile(file)).digest("hex").slice(0, 10);
  }
}

const sorted = Object.fromEntries(Object.entries(versions).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(path.join(PUBLIC, "asset-versions.json"), JSON.stringify(sorted));
console.log(`asset-versions.json : ${Object.keys(sorted).length} fichiers`);
