/**
 * Convertit les images de `public/assets/` en WebP et les ramène à la
 * taille à laquelle elles sont RÉELLEMENT affichées.
 *
 * Pourquoi : les illustrations sortent du générateur en PNG ~1250 px et
 * ~2,4 Mo pièce, alors qu'une carte n'occupe jamais plus de ~400 px à
 * l'écran (~800 px sur un écran à forte densité). Le dossier `public/`
 * pesait 422 Mo, embarqués dans CHAQUE déploiement Vercel — d'où un
 * "Deployment Storage" à 19 Go pour un quota de 10 Go.
 *
 * Le script est idempotent : une image déjà convertie (WebP présent et
 * plus récent que la source) est ignorée. Les sources PNG/JPG ne sont
 * supprimées que si `--delete-sources` est passé — l'historique Git reste
 * de toute façon la sauvegarde des originaux.
 *
 * Il fabrique aussi les VIGNETTES d'illustration (`illustrations/mini/`,
 * voir `THUMBNAILS` plus bas) : une vignette manquante ou plus ancienne que
 * son illustration est refaite, les autres sont ignorées.
 *
 * Usage :
 *   node scripts/optimizeImages.mjs            # convertit, garde les sources
 *   node scripts/optimizeImages.mjs --delete-sources
 */
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), "public", "assets");
const DELETE_SOURCES = process.argv.includes("--delete-sources");

/**
 * Règles par famille d'assets. `maxSize` borne le plus grand côté ; une
 * image déjà plus petite n'est jamais agrandie. La qualité monte pour les
 * calques posés par-dessus l'illustration (cadres, icônes) : leurs traits
 * fins et leurs bords transparents sont ce qui se dégrade en premier.
 */
