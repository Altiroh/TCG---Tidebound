import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * RECONSTRUCTION DES SIX PRÉCONSTRUITS INCOMPLETS (03/10/2026).
 *
 * Les 34 cartes retirées du catalogue les 01 et 02/10 ont laissé six listes
 * sous 40 cartes. Chaque variante ci-dessous complète la liste INCOMPLÈTE
 * (le rayon d'aujourd'hui moins les ajouts retenus, `RETENU`) avec des
 * cartes restantes du même rôle. La variante retenue de chaque deck est
 * celle de `CHOIX` ; elle reproduit exactement la liste de `precon.ts`.
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/reconstruction.ts --games 40
 *   RECON_VARIANTES=1 npx tsx scripts/preconLab/lab.ts --lib … --games 40 --only "Épavistes [A],Épavistes [B]"
 *
 * Relevé : docs/equilibrage/reconstruction-03-10.txt.
 */

/** Les ajouts retenus, retirés du rayon actuel pour retrouver la liste incomplète. */
const RETENU: Record<string, Record<string, number>> = {
  "mineurs-de-fond": { "charpentiere-de-veille": 2, "le-dernier-rempart": 1, "cormoran-de-fer": 2, "mouette-du-brise-lames": 1 },
  "descente-aux-abysses": {
    "poisson-lanterne": 3,
    "marin-des-jetees": 2,
    "masse-sombre-abyssal": 2,
    "lhomme-revenu-de-la-fosse": 2,
    "bat-marin": 2,
  },
  epavistes: { "bernard-lermite-dacier": 2, "le-dernier-rempart": 1, "cormoran-de-fer": 2, "mouette-du-brise-lames": 1 },
  "a-bout-de-raison": {
    "marin-aux-yeux-rouges-abyssal": 2,
    "le-fond-vous-regarde": 2,
    "ce-qui-suit-le-navire": 2,
    "second-au-visage-pale": 2,
    "bat-marin-abyssal": 1,
  },
  "chasse-au-gros": { "chose-des-hauts-fonds": 2 },
  "apres-la-tempete": { "chacun-sa-place": 1, "abandonnez-le-navire": 1 },
};

const sans = (ids: readonly string[], retirer: Record<string, number>): string[] => {
  const reste = { ...retirer };
  const out = ids.filter((c) => ((reste[c] ?? 0) > 0 ? ((reste[c]! -= 1), false) : true));
  for (const [c, n] of Object.entries(reste)) if (n > 0) throw new Error(`${c} manque (${n})`);
  return out;
};

/** La liste incomplète d'avant la reconstruction. */
const avant = (id: string): DeckList => {
  const deck = PRECON_DECK_LISTS.find((d) => d.id === id)!;
  return { ...deck, cardIds: sans(deck.cardIds, RETENU[id] ?? {}) };
};

