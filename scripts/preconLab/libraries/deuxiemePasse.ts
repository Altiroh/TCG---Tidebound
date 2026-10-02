import {
  DECK_APRES_LA_TEMPETE,
  DECK_DESCENTE_AUX_ABYSSES,
  DECK_EPAVISTES,
  DECK_MINEURS_DE_FOND,
} from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * DEUXIÈME PASSE SUR LE BAS DU RAYON (29/09/2026).
 *
 * Épavistes, Mineurs de Fond, Descente aux Abysses et Après la Tempête ont
 * été réglés vers 50 % contre les ANCIENNES listes, puis sont retombés à
 * 35–41 % une fois tout le rayon renforcé. On repart de leur liste
 * actuelle, contre le rayon actuel, avec des pas mesurés : chaque variante
 * remplace les cartes qui font encore perdre au labo par des corps.
 * Retenues : « +Crabes, −Étau » (48 %), « +Baleines » (50 %),
 * « +Albatros+Second » (50 %) et « −Capitaine » (48 %).
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/deuxiemePasse.ts \
 *     --field scripts/preconLab/libraries/lot15.ts --games 60
 */

function variante(base: DeckList, nom: string, retirer: Record<string, number>, ajouter: Record<string, number>): DeckList {
  const reste = { ...retirer };
  const ids = base.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${base.name} ${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== base.cardIds.length) throw new Error(`${base.name} ${nom} : ${ids.length} cartes`);
  return { ...base, id: `lab-p2-${base.id}-${nom}`, name: `${base.name} [${nom}]`, cardIds: ids };
}
const actuel = (base: DeckList): DeckList => ({ ...base, id: `lab-p2-${base.id}-actuel`, name: `${base.name} [actuel]` });

/** Les listes d'AVANT cette passe, figées ici pour que la mesure se rejoue. */
const compte = (deck: DeckList, parCarte: Record<string, number>): DeckList => ({
  ...deck,
  cardIds: Object.entries(parCarte).flatMap(([id, n]) => Array<string>(n).fill(id)),
});
const EPAVISTES_AVANT = compte(DECK_EPAVISTES, {
  "charpentier-des-epaves": 3,
  "mecanicien-aux-mains-noires": 2,
  "charpentiere-de-veille": 2,
  "wood-vy": 2,
  "matelot-du-sans-nom": 3,
  "chose-des-hauts-fonds": 3,
  "caisses-arrimees": 3,
  "caisse-des-dernieres-planches": 3,
  "caisse-des-dernieres-planches-abyssal": 1,
  "atelier-de-calfatage": 2,
  "cage-de-flottaison": 2,
  "levier-de-lest": 2,
  "grappin-de-recuperation": 1,
  "etau-du-calfat": 2,
  "cloison-etanche": 2,
});
const MINEURS_DE_FOND_AVANT = compte(DECK_MINEURS_DE_FOND, {
  "la-nasse-trop-pleine": 2,
  "jugement-du-phare": 1,
  "barils-de-poudre": 2,
  "chaine-de-travers": 2,
  "fausse-cargaison": 2,
  "cloison-etanche": 2,
  "cale-inondable": 2,
  "derniere-barricade": 2,
  "filet-a-la-derive": 3,
  "cloche-dalerte": 2,
  "charpentier-des-epaves": 3,
  "treuil-rouille": 1,
  "bernard-lermite-dacier": 3,
  "crabe-de-fer": 3,
  "matelot-du-sans-nom": 3,
  "chose-des-hauts-fonds": 3,
});
const DESCENTE_AUX_ABYSSES_AVANT = compte(DECK_DESCENTE_AUX_ABYSSES, {
  "anguille-des-profondeurs": 3,
  "raie-des-fosses": 2,
  "sondeur-des-mauvaises-eaux": 2,
  "regulateur-de-courant": 3,
  "balise-des-profondeurs": 2,
  "la-gueule-sous-la-mer": 1,
  "la-chose-qui-remonte": 2,
  "masse-sombre": 3,
  "si-raie-ponce": 2,
  "bat-marin": 1,
  "ce-qui-suit-le-navire": 3,
  "marin-aux-yeux-rouges-abyssal": 1,
  "bat-marin-abyssal": 1,
  "revenante-de-la-fosse-abyssal": 1,
  "pont-mine": 2,
});
const APRES_LA_TEMPETE_AVANT = compte(DECK_APRES_LA_TEMPETE, {
  "le-pont-est-plein": 2,
  "vague-scelerate": 2,
  "le-large-se-fache": 1,
  "la-mer-reprend-tout": 1,
  "jugement-du-phare": 1,
  "derniere-barricade": 2,
  "cage-de-flottaison": 2,
  "crabe-de-fer": 3,
  "carape-hus": 3,
  "matelot-du-sans-nom": 1,
  "capitaine-du-dernier-retour": 2,
  "chose-des-hauts-fonds": 2,
  "chirurgien-du-bord": 2,
  "trousse-du-bord": 2,
  "un-peu-de-repit": 3,
  "dernieres-reserves": 1,
  "faire-linventaire": 3,
  "le-brise-ligne": 2,
  "lamiral-sans-pavillon": 1,
  "leviathan-balafre": 1,
  "dernier-jour-en-mer": 1,
});

