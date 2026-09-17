/**
 * Fabrique les icônes d'application et les favicons depuis l'icône de marque
 * (`public/assets/menu/logo/icon-tidebound.webp`).
 *
 * Pourquoi un script plutôt que des fichiers déposés : les huit fichiers sont
 * des DÉRIVÉS d'un seul visuel, avec des contraintes différentes par
 * plateforme (marge de sécurité Android, opacité iOS, tailles de favicon).
 * Quand l'icône change, on relance `npm run icons` au lieu de refaire huit
 * découpes à la main.
 *
 * Exception assumée à la règle « jamais de PNG commité » (CLAUDE.md) : iOS
 * n'accepte pas le WebP pour `apple-touch-icon`, une icône de manifeste en
 * WebP reste refusée par certains vérificateurs d'installabilité, et un
 * favicon `.ico` n'existe qu'en PNG/BMP. Ces fichiers pèsent quelques
 * dizaines de kilo-octets au total, là où la règle vise les illustrations de
 * cartes à 3 Mo.
 *
 * Usage : npm run icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE = path.join(process.cwd(), "public", "assets", "menu", "logo", "icon-tidebound.webp");
const OUT_DIR = path.join(process.cwd(), "public", "icons");
const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * PNG quantifié : une icône dessinée (aplats, dégradés doux) supporte très
 * bien la palette, et le 512 px passe de ~670 ko à une centaine. La
 * transparence est conservée.
 */
const PNG_OPTIONS = { palette: true, quality: 92, effort: 10, compressionLevel: 9 };

/** Navy profond du design system (`app/tokens.css`, `--tb-bg-deep`). */
const BACKGROUND = { r: 5, g: 14, b: 26, alpha: 1 };

/**
 * L'icône est déjà un carré à coins arrondis, bordé d'or, sur un fond
 * transparent : elle se suffit à elle-même. Les variantes ne diffèrent que
 * par la façon dont la plateforme la découpe.
 */

/** Icône telle quelle, transparence conservée (manifeste `purpose: "any"`, favicons). */
async function plain(size) {
  return sharp(SOURCE).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png(PNG_OPTIONS).toBuffer();
}

/**
 * Variante `maskable` : Android peut rogner l'icône en cercle, en carré
 * arrondi ou en goutte. Seuls les 80 % centraux sont garantis visibles, donc
 * l'icône est réduite à 78 % et posée sur le navy — sinon la bordure dorée
 * serait la première chose coupée.
 */
async function maskable(size) {
  const inner = Math.round(size * 0.78);
  const art = await sharp(SOURCE).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const offset = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: art, top: offset, left: offset }])
    .png(PNG_OPTIONS)
    .toBuffer();
}

/**
 * Variante iOS : le système applique SON masque à coins arrondis et ignore la
 * transparence. La marge transparente est donc rognée (`trim`) pour que
 * l'arrondi du système tombe sur celui de l'icône, et le reste est aplati sur
 * le navy — sinon iOS poserait du noir dans les coins.
 */
async function apple(size) {
  const trimmed = await sharp(SOURCE).trim().toBuffer();
  return sharp(trimmed)
    .resize(size, size, { fit: "cover" })
    .flatten({ background: BACKGROUND })
    .png(PNG_OPTIONS)
    .toBuffer();
}

/**
 * Empaquette des PNG dans un `.ico` (format ICONDIR + entrées + charges
 * utiles). Windows, et les quelques clients qui demandent `/favicon.ico`
 * sans lire les balises `<link>`, acceptent le PNG depuis Vista.
 */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // réservé
  header.writeUInt16LE(1, 2); // type : 1 = icône
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    // 0 signifie 256 px : la taille tient sur un seul octet dans ce format.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // réservé
    entry.writeUInt16LE(1, 4); // plans de couleur
    entry.writeUInt16LE(32, 6); // bits par pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files = [
    ["icon-192.png", await plain(192)],
    ["icon-512.png", await plain(512)],
    ["icon-maskable-192.png", await maskable(192)],
    ["icon-maskable-512.png", await maskable(512)],
    ["apple-touch-icon.png", await apple(180)],
    ["favicon-16.png", await plain(16)],
    ["favicon-32.png", await plain(32)],
    ["favicon-48.png", await plain(48)],
  ];

  for (const [name, data] of files) {
    await writeFile(path.join(OUT_DIR, name), data);
    console.log(`icons/${name} — ${(data.length / 1024).toFixed(1)} ko`);
  }

  const ico = packIco([
    { size: 16, data: await plain(16) },
    { size: 32, data: await plain(32) },
    { size: 48, data: await plain(48) },
  ]);
  // À la racine de `public/` : c'est l'URL `/favicon.ico` que réclament les
  // clients qui ne lisent pas les balises `<link>`.
  await writeFile(path.join(PUBLIC_DIR, "favicon.ico"), ico);
  console.log(`favicon.ico — ${(ico.length / 1024).toFixed(1)} ko (16, 32, 48)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
