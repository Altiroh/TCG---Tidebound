/**
 * BIBLIOTHÈQUE DE PRÉCONSTRUITS PROPOSÉE — refonte du 23/09/2026.
 *
 * Sept decks, reconstruits depuis le catalogue (et non depuis les douze
 * listes précédentes), mesurés sur ~150 000 parties de bot, avec deux
 * niveaux de pilote (moyen, difficile). Le rapport complet — méthode,
 * matchups, dépendances, Quality Gate, archétypes abandonnés et trous du
 * catalogue — accompagne cette liste.
 *
 * Ce fichier est une PROPOSITION : `game/cards/decks/precon.ts` n'est pas
 * modifié. Reprendre ces listes dans le rayon demande une décision (les
 * decks retirés ont pu être débloqués par des joueurs, et leur `id` est
 * en base).
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/proposition.ts --games 40 --bot difficile
 */
import { repeat, type DeckList } from "@/game/cards/decks/types";
import { validateDeckList } from "@/game/rules/deckValidation";
import { NEUTRE } from "@/scripts/preconLab/libraries/cardRates";

export function deck(id: string, name: string, shipId: string, description: string, cardIds: string[]): DeckList {
  const list: DeckList = { id, name, shipId, description, cardIds };
  const check = validateDeckList(list);
  if (!check.ok) throw new Error(`${name} : ${check.error}`);
  if (cardIds.length !== 40) throw new Error(`${name} : ${cardIds.length} cartes`);
  return list;
}

export const GRAND_BANC = deck("le-grand-banc", "Le Grand Banc", "le-brise-lames", "Swarm : remplir le plateau de Cra-Poiscail, les renforcer tous d'un coup, et tenir la ligne avec la chevalerie du Grand Étang.", [
  ...repeat("ptite-fesse", 3),
  ...repeat("cra-poiscail-messager", 3),
  ...repeat("cra-poiscail-bavard", 2),
  ...repeat("cra-poiscail-des-hautes-eaux", 3),
  ...repeat("ecuyer-cra-poiscail", 2),
  ...repeat("cra-poiscail-medecin", 2),
  ...repeat("cra-poiscail-ramasseur", 2),
  ...repeat("banc-de-cra-poiscail", 3),
  ...repeat("cra-poiscail-chef-de-banc", 2),
  ...repeat("cra-poiscail-porte-etendard", 2),
  ...repeat("roi-cra-poiscail", 1),
  ...repeat("destrier-du-grand-etang", 3),
  ...repeat("chevalier-cra-poiscail", 2),
  ...repeat("chevalier-cra-poiscail-abyssal", 1),
  ...repeat("le-seau", 3),
  ...repeat("le-trone-de-bouchon", 2),
  ...repeat("fesses-en-avant", 2),
  ...repeat("thermos-du-dernier-quart", 2),
]);

export const VEILLEE = deck("la-veillee", "La Veillée", "le-brise-lames", "Attrition : des Un Dead qui ne tombent jamais tout à fait — chaque défausse paie, chaque perte revient.", [
  ...repeat("ptit-bout", 3),
  ...repeat("cache-cache", 3),
  ...repeat("encore-cinq-minutes", 3),
  ...repeat("papa-est-en-mer", 3),
  ...repeat("promis-jattends", 3),
  ...repeat("on-rentre-bientot", 3),
  ...repeat("le-copain-du-dessous", 3),
  ...repeat("maman-revient", 2),
  ...repeat("tu-mavais-promis", 2),
  ...repeat("tu-viens-jouer", 2),
  ...repeat("on-avait-dit-tous-ensemble", 1),
  ...repeat("maman-revient-abyssal", 1),
  ...repeat("le-naufrage-impossible", 1),
  ...repeat("mousse-des-quarts", 3),
  ...repeat("gabier-au-carnet-mouille", 2),
  ...repeat("le-gouter", 3),
  ...repeat("la-petite-chanson", 2),
]);

export const THEATRE = deck("le-theatre-englouti-deck", "Le Théâtre Englouti", "la-religieuse", "Marionnettes : des arrivées qui changent le combat — Il Dottore affaiblit, Il Capitano écrase, Colombina rejoue la meilleure.", [
  ...repeat("pulcinella-gonfle", 3),
  ...repeat("arlequin-raccommodeur", 3),
  ...repeat("pantalone-sans-sou", 3),
  ...repeat("la-prima-noyee", 3),
  ...repeat("colombina-aux-cent-visages", 2),
  ...repeat("il-dottore-des-noyes", 2),
  ...repeat("il-capitano-naufrage", 2),
  ...repeat("le-regisseur-sans-visage", 1),
  ...repeat("arlecchino-celui-derriere-le-masque-abyssal", 1),
  ...repeat("la-prima-noyee-abyssal", 1),
  ...repeat("arlecchino-des-profondeurs", 1),
  ...repeat("changement-de-role", 1),
  ...repeat("mousse-des-quarts", 3),
  ...repeat("marin-des-jetees", 3),
  ...repeat("contremaitre-des-amarres", 3),
  ...repeat("thermos-du-dernier-quart", 2),
  ...repeat("matelot-insomniaque", 3),
  ...repeat("mousse-du-premier-quart", 3),
]);

