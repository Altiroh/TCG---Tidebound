import type { CardId } from "@/game/cards/types";
import type { DeckList } from "@/game/cards/decks/preconstructed";

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
];
