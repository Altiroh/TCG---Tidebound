import { repeat, type DeckList } from "@/game/cards/decks/types";
import { DECK_LA_VEILLEE } from "@/game/cards/decks/precon";

/**
 * LA VEILLÉE × LOT 18 RÉÉCRIT (10/10/2026). Le préconstruit Un Dead
 * reconstruit sur le nouveau pool (la mort nourrit la meute, le drain) :
 * variantes mesurées contre le reste du rayon
 * (`--field scripts/preconLab/libraries/rayonSansVeillee.ts`).
 */
const variante = (name: string, cardIds: string[]): DeckList => ({ ...DECK_LA_VEILLEE, id: name, name, cardIds });

/** Meute — le nouveau pool au cœur, le Lot 13 pour les corps qui meurent bien. */
const MEUTE = [
  ...repeat("coucou-cest-moi", 3),
  ...repeat("ptit-bout", 2),
  ...repeat("cache-cache", 3),
  ...repeat("pas-sans-moi", 3),
  ...repeat("encore-cinq-minutes", 2),
  ...repeat("papa-est-en-mer", 2),
  ...repeat("promis-jattends", 2),
  ...repeat("le-copain-du-dessous", 3),
  ...repeat("le-grand-frere", 2),
  ...repeat("tu-mavais-promis", 2),
  ...repeat("on-rentre-bientot", 2),
  ...repeat("le-gardien-des-jouets", 2),
  ...repeat("on-joue-aux-morts", 2),
  ...repeat("tu-viens-jouer", 1),
  ...repeat("on-avait-dit-tous-ensemble", 1),
  ...repeat("ceux-den-bas", 2),
  ...repeat("le-cerf-volant", 2),
  ...repeat("encore-une-histoire", 2),
  ...repeat("reveille-toi", 2),
];

const sans = (list: string[], ...retraits: Array<[string, number]>) => {
  const out = [...list];
  for (const [id, n] of retraits) for (let i = 0; i < n; i += 1) out.splice(out.indexOf(id), 1);
  return out;
};

export const LIBRARY: DeckList[] = [
  { ...DECK_LA_VEILLEE, name: "La Veillée (actuelle)" },
  variante("Meute", MEUTE),
  // Allégée : sans les deux finisseurs du Lot 13, Le Goûter pour nourrir la défausse.
  variante("Meute allégée", [...sans(MEUTE, ["tu-viens-jouer", 1], ["on-avait-dit-tous-ensemble", 1]), ...repeat("le-gouter", 2)]),
  // Un seul Gardien des Jouets, la carte qui pèse le plus (Δ +34 au premier tri).
  variante("Meute un Gardien", [...sans(MEUTE, ["le-gardien-des-jouets", 1], ["tu-viens-jouer", 1]), ...repeat("le-gouter", 2)]),
  // Défausse : Le Goûter et La Marelle font de chaque défausse un gain (Coucou défaussée arrive en jeu).
  variante("Meute défausse", [...sans(MEUTE, ["promis-jattends", 2], ["tu-viens-jouer", 1]), ...repeat("le-gouter", 2), ...repeat("la-marelle", 1)]),
  // Corps : sans les retours du Cimetière, plus de corps et le Naufragé pour finir.
  variante("Meute corps", [
    ...sans(MEUTE, ["encore-une-histoire", 2], ["reveille-toi", 2]),
    ...repeat("papa-est-en-mer", 1),
    ...repeat("on-rentre-bientot", 1),
    ...repeat("tu-viens-jouer", 1),
    ...repeat("le-naufrage-impossible", 1),
  ]),
];
for (const d of LIBRARY) if (d.cardIds.length !== 40) throw new Error(`${d.name} : ${d.cardIds.length} cartes`);
