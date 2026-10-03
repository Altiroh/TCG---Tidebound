import { DECK_SENTINELLES_CHROMATIQUES } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * SENTINELLES CHROMATIQUES — seules au-dessus du rayon (29/09/2026).
 *
 * Après la révision des six decks du bas, quatorze listes tiennent entre
 * 34 et 58 % ; les Sentinelles gagnent 77 %, alors même qu'elles traînent
 * une dizaine de cartes qui font perdre (Les Couleurs Répondent Δ −22,
 * Bracelet −18, Synchronisation −13, Pierre Retrouvée −13, Coffret −12).
 * Le nouveau Cap sûr de L'Errant leur a donné huit points. On mesure donc
 * les COQUES, avec la liste actuelle et avec une liste NETTOYÉE (chaque
 * carte fait quelque chose), pour trouver l'endroit où le deck redevient
 * plaisant à jouer ET à affronter. « nettoyée, le-courlis » (50 %) est
 * devenue le préconstruit le 29/09/2026 :
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/sentinelles.ts \
 *     --field scripts/preconLab/libraries/lot15.ts --games 60
 */

/** La liste et le Navire d'AVANT la révision, figés ici pour que la mesure se rejoue. */
const S: DeckList = {
  ...DECK_SENTINELLES_CHROMATIQUES,
  shipId: "lerrant",
  cardIds: Object.entries({
    "heros-de-la-flamme": 3,
    "gardienne-de-leclat": 3,
    "tacticien-de-lecume": 3,
    "porteur-de-jade": 2,
    "bracelet-chromatique": 2,
    "appel-des-sentinelles": 3,
    "poste-chromatique": 1,
    "pierre-retrouvee": 1,
    "veilleuse-de-lombre": 2,
    "survivant-de-la-mousse": 2,
    "emissaire-de-quartz": 2,
    "la-premiere-pierre": 1,
    "coffret-aux-cinq-pierres": 1,
    "briseur-du-brasier": 2,
    "rempart-du-soleil": 2,
    "stratege-de-lazur": 2,
    "oracle-damethyste": 1,
    "les-couleurs-repondent": 2,
    synchronisation: 1,
    "coup-de-harpon": 1,
    "heraut-de-nacre": 1,
    "formation-prismatique": 1,
    "le-geant-chromatique": 1,
  }).flatMap(([id, n]) => Array<string>(n).fill(id)),
};

function variante(nom: string, retirer: Record<string, number>, ajouter: Record<string, number>, base: DeckList = S): DeckList {
  const reste = { ...retirer };
  const ids = base.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== base.cardIds.length) throw new Error(`${nom} : ${ids.length} cartes`);
  return { ...base, id: `lab-sentinelles-${nom}`, name: `Sentinelles [${nom}]`, cardIds: ids };
}

/** Le sous-moteur des Éclats sans source, et les sorts qui ne partent presque jamais. */
const nettoyee = variante(
  "nettoyée",
  { "les-couleurs-repondent": 2, "bracelet-chromatique": 2, synchronisation: 1, "pierre-retrouvee": 1, "coffret-aux-cinq-pierres": 1 },
  { "rempart-du-soleil": 1, "briseur-du-brasier": 1, "stratege-de-lazur": 1, "oracle-damethyste": 2, "veilleuse-de-lombre": 1, "heraut-de-nacre": 1 }
);

const COQUES = ["lerrant", "le-courlis", "le-goliath", "la-verriere", "la-religieuse"];
const sur = (deck: DeckList, shipId: string): DeckList => ({
  ...deck,
  id: `${deck.id}@${shipId}`,
  name: deck.name.replace("]", `, ${shipId}]`),
  shipId,
});

export const LIBRARY: DeckList[] = COQUES.flatMap((shipId) => [
  sur({ ...S, id: "lab-sentinelles-actuelle", name: "Sentinelles [actuelle]" }, shipId),
  sur(nettoyee, shipId),
]);
