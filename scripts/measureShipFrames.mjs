/**
 * Mesure la fenêtre en arche de chaque cadre de Navire et imprime la table
 * de géométrie à recopier dans `features/ships/shipFrame.ts`.
 *
 * POURQUOI un script plutôt qu'une mesure à l'œil : les quinze cadres sont
 * dessinés sur le même GABARIT mais pas au même format. Deux séries de
 * dimensions coexistent (1122×1402, soit 0,800, et 1062×1480, soit 0,718),
 * et la fenêtre y varie de 13 à 21 % de hauteur en haut, de 60 à 74 % en
 * largeur. Poser l'illustration avec une seule géométrie la décalerait sur
 * la plupart d'entre eux.
 *
 * MÉTHODE : remplissage de la zone transparente (alpha ≤ 40) depuis le
 * centre de l'image. On ne garde que la région CONNEXE au centre — le
 * dehors du cadre est transparent lui aussi, mais il n'y touche pas. C'est
 * la même mesure que celle qui avait servi pour le cadre d'origine, ici
 * rendue reproductible.
 *
 * Usage :
 *   node scripts/measureShipFrames.mjs
 *
 * À relancer chaque fois qu'un cadre est redessiné ou qu'on en ajoute un.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const FRAMES_DIR = path.join(process.cwd(), "public", "assets", "ships", "frames");
const ORIGINAL = path.join(process.cwd(), "public", "assets", "ships", "ship-frame-empty.webp");

/** Seuil d'opacité : au-delà, le pixel appartient au cadre. */
const ALPHA_MAX = 40;

/** Fichiers du dossier qui ne sont pas des cadres jouables. */
const NOT_A_FRAME = new Set(["dispo-bientot.webp"]);

async function measure(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const alpha = (x, y) => data[(y * W + x) * C + 3];

  // Départ au centre ; s'il tombe sur un ornement, on descend le long de
  // l'axe vertical jusqu'au premier pixel transparent.
  const cx = Math.floor(W / 2);
  let cy = Math.floor(H / 2);
  if (alpha(cx, cy) > ALPHA_MAX) {
    cy = -1;
    for (let y = Math.floor(H * 0.2); y < Math.floor(H * 0.8); y++) {
      if (alpha(cx, y) <= ALPHA_MAX) {
        cy = y;
        break;
      }
    }
    if (cy < 0) throw new Error(`${path.basename(file)} : aucune fenêtre transparente sur l'axe central.`);
  }

  const seen = new Uint8Array(W * H);
  const stack = [[cx, cy]];
  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (seen[i] || alpha(x, y) > ALPHA_MAX) continue;
    seen[i] = 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  /*
   * CONTOUR de l'arche, en coordonnées relatives à la fenêtre.
   *
   * La fenêtre n'est pas un rectangle : au-dessus de l'arche, ses deux coins
   * hauts appartiennent au cadre. Sans découpe, l'illustration posée dans le
   * rectangle dépasse là — deux carrés gris au-dessus de la courbe, visibles
   * sur presque tous les cadres arrondis.
   *
   * On relève, pour un échantillon de lignes, les bords gauche et droit de la
   * zone ouverte ; serré en haut (là où ça tourne), plus lâche ensuite.
   */
  const rows = [];
  const samples = 28;
  for (let i = 0; i < samples; i++) {
    // Progression au carré : deux fois plus de points sur le tiers haut.
    const t = (i / (samples - 1)) ** 1.9;
    const y = Math.min(maxY, minY + Math.round(t * (maxY - minY)));
    let left = -1;
    let right = -1;
    for (let x = minX; x <= maxX; x++) {
      if (!seen[y * W + x]) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left < 0) continue;
    const prev = rows[rows.length - 1];
    if (prev && prev.y === y) continue;
    rows.push({ y, left, right });
  }

  const zoneW = maxX + 1 - minX;
  const zoneH = maxY + 1 - minY;
  const rel = (value, origin, total) => +(((value - origin) / total) * 100).toFixed(1);
  const right = rows.map((r) => `${rel(r.right + 1, minX, zoneW)}% ${rel(r.y, minY, zoneH)}%`);
  const left = [...rows].reverse().map((r) => `${rel(r.left, minX, zoneW)}% ${rel(r.y, minY, zoneH)}%`);
  const clip = `polygon(${[...right, ...left].join(", ")})`;

  const pct = (value, total) => +((value / total) * 100).toFixed(2);
  return {
    clip,
    aspect: +(W / H).toFixed(4),
    top: pct(minY, H),
    left: pct(minX, W),
    width: pct(maxX + 1 - minX, W),
    height: pct(maxY + 1 - minY, H),
    /** Sous la fenêtre : la plaque de nom. Son centre est à mi-chemin du bas. */
    plateTop: pct(maxY + 1 + (H - maxY - 1) * 0.42, H),
  };
}

/*
 * Nom de fichier → identifiant de cosmétique (`game/cosmetics/shipFrames.ts`).
 * Le script imprime la table PRÊTE À COLLER, indexée comme le catalogue :
 * pas de correspondance à refaire de tête entre deux fichiers.
 */
const ID_BY_FILE = {
  "ship-frame-empty": "ship-frame-default",
  abyssal: "ship-skin-abyssal",
  alice: "ship-skin-alice",
  concord: "ship-skin-concorde",
  cordes: "ship-skin-cordages",
  "defaut-metal": "ship-skin-fer",
  gothique: "ship-skin-pavillon-noir",
  hermes: "ship-skin-hermes",
  "niveau-10": "ship-skin-palier-10",
  "niveau-100": "ship-skin-palier-100",
  "niveau-25": "ship-skin-palier-25",
  "niveau-50": "ship-skin-palier-50",
  rat: "ship-skin-chapardeur",
  shadow: "ship-skin-ombre",
  skelette: "ship-skin-ossuaire",
};

const files = [["ship-frame-empty", ORIGINAL]];
for (const entry of (await readdir(FRAMES_DIR)).sort()) {
  if (!entry.endsWith(".webp") || NOT_A_FRAME.has(entry)) continue;
  files.push([entry.replace(/\.webp$/, ""), path.join(FRAMES_DIR, entry)]);
}

console.log("// Généré par `node scripts/measureShipFrames.mjs` — ne pas éditer à la main.");
for (const [name, file] of files) {
  const m = await measure(file);
  const id = ID_BY_FILE[name];
  if (!id) throw new Error(`${name} : pas d'identifiant de cosmétique. Complète ID_BY_FILE.`);
  console.log(
    `  "${id}": {
    aspect: ${m.aspect},
    zone: { top: "${m.top}%", left: "${m.left}%", width: "${m.width}%", height: "${m.height}%" },
    plateTop: "${m.plateTop}%",
    clip:
      "${m.clip}",
  },`
  );
}