function completer(id: string, nom: string, ajouter: Record<string, number>, retirer: Record<string, number> = {}): DeckList {
  const base = avant(id);
  const ids = sans(base.cardIds, retirer);
  for (const [c, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(c);
  if (ids.length !== 40) throw new Error(`${base.name} [${nom}] : ${ids.length} cartes`);
  return { ...base, name: `${base.name} [${nom}]`, cardIds: ids };
}

export const CANDIDATS: Record<string, DeckList[]> = {
  "mineurs-de-fond": [
    completer("mineurs-de-fond", "A", { "charpentiere-de-veille": 2, "pont-mine": 2, "mouette-du-brise-lames": 2 }),
    completer("mineurs-de-fond", "B", { "charpentiere-de-veille": 2, "cormoran-de-fer": 2, "mouette-du-brise-lames": 2 }),
    completer("mineurs-de-fond", "C", { "charpentiere-de-veille": 2, "le-dernier-rempart": 2, "cormoran-de-fer": 2 }),
    completer("mineurs-de-fond", "D", { "charpentiere-de-veille": 2, "il-capitano-naufrage": 2, "cormoran-de-fer": 2 }),
    completer("mineurs-de-fond", "E", { "charpentiere-de-veille": 2, "le-dernier-rempart": 1, "cormoran-de-fer": 2, "mouette-du-brise-lames": 1 }),
  ],
  "descente-aux-abysses": [
    completer("descente-aux-abysses", "A", {
      "poisson-lanterne": 3,
      "marin-des-jetees": 2,
      "masse-sombre-abyssal": 2,
      "lhomme-revenu-de-la-fosse": 2,
      "bat-marin": 2,
    }),
  ],
  epavistes: [
    completer("epavistes", "A", { "bernard-lermite-dacier": 2, "treuil-rouille": 2, "regulateur-de-courant": 2 }),
    completer("epavistes", "B", { "bernard-lermite-dacier": 2, "il-capitano-naufrage": 2, "cormoran-de-fer": 2 }),
    completer("epavistes", "C", { "bernard-lermite-dacier": 2, "le-dernier-rempart": 2, "cormoran-de-fer": 2 }),
    completer("epavistes", "D", { "bernard-lermite-dacier": 3, "il-capitano-naufrage": 2, "cormoran-de-fer": 2 }, { "grappin-de-recuperation": 1 }),
    completer("epavistes", "E", { "bernard-lermite-dacier": 2, "le-dernier-rempart": 1, "cormoran-de-fer": 2, "mouette-du-brise-lames": 1 }),
    completer("epavistes", "F", { "bernard-lermite-dacier": 2, "le-dernier-rempart": 1, "cormoran-de-fer": 2, "treuil-rouille": 1 }),
  ],
  "a-bout-de-raison": [
    completer("a-bout-de-raison", "A", {
      "marin-aux-yeux-rouges-abyssal": 2,
      "chose-des-hauts-fonds": 3,
      "le-fond-vous-regarde": 1,
      "ce-qui-suit-le-navire": 2,
      "bat-marin-abyssal": 1,
    }),
    completer("a-bout-de-raison", "B", {
      "marin-aux-yeux-rouges-abyssal": 2,
      "le-fond-vous-regarde": 2,
      "ce-qui-suit-le-navire": 2,
      "second-au-visage-pale": 2,
      "bat-marin-abyssal": 1,
    }),
    completer("a-bout-de-raison", "C", {
      "marin-aux-yeux-rouges-abyssal": 2,
      "le-fond-vous-regarde": 1,
      "chose-des-hauts-fonds": 1,
      "ce-qui-suit-le-navire": 2,
      "second-au-visage-pale": 2,
      "bat-marin-abyssal": 1,
    }),
  ],
  "chasse-au-gros": [
    completer("chasse-au-gros", "A", { "vieille-selle": 2 }),
    completer("chasse-au-gros", "B", { "chose-des-hauts-fonds": 2 }),
  ],
  "apres-la-tempete": [
    completer("apres-la-tempete", "A", { "le-dernier-rempart": 2 }),
    completer("apres-la-tempete", "B", { "chacun-sa-place": 1, "abandonnez-le-navire": 1 }),
    completer("apres-la-tempete", "C", { "un-peu-de-repit": 2 }),
  ],
};

/** Variante retenue par deck (index dans `CANDIDATS`). */
export const CHOIX: Record<string, number> = {
  "mineurs-de-fond": 4,
  "descente-aux-abysses": 0,
  epavistes: 4,
  "a-bout-de-raison": 1,
  "chasse-au-gros": 1,
  "apres-la-tempete": 1,
};

const rayon = PRECON_DECK_LISTS.map((d) => (d.id in CHOIX ? CANDIDATS[d.id]![CHOIX[d.id]!]! : d));

/**
 * `RECON_VARIANTES=1` ajoute les variantes non retenues au rayon, à mesurer
 * avec `--only "<Deck> [B],<Deck> [C]"`. `RECON_AVANT=1` rejoue le rayon
 * d'avant la reconstruction, six listes incomplètes comprises.
 */
export const LIBRARY: DeckList[] = process.env.RECON_AVANT
  ? PRECON_DECK_LISTS.map((d) => (d.id in RETENU ? avant(d.id) : d))
  : process.env.RECON_VARIANTES
    ? [...rayon, ...Object.entries(CANDIDATS).flatMap(([id, vs]) => vs.filter((_, i) => i !== CHOIX[id]))]
    : rayon;