const RULES = [
  { match: /\/cards\/illustrations\//, maxSize: 768, quality: 85 },
  { match: /\/token\//, maxSize: 768, quality: 85 },
  { match: /\/cards\/(frames|card-back)\//, maxSize: 1200, quality: 90 },
  { match: /\/cards\/icons\//, maxSize: 512, quality: 90 },
  // Icônes de catégorie de quête : affichées à ~40 px, jamais plus de 96 px
  // sur un écran à forte densité. Qualité haute, elles ont des bords nets.
  { match: /\/quests\//, maxSize: 256, quality: 92 },
  // Icônes d'interface (pièce de Tides, Jeton de Préconstruit) : affichées
  // de 13 à ~64 px. Qualité haute, ce sont des objets détourés sur alpha.
  { match: /\/ui\/icons\//, maxSize: 256, quality: 92 },
  // Plaques de dégâts : elles s'envolent au-dessus de la cible à ~130 px de
  // haut, jamais plus de 264 sur un écran dense. Qualité haute — corde et
  // rivets sont détourés sur alpha, et ce sont leurs bords qui se
  // dégradent d'abord.
  { match: /\/ui\/\w+-dammage\./, maxSize: 320, quality: 92 },
  // Emblèmes de difficulté du bot : affichés à ~44 px dans la carte-radio
  // de « Jouer ». Même traitement que les icônes d'interface — traits fins
  // et halo sur alpha.
  { match: /\/play\/bot-difficulty\//, maxSize: 256, quality: 92 },
  // Coin de table de l'écran Decks : un décor, posé au bas de la colonne
  // de gauche, jamais plus large que ~380 px (760 sur un écran dense). La
  // règle générale `decks/` l'aurait gardé en 1600 px pour rien.
  { match: /\/decks\/decor-/, maxSize: 760, quality: 84 },
  // Hublot de Marée : le cadre et les quatre mers ne dépassent jamais la
  // bande centrale (~240 px). Le cadre monte en qualité — ses filets sont
  // fins et ses bords transparents.
  { match: /\/board\/tide-porthole-frame\./, maxSize: 512, quality: 92 },
  { match: /\/board\/tide-portholes\//, maxSize: 512, quality: 85 },
  // Panneau de capacité de Navire (hublot de laiton, planches, illustration
  // sous les planches) : il occupe moins d'un cinquième du cadre, soit ~30 px
  // à l'écran. Qualité haute malgré la taille — le laiton et les planches
  // sont détourés sur alpha, et ce sont leurs bords qui se dégradent d'abord.
  { match: /\/ships\/capacite\//, maxSize: 512, quality: 92 },
  // Pastilles d'état des cartes (Garde, Malade, Tour…) : 38 px sur le
  // plateau, 90 px au plus dans la fiche en jeu. Elles sortaient en 1254 px
  // (≈ 150 Ko pièce, 19 Ko après) — audit du 24/09.
  { match: /\/status\//, maxSize: 256, quality: 92 },
  // Tuile d'orientation de la Marée : posée dans l'emplacement du Navire,
  // jamais plus de ~380 px de haut. 1254 → 760 px (audit du 24/09).
  { match: /\/board\/tide-orientation\//, maxSize: 760, quality: 86 },
  // Ombre de transition de page : étirée à 140 % de la hauteur d'écran, elle
  // est déjà agrandie à l'affichage. Ramenée de 1672 à 1254 px (audit du
  // 24/09, 330 → 134 Ko) : c'est une ombre floue qui traverse l'écran en
  // quelques centaines de millisecondes, la différence ne se voit pas — et
  // elle est téléchargée à la première visite de CHAQUE joueur.
  { match: /\/ui\/transitions\//, maxSize: 1254, quality: 75 },
  { match: /\/(menu|ships|boosters|collection|decks|board)\//, maxSize: 1600, quality: 85 },
  { match: /.*/, maxSize: 1280, quality: 85 },
];

function ruleFor(file) {
  const normalized = file.split(path.sep).join("/");
  return RULES.find((rule) => rule.match.test(normalized));
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function formatSize(bytes) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`;
}

const totals = { before: 0, after: 0, converted: 0, skipped: 0 };

for await (const file of walk(ROOT)) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;

  const target = file.replace(/\.(png|jpe?g)$/i, ".webp");
  const sourceStat = await stat(file);

  if (existsSync(target) && (await stat(target)).mtimeMs >= sourceStat.mtimeMs) {
    totals.skipped++;
    continue;
  }

  const rule = ruleFor(file);
  const image = sharp(file);
  const { width = 0, height = 0 } = await image.metadata();
  const longest = Math.max(width, height);

  await image
    .resize(
      longest > rule.maxSize
        ? { width: width >= height ? rule.maxSize : undefined, height: height > width ? rule.maxSize : undefined }
        : undefined
    )
    .webp({ quality: rule.quality, effort: 6 })
    .toFile(target);

  const targetStat = await stat(target);
  totals.before += sourceStat.size;
  totals.after += targetStat.size;
  totals.converted++;

  const relative = path.relative(ROOT, file);
  console.log(
    `${relative.padEnd(60)} ${formatSize(sourceStat.size).padStart(8)} → ${formatSize(targetStat.size).padStart(8)}`
  );

  if (DELETE_SOURCES) await unlink(file);
}

/*
 * VIGNETTES D'ILLUSTRATION (audit du 24/09/2026).
 *
 * Une carte en main, sur le plateau ou dans la grille de la Collection
 * mesure 110 à 180 px : son illustration de 768 px (≈ 124 Ko) y était
 * téléchargée entière, quarante fois par écran. `CardTile` propose donc
 * les deux au navigateur (`srcset` + `sizes="auto"`), qui prend la
 * vignette tant que la carte est petite et l'originale en gros plan ; les
 * listes et avatars (34 à 64 px) n'utilisent que la vignette.
 *
 * 360 px : deux fois la plus grande carte « petite » (≈ 180 px), pour les
 * écrans à forte densité. ≈ 26 Ko pièce.
 *
 * `tests/features/illustrationThumbnails.test.ts` vérifie qu'aucune
 * illustration n'est sans vignette : sans elle, le navigateur qui choisit
 * la vignette tomberait sur un 404 et n'afficherait rien.
 */
const THUMBNAILS = [
  { source: path.join(ROOT, "cards", "illustrations"), width: 360, quality: 78 },
  // Les cadres suivent la même logique que les illustrations, avec une
  // qualité plus haute : filets fins et bords transparents.
  { source: path.join(ROOT, "cards", "frames"), width: 400, quality: 88 },
];

const thumbs = { made: 0, skipped: 0 };
for (const family of THUMBNAILS) {
  const targetDir = path.join(family.source, "mini");
  for (const entry of await readdir(family.source, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".webp")) continue;
    const source = path.join(family.source, entry.name);
    const target = path.join(targetDir, entry.name);
    if (existsSync(target) && (await stat(target)).mtimeMs >= (await stat(source)).mtimeMs) {
      thumbs.skipped++;
      continue;
    }
    await mkdir(targetDir, { recursive: true });
    await sharp(source)
      .resize({ width: family.width, withoutEnlargement: true })
      .webp({ quality: family.quality, effort: 6 })
      .toFile(target);
    thumbs.made++;
  }
}
console.log(`${thumbs.made} vignettes fabriquées (${thumbs.skipped} déjà à jour).`);

console.log(
  `\n${totals.converted} images converties (${totals.skipped} déjà à jour) : ` +
    `${formatSize(totals.before)} → ${formatSize(totals.after)} ` +
    `(${totals.before > 0 ? Math.round((1 - totals.after / totals.before) * 100) : 0} % de moins)`
);
if (!DELETE_SOURCES && totals.converted > 0) {
  console.log("Sources conservées. Relancer avec --delete-sources pour les retirer du dépôt.");
}