export const FORTERESSE = deck("la-forteresse", "La Forteresse", "le-brise-lames", "Défense : un mur de Garde que l'adversaire doit percer, puis des géants qui le renversent.", [
  ...repeat("crabe-de-fer", 3),
  ...repeat("masse-sombre-abyssal", 3),
  ...repeat("le-dernier-rempart", 2),
  ...repeat("bernard-lermite-dacier", 3),
  ...repeat("matelot-du-sans-nom", 3),
  ...repeat("chirurgien-de-coque", 3),
  ...repeat("baleine-aux-cicatrices-blanches", 2),
  ...repeat("vieux-loup-de-mer", 2),
  ...repeat("charpentier-de-bord", 3),
  ...repeat("harnois-de-vigie", 2),
  ...repeat("chaine-de-fer-noir", 1),
  ...repeat("thermos-du-dernier-quart", 2),
  ...repeat("brise-vague-de-fortune", 2),
  ...repeat("derniere-barricade", 2),
  ...repeat("cage-de-flottaison", 2),
  ...repeat("carcasse-renversee", 1),
  ...repeat("caisses-arrimees", 2),
  ...repeat("on-flotte-encore", 1),
  ...repeat("lettre-jamais-ouverte", 1),
]);

export const CHASSE = deck("chasse-au-gros", "Chasse au Gros", "le-goliath", "Midrange : blesser d'abord — Guetteur, harpons et Canon de proue —, achever ensuite.", [
  ...repeat("guetteur-mefiant", 2),
  ...repeat("poisson-aux-dents-de-verre", 3),
  ...repeat("murene-aveugle", 3),
  ...repeat("barracuda-des-hauts-fonds", 3),
  ...repeat("matelot-du-sans-nom", 3),
  ...repeat("requin-balafre", 3),
  ...repeat("harponneur-du-dernier-quai", 3),
  ...repeat("chose-des-hauts-fonds", 2),
  ...repeat("si-raie-ponce", 2),
  ...repeat("raie-des-fosses", 2),
  ...repeat("ce-qui-suit-le-navire", 2),
  ...repeat("vieux-harponneur", 2),
  ...repeat("baleine-aux-cicatrices-blanches", 2),
  ...repeat("le-brise-ligne", 1),
  ...repeat("leviathan-balafre", 1),
  ...repeat("coup-de-harpon", 3),
  ...repeat("harpon-de-pont", 1),
  ...repeat("thermos-du-dernier-quart", 2),
]);

export const VENTS_CONTRAIRES = deck("vents-contraires", "Vents Contraires", "lerrant", "Tempo : des oiseaux qui frappent dès leur arrivée, d'autres qui gardent le pont, et une Raison adverse qui s'assèche.", [
  ...repeat("sterne-des-embruns", 3),
  ...repeat("goeland-chapardeur", 3),
  ...repeat("cormoran-de-fer", 3),
  ...repeat("cormoran-de-fer-abyssal", 1),
  ...repeat("mouette-du-brise-lames", 3),
  ...repeat("albatros-de-mauvais-temps", 2),
  ...repeat("pelican-des-cales", 3),
  ...repeat("marin-aux-yeux-rouges", 3),
  ...repeat("marin-aux-yeux-rouges-abyssal", 3),
  ...repeat("guetteur-de-brume", 3),
  ...repeat("cartographe-du-large", 2),
  ...repeat("par-dessus-bord", 2),
  ...repeat("harpon-de-pont", 2),
  ...repeat("longue-vue-rayee", 2),
  ...repeat("lettre-jamais-ouverte", 3),
  ...repeat("journal-de-bord-detrempe", 2),
]);

export const APRES_LA_TEMPETE = deck("apres-la-tempete", "Après la Tempête", "la-religieuse", "Contrôle : survivre, tout balayer, puis reconstruire avec ce que personne d'autre ne peut payer.", [
  ...repeat("carape-hus", 3),
  ...repeat("vieux-loup-de-mer", 2),
  ...repeat("second-au-visage-pale", 2),
  ...repeat("poisson-aux-dents-de-verre", 3),
  ...repeat("masse-sombre", 2),
  ...repeat("capitaine-sans-sommeil", 2),
  ...repeat("chirurgien-du-bord", 2),
  ...repeat("baleine-aux-cicatrices-blanches", 1),
  ...repeat("le-brise-ligne", 2),
  ...repeat("leviathan-balafre", 1),
  ...repeat("marin-des-jetees", 3),
  ...repeat("le-pont-est-plein", 2),
  ...repeat("vague-scelerate", 2),
  ...repeat("le-large-se-fache", 1),
  ...repeat("la-mer-reprend-tout", 1),
  ...repeat("abandonnez-le-navire", 1),
  ...repeat("journal-de-bord-detrempe", 2),
  ...repeat("lettre-jamais-ouverte", 1),
  ...repeat("pansements-de-coque", 2),
  ...repeat("on-flotte-encore", 1),
  ...repeat("thermos-du-dernier-quart", 1),
  ...repeat("dernier-jour-en-mer", 1),
  ...repeat("coup-de-harpon", 2),
]);
/** Les sept decks proposés. */
export const PROPOSITION: DeckList[] = [GRAND_BANC, VEILLEE, THEATRE, FORTERESSE, CHASSE, VENTS_CONTRAIRES, APRES_LA_TEMPETE];

/** Pour le labo : la proposition, plus le témoin NEUTRE qu'elle doit battre. */
export const LIBRARY: DeckList[] = [NEUTRE, ...PROPOSITION];
