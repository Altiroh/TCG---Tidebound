import { DECK_MINEURS_DE_FOND } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * MINEURS DE FOND — des pièges qui rapportent (29/09/2026).
 *
 * Audit : chaque piège se détruit après avoir tiré (« Détruisez ensuite »),
 * c'est une vraie destruction (`onDeath`), mais aucune carte du deck n'en
 * profite ; ses seules cartes gagnantes sont ses corps (Matelot du
 * Sans-Nom, Crabe de Fer), et il ne pose que 2,8 unités par partie.
 * Variantes de LISTE seulement — aucun texte ne change. « retombées+corps »
 * (52 %, contre 13 %) est devenue la liste du préconstruit le 29/09/2026 :
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/mineurs.ts \
 *     --field scripts/preconLab/libraries/lot15.ts --games 60
 */

/** La liste d'AVANT la révision, figée ici pour que la mesure se rejoue. */
const M: DeckList = {
  ...DECK_MINEURS_DE_FOND,
  cardIds: Object.entries({
    "la-nasse-trop-pleine": 2,
    "jugement-du-phare": 1,
    "barils-de-poudre": 2,
    "pont-mine": 2,
    "chaine-de-travers": 2,
    "fausse-cargaison": 2,
    "cloison-etanche": 2,
    "cale-inondable": 2,
    "derniere-barricade": 2,
    "filet-a-la-derive": 3,
    "cloche-dalerte": 2,
    "ancre-de-derive": 2,
    "journal-de-bord": 3,
    "planche-de-fortune": 2,
    "charge-de-demolition": 2,
    "guetteur-de-brume": 3,
    "crabe-de-fer": 3,
    "matelot-du-sans-nom": 3,
  }).flatMap(([id, n]) => Array<string>(n).fill(id)),
};

function variante(nom: string, retirer: Record<string, number>, ajouter: Record<string, number>): DeckList {
  const reste = { ...retirer };
  const ids = M.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== M.cardIds.length) throw new Error(`${nom} : ${ids.length} cartes`);
  return { ...M, id: `lab-mineurs-${nom}`, name: `Mineurs [${nom}]`, cardIds: ids };
}

/** Les cartes qui ne font rien pour gagner : chercher, sauver ou casser des Structures. */
const OUTILS = { "journal-de-bord": 3, "planche-de-fortune": 2, "charge-de-demolition": 2, "pont-mine": 2 };
/** Ce qui profite d'un piège qui part, et un corps qui vit des Structures. */
const RETOMBEES = { "charpentier-des-epaves": 3, "plongeur-des-epaves": 2, "bernard-lermite-dacier": 3, "treuil-rouille": 1 };

export const LIBRARY: DeckList[] = [
  { ...M, id: "lab-mineurs-avant", name: "Mineurs [avant le 29/09]" },
  variante("retombées", OUTILS, RETOMBEES),
  variante("retombées+équipe", { ...OUTILS, "guetteur-de-brume": 3, "cale-inondable": 2 }, {
    ...RETOMBEES,
    "charpentiere-de-veille": 2,
    "mecanicien-aux-mains-noires": 2,
    "treuil-rouille": 2,
  }),
  variante("retombées+corps", { ...OUTILS, "guetteur-de-brume": 3 }, { ...RETOMBEES, "chose-des-hauts-fonds": 3 }),
  variante("retombées+corps+équipe", { ...OUTILS, "guetteur-de-brume": 3, "cale-inondable": 2 }, {
    ...RETOMBEES,
    "chose-des-hauts-fonds": 3,
    "charpentiere-de-veille": 2,
  }),
];
