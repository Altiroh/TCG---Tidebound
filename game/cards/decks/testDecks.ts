import type { CardId } from "@/game/cards/types";
import { PRECONSTRUCTED_DECKS, type DeckList } from "@/game/cards/decks/preconstructed";

/**
 * Decks d'archétypes proposés au joueur en plus des 3 decks de base système
 * (un par Navire) — sources : Notion, "Decks de test — listes verrouillées
 * & implémentation Claude". Plusieurs archétypes partagent le même Navire ;
 * `shipId` reste donc la seule source de vérité pour la suggestion de
 * Navire à l'écran de sélection (cf. `NewMatchScreen`), jamais une
 * déduction depuis le nom du deck.
 *
 * "Récupérer ce qui flotte" (Decks 04 et 05 dans la liste Notion) n'existe
 * pas encore dans `CARD_DATABASE` — plutôt que de la remplacer
 * silencieusement par une carte sans rapport, chaque copie manquante est
 * compensée par une copie supplémentaire d'une carte déjà présente dans le
 * même deck et encore sous sa limite d'exemplaires, pour préserver le total
 * de 40 cartes verrouillé par la source. À réviser dès que cette carte est
 * ajoutée au catalogue.
 */
function repeat(cardId: CardId, copies: number): CardId[] {
  return Array.from({ length: copies }, () => cardId);
}

