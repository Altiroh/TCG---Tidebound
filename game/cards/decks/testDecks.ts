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
  description:
    "Pousse la Marée vers Tempête et Abysses, puis frappe avec des corps qui n'y sont bons que là — la mer fait la moitié du travail.",
  cardIds: [
    // Le moteur de Marée : forcer l'état, le tenir, l'amplifier.
    ...repeat("cartes-des-courants", 3),
    ...repeat("regulateur-de-courant", 2),
    ...repeat("horloge-de-maree", 2),
    ...repeat("ancre-de-tempete", 2),
    ...repeat("balise-des-profondeurs", 2),
    ...repeat("compas-aux-aiguilles-noires", 2),
    // Les corps qui encaissent le voyage et frappent à l'arrivée. La liste
    // n'en avait que 9 pour 13 de Puissance totale (audit du 18/09/2026) :
    // elle manipulait la mer sans jamais pouvoir conclure, et perdait
    // 89 % de ses parties.
    ...repeat("poisson-lanterne", 3),
    ...repeat("masse-sombre", 3),
    ...repeat("masse-sombre-abyssal", 2),
    ...repeat("bat-marin", 3),
    ...repeat("bat-marin-abyssal", 2),
    ...repeat("harponneur-du-dernier-quai", 3),
    ...repeat("raie-des-fosses", 2),
    ...repeat("la-chose-qui-remonte", 2),
    // Tenir la ligne le temps que la mer monte, et payer le voyage.
    ...repeat("crabe-de-fer", 3),
    ...repeat("cartographe-du-large", 2),
    ...repeat("thermos-du-dernier-quart", 2),
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
  description:
    "Boucles économiques : Saborde ses propres Structures pour piocher, rendre de l'Ancrage et les repêcher au Cimetière.",
  cardIds: [
    // Les Structures qu'on pose POUR les perdre.
    ...repeat("caisses-arrimees", 3),
    ...repeat("bouee-de-derive", 3),
    ...repeat("epave-a-fleur-deau", 3),
    ...repeat("caisse-des-dernieres-planches", 3),
    ...repeat("atelier-de-calfatage", 2),
    // Ce qui rend la perte payante. Le Lot 12 a écrit exactement cette
    // moitié-là et aucune liste ne l'ouvrait (audit du 18/09/2026) : sans
    // elle, le deck sabordait sans contrepartie et perdait 72 % de ses
    // parties.
    ...repeat("charpentier-des-epaves", 3),
    ...repeat("charpentiere-de-veille", 2),
    ...repeat("etau-du-calfat", 2),
    ...repeat("clous-de-recuperation", 2),
    // Les corps. La liste n'en avait que 12 pour 9 Équipements — des
    // Équipements sans porteur ne font rien.
    ...repeat("marin-des-jetees", 3),
    ...repeat("contremaitre-des-amarres", 3),
    ...repeat("crabe-de-fer", 2),
    ...repeat("plongeur-des-epaves", 2),
    ...repeat("mecanicien-aux-mains-noires", 2),
    // Deux Équipements seulement, et ceux qui paient en partant.
    ...repeat("treuil-rouille", 2),
    ...repeat("plaque-de-fortune", 3),
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
 * Rapiécer la Coque — la liste de laboratoire du Lot 12, côté endurance.
 *
 * Le Lot 12 comptait 40 cartes et AUCUNE liste ne l'ouvrait : l'audit du
 * 18/09/2026 a trouvé 72 cartes du catalogue (39 %) qui n'étaient jouées par
 * aucun deck de test, dont ce lot en entier. Un lot qu'on ne joue pas n'est
 * pas équilibré, il est seulement écrit.
 *
 * Le deck tient sur ce que le lot fait de mieux : rendre de l'Ancrage, et
 * s'en rendre à chaque fois qu'une Structure meurt. Il a donc des Structures
 * à sacrifier, de quoi les rendre payantes (Charpentière, Charpentier,
 * Atelier), et — enfin — de la Garde, la ressource la plus rare du catalogue.
 */
export const DECK_RAPIECER_LA_COQUE: DeckList = {
  id: "rapiecer-la-coque",
  name: "Rapiécer la Coque",
  shipId: "le-brise-lames",
  description:
    "Endurance : encaisse, se rapièce à chaque Structure perdue, et tient la ligne derrière de la Garde le temps que l'adversaire s'épuise.",
  cardIds: [
    // La ligne de front — les seuls porteurs de Garde du lot.
    ...repeat("mouette-du-brise-lames", 3),
    ...repeat("cormoran-de-fer", 3),
    ...repeat("cormoran-de-fer-abyssal", 1),
    ...repeat("harnois-de-vigie", 2),
    // Ce qui transforme une Structure perdue en Ancrage regagné.
    ...repeat("charpentiere-de-veille", 2),
    ...repeat("charpentier-des-epaves", 3),
    ...repeat("atelier-de-calfatage", 2),
    ...repeat("etau-du-calfat", 2),
    // Les Structures à sacrifier, et celles qui paient en partant.
    ...repeat("caisse-des-dernieres-planches", 3),
    ...repeat("caisse-des-dernieres-planches-abyssal", 1),
    ...repeat("infirmerie-de-pont", 2),
    ...repeat("barge-de-reparation", 2),
    // Le rapiéçage direct, et la Raison quand elle manque.
    ...repeat("chirurgien-de-coque", 3),
    ...repeat("pansements-de-coque", 3),
    ...repeat("caisse-de-pieces-seches", 2),
    ...repeat("derniere-planche", 2),
    ...repeat("capitaine-du-dernier-retour", 2),
    ...repeat("arlequin-raccommodeur", 2),
  ],
};

/**
 * Vol de Ponton — la liste de laboratoire du Lot 12, côté tempo.
 *
 * Le sous-type Volatile (7 Créatures, toutes du Lot 12) n'a ni Structure ni
 * Équipement à son nom, contrairement à Cra-Poiscail et Marionnette : ce
 * n'est pas encore un archétype, c'est une famille de corps rapides. Le deck
 * les prend pour ce qu'ils sont — du Pied marin qui frappe dès l'arrivée —
 * et les accompagne du filtrage de main du lot, qui sert exactement ça :
 * transformer une pioche morte en la carte qui manque.
 *
 * Confié au Courlis parce que c'est le Navire qui en a le plus besoin :
 * l'audit le donne à 31 % de victoires sur ses trois listes, la plus basse
 * du roster, et ses 4 Slots récompensent des corps bon marché.
 */
export const DECK_VOL_DE_PONTON: DeckList = {
  id: "vol-de-ponton",
  name: "Vol de Ponton",
  shipId: "le-courlis",
  description:
    "Tempo : des corps qui frappent dès leur arrivée, et assez de filtrage pour que la main ne soit jamais à court de menace.",
  cardIds: [
    // Les Volatiles — Pied marin partout, coût 1 à 4.
    ...repeat("sterne-des-embruns", 3),
    ...repeat("goeland-chapardeur", 3),
    ...repeat("pelican-des-cales", 3),
    ...repeat("cormoran-de-fer", 2),
    ...repeat("cormoran-de-fer-abyssal", 1),
    ...repeat("albatros-de-mauvais-temps", 2),
    ...repeat("mouette-du-brise-lames", 2),
    // Filtrage : le lot en fait sa mécanique centrale.
    ...repeat("mousse-des-quarts", 3),
    ...repeat("gabier-au-carnet-mouille", 3),
    ...repeat("quartier-maitre-des-vivres", 2),
    ...repeat("bibliotheque-salee", 2),
    ...repeat("journal-de-bord-detrempe", 2),
    ...repeat("rations-du-matin-gris", 2),
    ...repeat("lettre-jamais-ouverte", 3),
    // Ce qui fait monter une petite bête, et ce qui la garde en vie.
    ...repeat("longue-vue-rayee", 3),
    ...repeat("harnois-de-vigie", 2),
    ...repeat("sonde-des-courants-perdus", 2),
  ],
};

/**
 * Le Goliath — cinquième Navire (18/09/2026), et le premier dont la
 * capacité est réellement câblée : sans liste jouable, son Canon de proue
 * ne pouvait pas être essayé du tout, exactement le problème qu'avait
 * "Pénitence" pour La Religieuse.
 *
 * Le deck est construit autour de ce que le Canon demande vraiment : de la
 * Raison, tous les tours, puisque 2 en partent avant même qu'un tir soit
 * décidé. D'où les petites récupérations et le Vieux Loup de Mer, qui allège
 * chaque perte. Le reste est de l'achèvement : des corps bon marché pour
 * tenir la ligne et des attaquants qui frappent fort les Structures, le
 * Canon se chargeant de finir ce qui survit d'un point ou deux.
 *
 * Liste de laboratoire, pas une proposition d'équilibrage : les valeurs du
 * Canon (2 Raison, 2 dégâts) sont elles-mêmes marquées "à confirmer par
 * playtest" sur la fiche Notion.
 */
export const DECK_BORDEE: DeckList = {
  id: "bordee",
  name: "Bordée",
  shipId: "le-goliath",
  description:
    "Artillerie : garde la Raison haute pour armer le Canon chaque tour, tient la ligne avec des corps bon marché, et achève au canon ce qui a survécu.",
  cardIds: [
    ...repeat("mousse-du-premier-quart", 3),
    ...repeat("marin-des-jetees", 3),
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("guetteur-de-brume", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("barracuda-des-hauts-fonds", 3),
    ...repeat("poisson-scie-gris", 3),
    ...repeat("filet-a-la-derive", 3),
    ...repeat("caisses-arrimees", 3),
    ...repeat("thermos-du-dernier-quart", 3),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("capitaine-sans-sommeil", 2),
    ...repeat("gardien-du-sondeur", 2),
    ...repeat("treuil-rouille", 2),
    ...repeat("corde-de-remorquage", 2),
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
 * Liste de LABORATOIRE du Lot 11 — les Marionnettes du Théâtre Englouti,
 * demandée le 2026-09-16 pour tester la troupe en partie : renvoyer une
 * Marionnette en main pour rejouer son arrivée, la scène qui les rappelle,
 * et les deux figures Abyssales en fond de troupe. Quelques cartes hors
 * lot complètent les 40 : de quoi piocher et protéger une pièce maîtresse.
 */
export const DECK_LES_MASQUES_NOYES: DeckList = {
  id: "les-masques-noyes",
  name: "Les Masques Noyés",
  shipId: "le-courlis",
  description:
    "Marionnettes du Théâtre Englouti : des arrivées en jeu qu'on rejoue en renvoyant la troupe en main, une scène qui la rappelle, et deux figures Abyssales en fond de salle.",
  cardIds: [
    ...repeat("pulcinella-gonfle", 3),
    ...repeat("arlecchino-des-profondeurs", 3),
    ...repeat("pantalone-sans-sou", 3),
    ...repeat("colombina-aux-cent-visages", 2),
    ...repeat("il-capitano-naufrage", 2),
    ...repeat("il-dottore-des-noyes", 2),
    ...repeat("le-regisseur-sans-visage", 1),
    ...repeat("le-masque-fendu", 3),
    ...repeat("la-clochette-du-rappel", 3),
    ...repeat("changement-de-role", 3),
    ...repeat("rappel-du-public", 3),
    ...repeat("les-coulisses-inondees", 3),
    ...repeat("le-theatre-englouti", 1),
    ...repeat("le-rideau-se-leve", 1),
    ...repeat("arlecchino-celui-derriere-le-masque-abyssal", 1),
    ...repeat("le-regisseur-des-profondeurs-abyssal", 1),
    // Renforts Marionnette du Lot 12 (18/09/2026). La liste rejouait des
    // arrivées sans jamais rien tirer du RETOUR en main lui-même, et
    // perdait 75 % de ses parties : ces trois-là paient le geste, au lieu
    // de le subir.
    ...repeat("la-prima-noyee", 2),
    ...repeat("la-prima-noyee-abyssal", 1),
    ...repeat("trappe-du-souffleur", 2),
  ],
};

/**
 * La Veillée des Disparus — la liste de laboratoire du Lot 13.
 *
 * Confiée à LA RELIGIEUSE, et pas seulement par thème. Deux raisons :
 *
 *  - son passif (Pénitence, la Déraison coûte 1 Ancrage de moins) est le
 *    seul filet d'un plan qui consiste à se vider la main et à perdre ses
 *    propres unités. « Promis, j'attends » ne paie d'ailleurs qu'en
 *    Déraison, où la recharge de Raison n'est que partielle ;
 *  - l'audit du 18/09/2026 lui reprochait de n'avoir QU'UNE liste
 *    (Pénitence) : un Navire mesuré sur un seul deck est mesuré sur son
 *    deck, pas sur lui-même.
 *
 * Les DIX-HUIT cartes du lot y sont, au moins en un exemplaire. C'est la
 * règle que l'audit a posée : une carte que personne ne joue n'est pas
 * équilibrée, elle est seulement écrite — et un lot tout neuf est
 * exactement là où le trou se creuse.
 *
 * 26 Un Dead sur 40, la fourchette que demande la page du lot (« environ
 * 22 à 26 »). Le reste est générique à dessein : le deck ne doit pas exiger
 * 40 cartes de famille pour tourner.
 */
export const DECK_LA_VEILLEE_DES_DISPARUS: DeckList = {
  id: "la-veillee-des-disparus",
  name: "La Veillée des Disparus",
  shipId: "la-religieuse",
  description:
    "Attrition : se défausser volontairement, repêcher au Cimetière, et convertir chaque perte en pression sur le Navire adverse.",
  cardIds: [
    // Le carburant : des corps à 1 qu'on est content de défausser, et qui
    // paient en partant.
    ...repeat("ptit-bout", 3),
    ...repeat("cache-cache", 2),
    ...repeat("doudou", 1),
    // Ce qui tient la ligne pendant que le moteur tourne.
    ...repeat("encore-cinq-minutes", 2),
    ...repeat("promis-jattends", 2),
    ...repeat("papa-est-en-mer", 1),
    // Les exutoires de défausse : sans eux, la moitié du lot ne se
    // déclenche jamais.
    ...repeat("le-gouter", 2),
    ...repeat("on-rentre-bientot", 1),
    ...repeat("tout-le-monde-a-table", 1),
    // La récursion, filtrée par coût comme le cadrage l'exige.
    // Un seul exemplaire : la récursion est déjà tenue par Bonne nuit,
    // Tu m'avais promis, Tu viens jouer ? et les deux Grappins.
    ...repeat("la-petite-chanson", 1),
    ...repeat("bonne-nuit", 1),
    ...repeat("tu-mavais-promis", 1),
    ...repeat("tu-viens-jouer", 1),
    // Ce qui transforme le moteur en dégâts.
    ...repeat("maman-revient", 2),
    ...repeat("maman-revient-abyssal", 1),
    ...repeat("la-marelle", 2),
    ...repeat("le-copain-du-dessous", 1),
    ...repeat("on-avait-dit-tous-ensemble", 1),
    // --- Compléments génériques ---
    // D'autres façons de vider sa main, que le lot n'a pas assez.
    ...repeat("mousse-des-quarts", 2),
    ...repeat("gabier-au-carnet-mouille", 2),
    ...repeat("epave-a-fleur-deau", 2),
    // Repêcher autre chose qu'une unité — et réveiller Maman revient au
    // passage, qui compte TOUTE récupération.
    ...repeat("grappin-de-recuperation", 2),
    // La Raison, que la famille dépense sans jamais en rendre beaucoup.
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("marin-des-jetees", 2),
    ...repeat("crabe-de-fer", 2),
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
  DECK_BORDEE,
  DECK_RAPIECER_LA_COQUE,
  DECK_VOL_DE_PONTON,
];

/**
 * Listes de LABORATOIRE du Lot 10 — mono-archétype, faites pour que les
 * synergies Cra-Poiscail se déclenchent vraiment en partie. Groupées à
 * part dans le sélecteur : ce ne sont pas des propositions d'équilibrage
 * au même titre que les archétypes ci-dessus.
 */
export const CRA_POISCAIL_TEST_DECKS: readonly DeckList[] = [DECK_LE_GRAND_BANC, DECK_LA_COUR_DU_GRAND_ETANG];

/** Liste de laboratoire du Lot 11 (Théâtre Englouti), même statut que celles du Lot 10. */
export const THEATRE_TEST_DECKS: readonly DeckList[] = [DECK_LES_MASQUES_NOYES];

/** Liste de laboratoire du Lot 13 (Un Dead), même statut que celles des Lots 10 et 11. */
export const UN_DEAD_TEST_DECKS: readonly DeckList[] = [DECK_LA_VEILLEE_DES_DISPARUS];

/**
 * TOUTES les listes qu'une partie peut utiliser — base système, archétypes
 * et laboratoires (Cra-Poiscail, Théâtre). Source unique pour "ce deck
 * est-il jouable ?" (`findPlayableDeck`, côté serveur) : ajouter une liste
 * à l'une de ces collections suffit, il n'y a pas de second endroit à
 * penser à mettre à jour, donc pas de deck proposé à l'écran que le serveur
 * refuserait ensuite.
 */
export const PLAYABLE_DECKS: readonly DeckList[] = [
  ...PRECONSTRUCTED_DECKS,
  ...ARCHETYPE_DECKS,
  ...CRA_POISCAIL_TEST_DECKS,
  ...THEATRE_TEST_DECKS,
  ...UN_DEAD_TEST_DECKS,
];
