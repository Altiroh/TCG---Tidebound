import { type DeckList } from "@/game/cards/decks/types";
import { DECK_LA_VEILLEE } from "@/game/cards/decks/precon";

/**
 * LA VEILLÉE × « COUCOU, C'EST MOI » À UN EXEMPLAIRE (décision du
 * 12/10/2026 : la carte qui revient sans fin portait la force des
 * Morts-vivants). Le préconstruit en jouait trois dans 40 cartes, le
 * minimum : deux places à rendre. Variantes mesurées contre le reste du
 * rayon (`--field scripts/preconLab/libraries/rayonSansVeillee.ts`).
 */
const variante = (name: string, ajouts: string[]): DeckList => {
  const cardIds = [...DECK_LA_VEILLEE.cardIds];
  for (let i = 0; i < 2; i += 1) cardIds.splice(cardIds.indexOf("coucou-cest-moi"), 1);
  return { ...DECK_LA_VEILLEE, id: name, name, cardIds: [...cardIds, ...ajouts] };
};

export const LIBRARY: DeckList[] = [
  { ...DECK_LA_VEILLEE, name: "La Veillée (3 Coucou)" },
  variante("1 Coucou + P'tit Bout + Encore cinq minutes", ["ptit-bout", "encore-cinq-minutes"]),
  variante("1 Coucou + P'tit Bout + Papa est en mer", ["ptit-bout", "papa-est-en-mer"]),
  variante("1 Coucou + P'tit Bout + Le Goûter", ["ptit-bout", "le-gouter"]),
  variante("1 Coucou + P'tit Bout + Gardien", ["ptit-bout", "le-gardien-des-jouets"]),
  variante("1 Coucou + Encore cinq minutes + Promis j'attends", ["encore-cinq-minutes", "promis-jattends"]),
];
for (const d of LIBRARY) if (d.cardIds.length !== 40) throw new Error(`${d.name} : ${d.cardIds.length} cartes`);
