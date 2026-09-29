import { DECK_CHEVALIERS_DU_GRAND_ETANG, DECK_LE_GRAND_BANC } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * LE GRAND BANC et CHEVALIERS DU GRAND ÉTANG — les deux decks Cra-Poiscail,
 * jamais révisés, tombés dans le bas du rayon une fois les autres
 * renforcés (29/09/2026 : 41 % et 44 %).
 *
 * Grand Banc : les Structures qui prennent la place des corps font perdre
 * (La Flaque Sacrée Δ −14, Le Tas de Trucs −12), les vanilles faibles
 * aussi (P'tite Fesse −9), et il n'a aucune carte à 5 ou plus.
 * Chevaliers : dix cartes suspendues à deux Chevaliers ; équipements et
 * pioche font perdre (Faire l'Inventaire −15, Dernières Réserves −13,
 * Fourchette −13, Slip de Guerre −10), le Roi pèse +39.
 *
 * Retenues le 29/09/2026 : « sans Flaque ni Tas, corps » (48 %) et
 * « chevalier abyssal » (53 %) ; les révisions plus lourdes montaient à
 * 63–74 %.
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/craPoiscail.ts \
 *     --field scripts/preconLab/libraries/lot15.ts --games 60
 */

function variante(base: DeckList, prefixe: string, nom: string, retirer: Record<string, number>, ajouter: Record<string, number>): DeckList {
  const reste = { ...retirer };
  const ids = base.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== base.cardIds.length) throw new Error(`${nom} : ${ids.length} cartes`);
  return { ...base, id: `lab-${prefixe}-${nom}`, name: `${prefixe} [${nom}]`, cardIds: ids };
}

/** Les listes d'AVANT la révision, figées ici pour que la mesure se rejoue. */
const liste = (compte: Record<string, number>) => Object.entries(compte).flatMap(([id, n]) => Array<string>(n).fill(id));
const G: DeckList = {
  ...DECK_LE_GRAND_BANC,
  cardIds: liste({
    "tetard-fesse": 3, "ptite-fesse": 3, "cra-poiscail-sauteur": 3, "cra-poiscail-grand-gueule": 3, "cra-poiscail-bavard": 3,
    "cra-poiscail-ramasseur": 3, "banc-de-cra-poiscail": 3, "cra-poiscail-chef-de-banc": 3, "cra-poiscail-porte-etendard": 2,
    "le-trone-de-bouchon": 2, "la-flaque-sacree": 3, "le-tas-de-trucs": 2, "le-seau": 3, "fesses-en-avant": 2, "faire-linventaire": 2,
  }),
};
const C: DeckList = {
  ...DECK_CHEVALIERS_DU_GRAND_ETANG,
  cardIds: liste({
    "ecuyer-cra-poiscail": 3, "destrier-du-grand-etang": 3, "chevalier-cra-poiscail": 2, "bourreau-cra-poiscail": 3,
    "cra-poiscail-porte-etendard": 2, "roi-cra-poiscail": 1, "cra-poiscail-medecin": 3, "cra-poiscail-messager": 3,
    "ptite-fesse-grand-reve": 2, "fourchette-du-grand-etang": 3, "banniere-en-vieille-chaussette": 2, "slip-de-guerre-cra-poiscail": 2,
    "la-quete-du-grand-nenuphar": 2, "le-tournoi-du-grand-etang": 2, "le-grand-saut": 1, "filet-de-sauvetage": 2,
    "faire-linventaire": 2, "dernieres-reserves": 2,
  }),
};
const sur = (deck: DeckList, shipId: string): DeckList => ({ ...deck, id: `${deck.id}@${shipId}`, name: deck.name.replace("]", `, ${shipId}]`), shipId });

const gb1 = variante(G, "Banc", "rois et messagers",
  { "la-flaque-sacree": 3, "le-tas-de-trucs": 2, "faire-linventaire": 2, "ptite-fesse": 3 },
  { "roi-cra-poiscail": 1, "roi-cra-poiscail-abyssal": 1, "cra-poiscail-messager": 3, "la-grande-migration": 2, "cra-poiscail-des-hautes-eaux": 3 });
const gb2 = variante(gb1, "Banc", "rois, messagers, rêveurs",
  { "cra-poiscail-bavard": 3 },
  { "ptite-fesse-grand-reve": 2, "le-grand-saut": 1 });

/** Plus léger : seules les Structures qui font perdre partent. */
const gbLeger = variante(G, "Banc", "sans Flaque ni Tas",
  { "la-flaque-sacree": 3, "le-tas-de-trucs": 2 },
  { "cra-poiscail-messager": 3, "roi-cra-poiscail": 1, "cra-poiscail-des-hautes-eaux": 1 });
const gbLeger2 = variante(G, "Banc", "sans Flaque ni Tas, corps",
  { "la-flaque-sacree": 3, "le-tas-de-trucs": 2 },
  { "cra-poiscail-des-hautes-eaux": 3, "casque-coquille": 2 });

const ch1 = variante(C, "Chevaliers", "chevalier abyssal",
  { "banniere-en-vieille-chaussette": 2, "dernieres-reserves": 2 },
  { "chevalier-cra-poiscail-abyssal": 1, "banc-de-cra-poiscail": 3 });
const ch2 = variante(ch1, "Chevaliers", "formation serrée",
  { "faire-linventaire": 2, "fourchette-du-grand-etang": 3, "slip-de-guerre-cra-poiscail": 2 },
  { "roi-cra-poiscail-abyssal": 1, "cra-poiscail-medecin-abyssal": 1, "ptite-fesse-grand-reve-abyssal": 1, "cra-poiscail-chef-de-banc": 2, "cra-poiscail-grand-gueule": 2 });

export const LIBRARY: DeckList[] = [
  { ...G, id: "lab-banc-avant", name: "Banc [avant le 29/09]" },
  gb1,
  gb2,
  sur(gb1, "le-goliath"),
  gbLeger,
  gbLeger2,
  { ...C, id: "lab-chevaliers-avant", name: "Chevaliers [avant le 29/09]" },
  ch1,
  ch2,
  sur(ch2, "le-brise-lames"),
];
