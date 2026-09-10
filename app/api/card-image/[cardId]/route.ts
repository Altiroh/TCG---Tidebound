import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getCardDefinition } from "@/game";

/**
 * Résout l'image finie la plus récente d'une carte et redirige dessus, en
 * scannant `public/assets/cards/<type>/` pour un fichier
 * `tb_<type>_<cardId>_card_v<NN>.png` (convention documentée dans
 * `public/assets/cards/README.md`). Pas de registre à maintenir à la main :
 * la version la plus haute fait foi. 404 si l'asset n'existe pas encore —
 * le client (`CardTile`) retombe alors sur le rendu HTML/CSS.
 *
 * `?layer=debord` : calque optionnel réservé aux cartes `subtype: "abyssal"`
 * — illustration transparente destinée à déborder visuellement du cadre
 * (`tb_<type>_<cardId>_card-debord_v<NN>.png`), superposée par `CardTile`
 * au-dessus du fond mais sous les chiffres de stats. 404 pour toute carte
 * qui n'a pas ce fichier (immense majorité des cartes) — `CardTile` ignore
 * alors simplement le calque, sans repli visuel nécessaire.
 */
export async function GET(request: NextRequest, { params }: { params: { cardId: string } }) {
  let type: string;
  try {
    type = getCardDefinition(params.cardId).type;
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const dir = path.join(process.cwd(), "public", "assets", "cards", type);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const layer = request.nextUrl.searchParams.get("layer");
  const prefix = layer === "debord" ? `tb_${type}_${params.cardId}_card-debord_v` : `tb_${type}_${params.cardId}_card_v`;
  const latest = files
    .filter((f) => f.startsWith(prefix) && f.endsWith(".png"))
    .sort()
    .at(-1);

  if (!latest) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(new URL(`/assets/cards/${type}/${latest}`, request.url));
}