export const DECK_PONT_DASSAUT: DeckList = {
  id: "pont-dassaut",
  name: "Pont d'Assaut",
  shipId: "le-courlis",
  description: "Aggro : rush de petites unités peu coûteuses pour punir les decks trop lents avant qu'ils ne se stabilisent.",
  cardIds: [
    ...repeat("marin-des-jetees", 3),
    ...repeat("murene-aveugle", 3),
    ...repeat("poisson-lanterne", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("anguille-des-profondeurs", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("harpon-de-pont", 3),
    ...repeat("plaque-de-fortune", 3),
    ...repeat("chose-des-hauts-fonds", 2),
    ...repeat("guetteur-de-brume", 2),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("cartes-des-courants", 2),
    ...repeat("brise-vague-de-fortune", 2),
    ...repeat("treuil-rouille", 3),
  ],
};

export const DECK_DESCENTE_AUX_ABYSSES: DeckList = {
  id: "descente-aux-abysses",
  name: "Descente aux Abysses",
  shipId: "lerrant",
  description: "Raison basse assumée : pousse volontairement vers Tempête/Abysses pour débloquer de puissants finishers abyssaux.",
  cardIds: [
    ...repeat("poisson-lanterne", 3),
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("marin-aux-yeux-rouges-abyssal", 2),
    ...repeat("anguille-des-profondeurs", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("second-au-visage-pale", 2),
    ...repeat("quelque-chose-sous-la-coque", 2),
    ...repeat("le-chant-sous-la-ligne", 2),
    ...repeat("lhomme-revenu-de-la-fosse", 1),
    ...repeat("ce-qui-suit-le-navire", 1),
    ...repeat("loeil-sous-la-mer", 1),
    ...repeat("le-fond-vous-regarde", 1),
    ...repeat("compas-aux-aiguilles-noires", 2),
    ...repeat("cloche-du-grand-fond", 2),
    ...repeat("sondeur-des-mauvaises-eaux", 2),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("balise-des-profondeurs", 2),
    ...repeat("ancre-de-tempete", 2),
    ...repeat("bouee-de-derive", 2),
  ],
};

export const DECK_MAREE_CONTROL: DeckList = {
  id: "maree-control",
  name: "Marée Control",
  shipId: "lerrant",
  description: "Manipule la Marée au maximum pour dicter le rythme de la partie et forcer l'adversaire à jouer sous contrainte.",
  cardIds: [
    ...repeat("cartes-des-courants", 3),
    ...repeat("ancre-de-derive", 2),
    ...repeat("balise-des-profondeurs", 2),
    ...repeat("compas-aux-aiguilles-noires", 2),
    ...repeat("bouee-de-rappel", 2),
    ...repeat("horloge-de-maree", 2),
    ...repeat("sondeur-des-mauvaises-eaux", 2),
    ...repeat("ancre-de-tempete", 2),
    ...repeat("cloche-du-grand-fond", 2),
    ...repeat("cartographe-du-large", 3),
    ...repeat("cloche-dalerte", 2),
    ...repeat("guetteur-de-brume", 2),
    ...repeat("bouee-de-derive", 3),
    ...repeat("brise-vague-de-fortune", 3),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("plaque-de-fortune", 2),
    ...repeat("la-mer-reclame-davantage", 1),
    ...repeat("le-chant-sous-la-ligne", 1),
    ...repeat("crabe-de-fer", 2),
  ],
};

export const DECK_FORTERESSE_FLOTTANTE: DeckList = {
  id: "forteresse-flottante",
  name: "Forteresse Flottante",
  shipId: "le-brise-lames",
  description: "Défensif à l'extrême : empile les protections et vise le plafond défensif pour gagner sur la durée.",
  cardIds: [
    ...repeat("caisses-arrimees", 3),
    ...repeat("brise-vague-de-fortune", 3),
    ...repeat("cylindre-flottant", 2),
    ...repeat("cage-de-flottaison", 2),
    ...repeat("carcasse-renversee", 2),
    ...repeat("cloche-dalerte", 2),
    ...repeat("ancre-de-derive", 2),
    ...repeat("plaque-de-fortune", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("chose-des-hauts-fonds", 2),
    // Kit de Calfatage : 3 au lieu de 2 (voir note de tête de fichier —
    // compense 1× "Récupérer ce qui flotte", absente du catalogue).
    ...repeat("kit-de-calfatage", 3),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("contremaitre-des-amarres", 2),
    ...repeat("mecanicien-aux-mains-noires", 2),
    ...repeat("bouee-de-derive", 2),
    ...repeat("epave-a-fleur-deau", 2),
    ...repeat("ils-sont-sous-nous", 1),
  ],
};

export const DECK_EPAVISTE_SABORDAGE: DeckList = {
  id: "epaviste-sabordage",
  name: "Épaviste / Sabordage",
  shipId: "le-brise-lames",
  description: "Boucles économiques : détruit et Saborde volontairement ses propres cartes pour recycler et récupérer des ressources.",
  cardIds: [
    ...repeat("plongeur-des-epaves", 2),
    ...repeat("caisses-arrimees", 3),
    ...repeat("epave-a-fleur-deau", 3),
    ...repeat("epave-engloutie", 2),
    ...repeat("mecanicien-aux-mains-noires", 2),
    ...repeat("kit-de-calfatage", 3),
    // Thermos du Dernier Quart, Plaque de Fortune, Brise-Vague de Fortune :
    // 3 au lieu de 2 (voir note de tête de fichier — compense 3× "Récupérer
    // ce qui flotte", absente du catalogue).
    ...repeat("thermos-du-dernier-quart", 3),
    ...repeat("treuil-rouille", 3),
    ...repeat("plaque-de-fortune", 3),
    ...repeat("contremaitre-des-amarres", 3),
    ...repeat("bouee-de-derive", 3),
    ...repeat("ancre-de-derive", 2),
    ...repeat("gardien-du-sondeur", 2),
    ...repeat("brise-vague-de-fortune", 3),
    ...repeat("marin-des-jetees", 3),
  ],
};

export const DECK_CAPITAINE_MIDRANGE: DeckList = {
  id: "capitaine-midrange",
  name: "Capitaine / Midrange",
  shipId: "lerrant",
  description: "Deck témoin neutre : courbe solide sans moteur extrême, reste compétitif sans dépendre d'une synergie précise.",
  cardIds: [
    ...repeat("marin-des-jetees", 3),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("guetteur-de-brume", 2),
    ...repeat("crabe-de-fer", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("harpon-de-pont", 2),
    ...repeat("plaque-de-fortune", 2),
    ...repeat("brise-vague-de-fortune", 2),
    ...repeat("caisses-arrimees", 2),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("cartes-des-courants", 2),
    ...repeat("bouee-de-derive", 2),
    ...repeat("anguille-des-profondeurs", 2),
    ...repeat("murene-aveugle", 2),
    ...repeat("poisson-lanterne", 2),
    ...repeat("treuil-rouille", 2),
    ...repeat("marin-aux-yeux-rouges", 2),
  ],
};


/**
 * La Religieuse — le Navire de la piste "Raison, Déraison, healing &
 * passifs" (2026-09-12), qui n'avait encore aucune liste jouable : sans
 * deck, son passif "Pénitence" (−1 aux dégâts d'Ancrage de Déraison, la
 * première fois par tour) ne pouvait pas être essayé du tout.
 *
 * Le deck le pousse donc là où il compte : beaucoup de récupération de
 * Raison à 1 de coût pour remonter d'une Déraison assumée, des soins et
 * des boucliers "1ère fois par tour" pour tenir le temps que ça remonte,
 * et presque aucune grosse menace — c'est la survie qui doit gagner la
 * partie, pas la Puissance.
 */
export const DECK_PENITENCE: DeckList = {
  id: "penitence",
  name: "Pénitence",
  shipId: "la-religieuse",
  description:
    "Survie et Raison : encaisse la Déraison, la rembourse à coups de petites récupérations, et tient la ligne derrière ses boucliers.",
  cardIds: [
    ...repeat("mousse-du-premier-quart", 3),
    ...repeat("marin-des-jetees", 3),
    ...repeat("poisson-lanterne", 3),
    ...repeat("radeau-de-fortune", 3),
    ...repeat("caisses-arrimees", 3),
    ...repeat("levier-de-lest", 3),
    ...repeat("thermos-du-dernier-quart", 3),
    ...repeat("brise-vague-de-fortune", 3),
    ...repeat("wood-vy", 3),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("second-au-visage-pale", 2),
    ...repeat("cage-de-flottaison", 2),
    ...repeat("epave-engloutie", 2),
    ...repeat("capitaine-sans-sommeil", 2),
    ...repeat("lhomme-revenu-de-la-fosse", 3),
  ],
};

/**
 * Cra-Poiscail — deux listes de TEST du Lot 10, une par moitié de
 * l'archétype, pour que ses synergies puissent être essayées en partie
 * plutôt qu'une carte à la fois.
 *
 * Volontairement mono-archétype : les auras, les seuils ("si vous
 * contrôlez au moins 3 Cra-Poiscail") et les déclencheurs "un autre
 * Cra-Poiscail" ne veulent rien dire dans un deck qui n'en contient que
 * la moitié. Ce sont des decks de laboratoire, pas des propositions
 * d'équilibrage.
 */

/** Le côté LARGE : occuper tous les Slots, invoquer des Péons, et tout renforcer d'un coup. Le Brise-Lames (6 Slots) est le seul Navire qui laisse la place. */
export const DECK_LE_GRAND_BANC: DeckList = {
  id: "le-grand-banc",
  name: "Le Grand Banc",
  shipId: "le-brise-lames",
  description:
    "Cra-Poiscail large : sature le plateau de petits corps et de Péons, puis les renforce en bloc (Porte-Étendard, Trône, Bannière).",
  cardIds: [
    ...repeat("tetard-fesse", 3),
    ...repeat("ptite-fesse", 3),
    ...repeat("cra-poiscail-sauteur", 3),
    ...repeat("cra-poiscail-grand-gueule", 3),
    ...repeat("cra-poiscail-des-bas-fonds", 3),
    ...repeat("banc-de-cra-poiscail", 3),
    ...repeat("cra-poiscail-chef-de-banc", 3),
    ...repeat("le-seau", 3),
    ...repeat("la-flaque-sacree", 3),
    ...repeat("fesses-en-avant", 3),
    ...repeat("cra-poiscail-porte-etendard", 2),
    ...repeat("le-trone-de-bouchon", 2),
    ...repeat("la-grande-migration", 2),
    ...repeat("banniere-en-vieille-chaussette", 2),
    ...repeat("roi-cra-poiscail", 1),
    ...repeat("le-grand-saut", 1),
  ],
};

/** Le côté COUR : peu de corps, mais équipés et accompagnés. Sert aussi de banc d'essai aux cibles désignées (Fourchette, Chevalier Abyssale, Tas de Trucs). */
export const DECK_LA_COUR_DU_GRAND_ETANG: DeckList = {
  id: "la-cour-du-grand-etang",
  name: "La Cour du Grand Étang",
  shipId: "lerrant",
  description:
    "Cra-Poiscail chevaleresque : moins de corps, mais équipés et escortés — Chevalier et Destrier, Équipements, et des effets à cibler soi-même.",
  cardIds: [
    ...repeat("ecuyer-cra-poiscail", 3),
    ...repeat("destrier-du-grand-etang", 3),
    ...repeat("cra-poiscail-des-hautes-eaux", 3),
    ...repeat("cra-poiscail-bavard", 3),
    ...repeat("cra-poiscail-ramasseur", 3),
    ...repeat("fourchette-du-grand-etang", 3),
    ...repeat("slip-de-guerre-cra-poiscail", 3),
    ...repeat("casque-coquille", 3),
    ...repeat("chevalier-cra-poiscail", 2),
    ...repeat("bourreau-cra-poiscail", 2),
    ...repeat("ptite-fesse-grand-reve", 2),
    // Le Tas de Trucs réagit au BRIS d'un Objet : sans Objet dans la
    // liste, sa capacité ne pourrait jamais se déclencher — Le Seau est
    // ici pour ça autant que pour ses Péons.
    ...repeat("le-tas-de-trucs", 2),
    ...repeat("le-seau", 2),
    ...repeat("la-quete-du-grand-nenuphar", 2),
    ...repeat("le-tournoi-du-grand-etang", 2),
    ...repeat("chevalier-cra-poiscail-abyssal", 1),
    ...repeat("ptite-fesse-grand-reve-abyssal", 1),
  ],
};

/**
 * Decks d'archétypes, en plus des 3 decks de base système
 * (`PRECONSTRUCTED_DECKS`) — proposés côté sélection de partie locale pour
 * varier les styles de jeu sans passer par une vraie collection/deck-builder.
 */
export const ARCHETYPE_DECKS: readonly DeckList[] = [
  DECK_PONT_DASSAUT,
  DECK_DESCENTE_AUX_ABYSSES,
  DECK_MAREE_CONTROL,
  DECK_FORTERESSE_FLOTTANTE,
  DECK_EPAVISTE_SABORDAGE,
  DECK_CAPITAINE_MIDRANGE,
  DECK_PENITENCE,
];

/**
 * Listes de LABORATOIRE du Lot 10 — mono-archétype, faites pour que les
 * synergies Cra-Poiscail se déclenchent vraiment en partie. Groupées à
 * part dans le sélecteur : ce ne sont pas des propositions d'équilibrage
 * au même titre que les archétypes ci-dessus.
 */
export const CRA_POISCAIL_TEST_DECKS: readonly DeckList[] = [DECK_LE_GRAND_BANC, DECK_LA_COUR_DU_GRAND_ETANG];

/**
 * TOUTES les listes qu'une partie peut utiliser — base système, archétypes
 * et laboratoire Cra-Poiscail. Source unique pour "ce deck est-il
 * jouable ?" (`findPlayableDeck`, côté serveur) : ajouter une liste à l'une
 * des trois collections suffit, il n'y a pas de second endroit à penser à
 * mettre à jour, donc pas de deck proposé à l'écran que le serveur
 * refuserait ensuite.
 */
export const PLAYABLE_DECKS: readonly DeckList[] = [
  ...PRECONSTRUCTED_DECKS,
  ...ARCHETYPE_DECKS,
  ...CRA_POISCAIL_TEST_DECKS,
];
