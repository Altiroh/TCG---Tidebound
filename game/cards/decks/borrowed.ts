import { repeat, type DeckList } from "@/game/cards/decks/types";

/**
 * DECKS D'EMPRUNT — un par Navire, gratuits, choisis UNE fois depuis la
 * Collection à la sortie du tutoriel (Notion « Progression joueur » §3).
 *
 * Source de vérité : Notion « Bibliothèque de decks — v4 · Compétitif
 * depuis zéro » (19/09/2026). Cette page a remis les compteurs à zéro :
 * « Toutes les listes précédentes sont abandonnées comme base de
 * construction. » Les listes v3 (Le Courlis, L'Errant, Le Brise-Lames et
 * les archétypes) ne sont plus canoniques et ont été retirées du code avec
 * elles — le banc d'essai du 19/09/2026 les donnait entre 9,4 % et 90,6 %
 * de victoires, ce qui n'est pas un rayon qu'on propose à un joueur.
 *
 * Ce que la v4 demande à un deck d'emprunt : « Faciles à piloter, pas
 * faibles. Ils doivent utiliser des cartes réellement fortes et un plan
 * direct. » Un emprunt n'est donc PAS une version édulcorée d'un
 * préconstruit : c'est le meilleur deck simple de son Navire.
 *
 * Rappel de §3 : les cartes d'un deck d'emprunt restent PRÊTÉES. Rien
 * n'est crédité à la collection, et les boosters remplacent peu à peu le
 * prêt par de la possession réelle.
 */

/**
 * Bec dans la Brume — Le Courlis (4 Slots, Raison 12).
 *
 * Condition de victoire : faire assez de dégâts avant que l'adversaire
 * rentabilise ses permanents lourds. Les 4 Slots deviennent une contrainte
 * POSITIVE — peu de corps, mais presque tous attaquent dès leur arrivée
 * (Pied marin) ou filtrent la main immédiatement.
 */
export const DECK_BEC_DANS_LA_BRUME: DeckList = {
  id: "bec-dans-la-brume",
  name: "Bec dans la Brume",
  shipId: "le-courlis",
  description:
    "Agressif : des corps qui frappent dès leur arrivée et assez de filtrage pour que la main ne soit jamais à court de menace.",
  cardIds: [
    // Les corps : Pied marin partout, de 1 à 4 de Raison.
    ...repeat("sterne-des-embruns", 3),
    ...repeat("goeland-chapardeur", 3),
    ...repeat("cormoran-de-fer", 3),
    ...repeat("pelican-des-cales", 3),
    ...repeat("marin-des-jetees", 3),
    ...repeat("murene-aveugle", 3),
    ...repeat("albatros-de-mauvais-temps", 2),
    ...repeat("poisson-lanterne", 2),
    // Ce qui fait monter une petite bête.
    ...repeat("harpon-de-pont", 3),
    ...repeat("longue-vue-rayee", 3),
    ...repeat("plaque-de-fortune", 2),
    // Le filtrage, qui transforme une pioche morte en la carte qui manque.
    ...repeat("rations-du-matin-gris", 3),
    ...repeat("lettre-jamais-ouverte", 3),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("cartes-des-courants", 2),
  ],
};

/**
 * Cap de Fer — L'Errant (5 Slots, Raison 10).
 *
 * Condition de victoire : jouer une menace ou une réponse efficace à
 * presque chaque tour, sans dépendre d'un moteur unique. C'est le deck
 * témoin du rayon — celui qui ne perd jamais parce qu'il n'a pas pioché
 * SA carte.
 */
