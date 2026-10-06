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
 * VIGNETTES COMPOSÉES DES ABYSSALES (06/10/2026). L'illustration d'une
 * Abyssale n'est que son DÉCOR : le sujet vit dans le débord, empilé par la
 * face de carte. Partout où l'on montre l'illustration seule (fond de pile
 * de deck, lignes de liste, contenu de booster…), on ne voyait que des
 * nuages. `<id>-vignette.webp` = décor + débord, posé comme sur la carte :
 *  - débord PLEIN CADRE (portrait au-delà de 1,35) : par-dessus, même cadrage ;
 *  - SILHOUETTE : dans sa zone de l'ancien cadre (`DEBORD_ZONE` rapportée à
 *    `ILLUSTRATION_ZONE`, `CardTile.tsx`), contenue et calée en haut.
 * `cardIllustrationUrl` / `cardIllustrationThumbUrl` la servent pour toute
 * carte `-abyssal`.
 */
const ILLUS_DIR = path.join(ROOT, "cards", "illustrations");
const composed = { made: 0, skipped: 0 };
for (const entry of await readdir(ILLUS_DIR)) {
  if (!entry.endsWith("-abyssal.webp")) continue;
  const base = path.join(ILLUS_DIR, entry);
  const debord = base.replace(/\.webp$/, "-debord.webp");
  const target = base.replace(/\.webp$/, "-vignette.webp");
  if (!existsSync(debord)) continue;
  const newest = Math.max((await stat(base)).mtimeMs, (await stat(debord)).mtimeMs);
  if (existsSync(target) && (await stat(target)).mtimeMs >= newest) {
    composed.skipped++;
    continue;
  }
  const { width: W, height: H } = await sharp(base).metadata();
  const meta = await sharp(debord).metadata();
  let layer;
  let left = 0;
  let top = 0;
  if (meta.height / meta.width > 1.35) {
    layer = await sharp(debord).resize(W, H, { fit: "cover" }).toBuffer();
  } else {
    // Zone du débord rapportée à l'illustration (pourcentages de l'ancien cadre).
    const bx = ((-4 - 7) / 87) * W;
    const bw = (108 / 87) * W;
    const by = ((0 - 4) / 51) * H;
    const bh = (62 / 51) * H;
    const k = Math.min(bw / meta.width, bh / meta.height);
    const lw = Math.round(meta.width * k);
    const lh = Math.round(meta.height * k);
    left = Math.round(bx + (bw - lw) / 2);
    top = Math.round(by);
    layer = await sharp(debord).resize(lw, lh).toBuffer();
  }
  // Une couche qui dépasse du décor est rognée à ses bords (composite exige l'inclusion).
  const lm = await sharp(layer).metadata();
  const cropL = Math.max(0, -left);
  const cropT = Math.max(0, -top);
  const cw = Math.min(lm.width - cropL, W - Math.max(0, left));
  const ch = Math.min(lm.height - cropT, H - Math.max(0, top));
  const piece = await sharp(layer).extract({ left: cropL, top: cropT, width: cw, height: ch }).toBuffer();
  await sharp(base)
    .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }])
    .webp({ quality: 86, effort: 6 })
    .toFile(target);
  composed.made++;
}
console.log(`${composed.made} vignettes d'Abyssales composées (${composed.skipped} déjà à jour).`);

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
  // Écran QUÊTES (maquette du 29/09/2026) : le pont en fond plein écran, la
  // carte de la Traversée à ~62 % de la scène, la planche des registres à
  // ~75 %, chaque feuille à ~36 %, les décors de bord à ~45 % de haut, la
  // lanterne à ~12 % ; onglets (~9 %) et cadre d'icône (~3 %) sont petits
  // mais détourés sur alpha, d'où leur qualité haute.
  { match: /\/quests\/ecran\/fond\./, maxSize: 1920, quality: 80 },
  { match: /\/quests\/ecran\/(carte-traversee|planche)\./, maxSize: 1800, quality: 86 },
  { match: /\/quests\/ecran\/feuille-/, maxSize: 1100, quality: 86 },
  { match: /\/quests\/ecran\/decor-/, maxSize: 1300, quality: 84 },
  { match: /\/quests\/ecran\/lanterne/, maxSize: 640, quality: 88 },
  { match: /\/quests\/ecran\/onglet-/, maxSize: 424, quality: 90 },
  { match: /\/quests\/ecran\/cadre-icone\./, maxSize: 256, quality: 92 },
  // Icônes de catégorie de quête : affichées à ~40 px, jamais plus de 96 px
  // sur un écran à forte densité. Qualité haute, elles ont des bords nets.
  { match: /\/quests\//, maxSize: 256, quality: 92 },
  // Icônes d'interface (pièce de Tides, Jeton de Préconstruit) : affichées
  // de 13 à ~64 px. Qualité haute, ce sont des objets détourés sur alpha.
  { match: /\/ui\/icons\//, maxSize: 256, quality: 92 },
  // Dés (Lot 17, `features/match/dice/`) : faces d'un solide CSS 3D jusqu'à
  // ~120 px d'arête, nettes sur un écran ×3. Textures rognées à leur plaque,
  // points dans un cadre carré commun à toutes les valeurs du dé.
  { match: /\/dice\//, maxSize: 512, quality: 92 },
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
  // Table classique : le fond (table et tapis de parchemin) couvre l'écran,
  // pleine taille ; la bougie, posée dans le coin, ne dépasse pas ~200 px.
  { match: /\/board\/table-classique\/fond\./, maxSize: 1672, quality: 84 },
  { match: /\/board\/table-classique\/bougie\./, maxSize: 512, quality: 90 },
  // Ombre de transition de page : étirée à 140 % de la hauteur d'écran, elle
  // est déjà agrandie à l'affichage. Ramenée de 1672 à 1254 px (audit du
  // 24/09, 330 → 134 Ko) : c'est une ombre floue qui traverse l'écran en
  // quelques centaines de millisecondes, la différence ne se voit pas — et
  // elle est téléchargée à la première visite de CHAQUE joueur.
  { match: /\/ui\/transitions\//, maxSize: 1254, quality: 75 },
  // Emblèmes de style de deck (Agressif, Tempo, Midrange…) : affichés de
  // 18 à ~40 px dans la fiche et l'éditeur. Même traitement que les icônes
  // d'interface — traits fins et vagues détourés sur alpha.
  { match: /\/decks\/styles\//, maxSize: 256, quality: 92 },
  // Écrans de DÉFAITE et de VICTOIRE (composition du 26/09/2026) : le fond
  // peint couvre l'écran, il garde sa pleine taille (1672 px) ; le cadre
  // photo occupe la moitié droite (~810 px, 1536 sur écran dense) ; le titre
  // ~560 px ; les boutons ~256 px (plaques peintes aux bords détourés).
  { match: /\/match-end\/(defaite|victoire)\/fond\./, maxSize: 1920, quality: 84 },
  { match: /\/match-end\/(defaite|victoire)\/cadre-photo\./, maxSize: 1536, quality: 88 },
  { match: /\/match-end\/(defaite|victoire)\/titre\./, maxSize: 1200, quality: 90 },
  { match: /\/match-end\/defaite\/bouton-/, maxSize: 640, quality: 90 },
  // Planche des confettis de la victoire : ~60 pièces découpées à l'affichage
  // (coordonnées en % de la planche, indépendantes de sa taille). Les plus
  // grandes tombent à ~110 px : 1600 px de planche suffisent.
  { match: /\/match-end\/victoire\/confettis\./, maxSize: 1600, quality: 88 },
  // Écran des COLLECTABLES (maquette du 26/09/2026) : la tuile épinglée
  // s'affiche à ~400 px de haut au plus, le panneau des familles à ~600, les
  // décors de bord à ~900 ; le bandeau de section traverse l'écran ; plaque
  // de nom et bouton ne dépassent pas ~240 px de large.
  { match: /\/collectables\/tuile\./, maxSize: 900, quality: 86 },
  { match: /\/collectables\/panneau-familles\./, maxSize: 1300, quality: 86 },
  { match: /\/collectables\/decor-/, maxSize: 1200, quality: 86 },
  { match: /\/collectables\/bandeau-section\./, maxSize: 1800, quality: 84 },
  { match: /\/collectables\/(bouton|plaque-nom)\./, maxSize: 720, quality: 90 },
  // Écran MES BOOSTERS (maquette du 27/09/2026) : les rouleaux du rayon
  // s'affichent à ~400 px de large, l'étagère à ~850 px de haut, le décor
  // de boussoles à ~500, le parchemin de la fiche à ~800.
  { match: /\/boosters\/[^/]+\/[^/]+-rayon\./, maxSize: 900, quality: 88 },
  { match: /\/boosters\/etagere\./, maxSize: 1400, quality: 86 },
  { match: /\/boosters\/decor-boussoles\./, maxSize: 1000, quality: 86 },
  { match: /\/ui\/panneaux\/parchemin-boussole\./, maxSize: 1400, quality: 86 },
  // Écran JOUER, choix du mode (maquette du 28/09/2026) : la table de bois
  // en fond plein écran, le bandeau à ~45 % de la scène, les trois cartes
  // à ~20 %, la lanterne à ~12 %, le décor du coin à ~32 %.
  { match: /\/play\/mode\/fond-table\./, maxSize: 1920, quality: 80 },
  { match: /\/play\/mode\/bandeau-/, maxSize: 1500, quality: 86 },
  { match: /\/play\/mode\/carte-/, maxSize: 900, quality: 86 },
  { match: /\/play\/mode\/lanterne/, maxSize: 640, quality: 88 },
  { match: /\/play\/mode\/decor-/, maxSize: 1200, quality: 84 },
  { match: /\/play\/mode\/vs\./, maxSize: 800, quality: 88 },
  // La poignée « Lancer la partie », pendue à ses chaînes : ~75 % de la hauteur.
  { match: /\/play\/mode\/poignee-/, maxSize: 1100, quality: 88 },
  // Niveaux du bot (écran Jouer → Contre un bot, 28/09/2026) : plaques de
  // niveau à ~16 % de la largeur, illustration du niveau à ~28 %.
  { match: /\/play\/bot-level\/plaque-/, maxSize: 720, quality: 88 },
  { match: /\/play\/bot-level\/illustration-/, maxSize: 900, quality: 86 },
  // La petite bête qui traverse les tables (TableCritter) : corps et six
  // pattes détourés, affichés à ~8 vw — jamais plus de ~300 px la bête.
  { match: /\/critters\//, maxSize: 400, quality: 88 },
  // Scène des MÉCÈNES (maquette du 28/09/2026), dans le panneau latéral
  // (la moitié de l'écran) : le mur en fond, la télé à ~90 % de sa largeur,
  // les cadres photo à ~30 %, la lanterne et l'étoile de mer en décor.
  { match: /\/mecenes\/scene\/fond\./, maxSize: 1536, quality: 80 },
  { match: /\/mecenes\/scene\/tele(-ecran)?\./, maxSize: 1200, quality: 86 },
  { match: /\/mecenes\/scene\/cadre-photo\./, maxSize: 640, quality: 88 },
  { match: /\/mecenes\/scene\/lanterne(-eteinte)?\./, maxSize: 640, quality: 88 },
  { match: /\/mecenes\/scene\/etoile-de-mer\./, maxSize: 400, quality: 88 },
  // Le harpon des projectiles d'effet : il vole à ~150 px de long au plus.
  { match: /\/fx\/harpon\./, maxSize: 512, quality: 90 },
  // Landes : pièces de scène (pics, segments de chaîne, anneaux) que le
  // code place le long des bords, jamais plus hautes qu'un tiers d'écran
  // (`public/assets/landes/README.md`). Les segments de chaîne, en longueur,
  // gardent 1400 px de large.
  { match: /\/landes\/[^/]+\/chaine-segment-/, maxSize: 1400, quality: 86 },
  { match: /\/landes\/[^/]+\/(fissures|cadenas|fumees|flaques)/, maxSize: 2560, quality: 84 },
  // Sol d'une Lande (`LandeScene.floor`, ex. donjon-sol) : il remplace la mer
  // en plein écran, même format et même taille que les fonds de Marée
  // (1672 × 941). À tester AVANT la règle des pièces du Donjon.
  { match: /\/landes\/[^/]+\/[^/]*-sol\./, maxSize: 1672, quality: 84 },
  // Murs du Donjon : ils encadrent le sol sur toute sa largeur (~1300 px du
  // fond) ou sa hauteur — même échelle que lui.
  { match: /\/landes\/le-donjon-de-ladalle\/mur-(haut|bas|gauche|droite)\./, maxSize: 1600, quality: 86 },
  // Pièces du Donjon de Ladalle : décor isométrique posé jusqu'à ~260 px de haut.
  { match: /\/landes\/le-donjon-de-ladalle\//, maxSize: 768, quality: 86 },
  { match: /\/landes\//, maxSize: 700, quality: 86 },
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