const E = EPAVISTES_AVANT;
const M = MINEURS_DE_FOND_AVANT;
const A = DESCENTE_AUX_ABYSSES_AVANT;
const T = APRES_LA_TEMPETE_AVANT;

export const LIBRARY: DeckList[] = [
  actuel(E),
  variante(E, "+Crabes", { "grappin-de-recuperation": 1 }, { "crabe-de-fer": 3 }),
  variante(E, "+Crabes, −Étau", { "etau-du-calfat": 2 }, { "crabe-de-fer": 3 }),
  variante(E, "+Crabes+Cormorans", { "grappin-de-recuperation": 1, "etau-du-calfat": 2 }, { "crabe-de-fer": 3, "cormoran-de-fer": 3 }),

  actuel(M),
  variante(M, "+Baleines", { "chaine-de-travers": 2 }, {}),
  variante(M, "+Baleines+Carapé", { "chaine-de-travers": 2, "cloche-dalerte": 2 }, { "carape-hus": 2 }),
  variante(M, "+Baleines+Carapé+Cormorans", { "chaine-de-travers": 2, "cloche-dalerte": 2, "la-nasse-trop-pleine": 2 }, { "carape-hus": 2, "cormoran-de-fer": 2 }),

  actuel(A),
  variante(A, "+Albatros", { "pont-mine": 2 }, { "albatros-de-mauvais-temps": 2 }),
  variante(A, "+Second", { "balise-des-profondeurs": 2 }, { "second-au-visage-pale": 2 }),
  variante(A, "+Albatros+Second", { "pont-mine": 2, "balise-des-profondeurs": 2 }, { "albatros-de-mauvais-temps": 2, "second-au-visage-pale": 2 }),

  actuel(T),
  variante(T, "−Capitaine", { "capitaine-du-dernier-retour": 2 }, { "matelot-du-sans-nom": 2 }),
  variante(T, "−Capitaine/Chirurgien", { "capitaine-du-dernier-retour": 2, "chirurgien-du-bord": 2 }, { "chose-des-hauts-fonds": 1, "matelot-du-sans-nom": 2, "cormoran-de-fer": 1 }),
  variante(T, "−Capitaine/Chirurgien/Répit", { "capitaine-du-dernier-retour": 2, "chirurgien-du-bord": 2, "un-peu-de-repit": 3 }, { "chose-des-hauts-fonds": 1, "matelot-du-sans-nom": 2, "cormoran-de-fer": 2, "vieille-selle": 2 }),
];