export const DECK_CAP_DE_FER: DeckList = {
  id: "cap-de-fer",
  name: "Cap de Fer",
  shipId: "lerrant",
  description:
    "Midrange : une menace ou une réponse à chaque tour, sans moteur unique — le deck ne dépend jamais d'une seule carte.",
  cardIds: [
    ...repeat("marin-des-jetees", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("poisson-aux-dents-de-verre", 3),
    ...repeat("poisson-lanterne", 3),
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("chose-des-hauts-fonds", 2),
    ...repeat("guetteur-de-brume", 2),
    // De quoi rendre chaque corps rentable en combat.
    ...repeat("harpon-de-pont", 2),
    ...repeat("plaque-de-fortune", 2),
    ...repeat("treuil-rouille", 1),
    // Le fond de terrain, et la main qui se renouvelle.
    ...repeat("caisses-arrimees", 2),
    ...repeat("bouee-de-derive", 2),
    ...repeat("brise-vague-de-fortune", 1),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("cartes-des-courants", 2),
    ...repeat("rations-du-matin-gris", 2),
    ...repeat("lettre-jamais-ouverte", 2),
  ],
};

/**
 * Le Banc Déborde — Le Brise-Lames (6 Slots, Raison 8).
 *
 * Condition de victoire : remplir les 6 Slots mieux qu'aucun autre Navire
 * ne le peut, et transformer chaque corps supplémentaire en pression
 * cumulative. Le Navire est choisi pour ses Slots, pas pour son thème.
 */
export const DECK_LE_BANC_DEBORDE: DeckList = {
  id: "le-banc-deborde",
  name: "Le Banc Déborde",
  shipId: "le-brise-lames",
  description:
    "Swarm : sature les six Slots de petits corps et de Péons, puis les renforce en bloc pour que chaque attaque compte double.",
  cardIds: [
    // Les corps, le plus tôt possible.
    ...repeat("tetard-fesse", 3),
    ...repeat("ptite-fesse", 3),
    ...repeat("cra-poiscail-messager", 3),
    ...repeat("cra-poiscail-sauteur", 3),
    ...repeat("banc-de-cra-poiscail", 3),
    ...repeat("cra-poiscail-grand-gueule", 2),
    ...repeat("cra-poiscail-bavard", 2),
    ...repeat("cra-poiscail-chef-de-banc", 2),
    ...repeat("cra-poiscail-ramasseur", 2),
    ...repeat("cra-poiscail-medecin", 2),
    ...repeat("cra-poiscail-porte-etendard", 2),
    ...repeat("roi-cra-poiscail", 1),
    // Ce qui renforce le banc, et ce qui le remplit encore.
    ...repeat("le-seau", 2),
    ...repeat("la-flaque-sacree", 2),
    ...repeat("le-trone-de-bouchon", 2),
    ...repeat("tas-de-bouts-de-bois", 2),
    ...repeat("fesses-en-avant", 2),
    ...repeat("thermos-du-dernier-quart", 2),
  ],
};

/**
 * Grâce sous pression — La Religieuse (5 Slots, Raison 10, passif
 * « Pénitence » : la Déraison coûte 1 Ancrage de moins, une fois par tour).
 *
 * Condition de victoire : dépenser plus de Raison que l'adversaire sans
 * mourir de cette dette, pour tenir continuellement plus de plateau et
 * plus d'actions utiles. Le Cra-Poiscail Médecin n'est pas là pour sa
 * famille : il rend 1 Ancrage à chaque Objet brisé, et le deck en brise un
 * par tour.
 */
export const DECK_GRACE_SOUS_PRESSION: DeckList = {
  id: "grace-sous-pression",
  name: "Grâce sous pression",
  shipId: "la-religieuse",
  description:
    "Endurance active : dépense plus de Raison que l'adversaire, et rembourse la dette en Ancrage à chaque Objet brisé.",
  cardIds: [
    // Ce qui encaisse pendant que la dette se rembourse.
    ...repeat("mousse-du-premier-quart", 3),
    ...repeat("poisson-lanterne", 3),
    ...repeat("cra-poiscail-medecin", 3),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("mouette-du-brise-lames", 2),
    ...repeat("chose-des-hauts-fonds", 2),
    // Les Objets qu'on brise — la moitié du plan tient là-dessus.
    ...repeat("thermos-du-dernier-quart", 3),
    ...repeat("pansements-de-coque", 3),
    ...repeat("chope", 2),
    ...repeat("rations-du-matin-gris", 2),
    ...repeat("lettre-jamais-ouverte", 2),
    ...repeat("derniere-planche", 2),
    // Le rapiéçage de fond, et de quoi garder un corps en vie.
    ...repeat("bouee-de-derive", 3),
    ...repeat("infirmerie-de-pont", 2),
    ...repeat("barge-de-reparation", 2),
    ...repeat("plaque-de-fortune", 2),
    ...repeat("harnois-de-vigie", 2),
  ],
};

/**
 * À Portée — Le Goliath (5 Slots, Raison 10, capacité « Canon de proue »).
 *
 * Condition de victoire : forcer des combats où 2 dégâts de Canon
 * transforment une unité adverse rentable en échange perdant, puis
 * attaquer dans les ouvertures ainsi créées. D'où la courbe basse et la
 * Raison disponible : le Canon se paie tous les tours.
 */
export const DECK_A_PORTEE: DeckList = {
  id: "a-portee",
  name: "À Portée",
  shipId: "le-goliath",
  description:
    "Artillerie de plateau : des corps bon marché qui tiennent la ligne, et un Canon qui rend chaque échange perdant pour l'adversaire.",
  cardIds: [
    ...repeat("marin-des-jetees", 3),
    ...repeat("poisson-lanterne", 3),
    ...repeat("murene-aveugle", 3),
    ...repeat("poisson-aux-dents-de-verre", 3),
    ...repeat("guetteur-mefiant", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("mouette-du-brise-lames", 2),
    // La Raison, que le Canon prélève avant même qu'un tir soit décidé.
    ...repeat("thermos-du-dernier-quart", 3),
    ...repeat("rations-du-matin-gris", 3),
    ...repeat("lettre-jamais-ouverte", 3),
    // De quoi survivre à l'échange qu'on vient de forcer.
    ...repeat("bouee-de-derive", 2),
    ...repeat("harnois-de-vigie", 2),
    ...repeat("plaque-de-fortune", 2),
    ...repeat("brise-vague-de-fortune", 2),
  ],
};

/**
 * Les cinq decks d'emprunt, un par Navire — l'ordre est celui de la page
 * v4, donc celui du rayon à l'écran.
 */
export const BORROWED_DECK_LISTS: readonly DeckList[] = [
  DECK_BEC_DANS_LA_BRUME,
  DECK_CAP_DE_FER,
  DECK_LE_BANC_DEBORDE,
  DECK_GRACE_SOUS_PRESSION,
  DECK_A_PORTEE,
];
