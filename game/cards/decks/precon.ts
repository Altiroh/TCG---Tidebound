import { repeat, type DeckList } from "@/game/cards/decks/types";

/**
 * PRÉCONSTRUITS — déblocables en dépensant un Jeton de Préconstruit, gagné
 * aux gros paliers de niveau (Notion « Progression joueur » §4). « Le jeton
 * n'impose aucun deck précis » : le joueur lit tout le rayon avant de
 * choisir, préconstruits verrouillés compris.
 *
 * Source de vérité : Notion « Bibliothèque de decks — v4 · Compétitif
 * depuis zéro » (19/09/2026), même reset que pour les emprunts
 * (`borrowed.ts`).
 *
 * Ce que la v4 demande à un préconstruit : « Decks complets et optimisés.
 * Ils peuvent être très spécialisés, hybrides ou employer plusieurs
 * familles si c'est la meilleure façon d'exécuter le plan de jeu. » C'est
 * ce qui donne sa valeur au Jeton : un emprunt joue droit, un préconstruit
 * joue un plan.
 *
 * Un préconstruit est attaché au MÊME Navire que l'emprunt de son rayon,
 * de sorte que chaque Navire ait deux plans réellement distincts.
 */

/**
 * Dernier Rappel — Le Courlis. Le plan spécialisé du Courlis, là où « Bec
 * dans la Brume » joue droit.
 *
 * Condition de victoire : convertir les retours en main en nouveaux effets
 * d'arrivée, réduction de coût et avantage de cartes, puis prendre le
 * tempo avec des unités rejouées plusieurs fois. Les 4 Slots du Courlis
 * cessent d'être une limite quand la même unité vaut trois arrivées.
 */
export const DECK_DERNIER_RAPPEL: DeckList = {
  id: "dernier-rappel",
  name: "Dernier Rappel",
  shipId: "le-courlis",
  description:
    "Tempo : renvoie sa propre troupe en main pour rejouer ses arrivées, et fait payer chaque rappel plutôt que de le subir.",
  cardIds: [
    // La troupe — des arrivées qu'on veut voir plusieurs fois.
    ...repeat("pulcinella-gonfle", 3),
    ...repeat("arlecchino-des-profondeurs", 3),
    ...repeat("pantalone-sans-sou", 3),
    ...repeat("la-prima-noyee", 3),
    ...repeat("colombina-aux-cent-visages", 2),
    ...repeat("il-capitano-naufrage", 2),
    ...repeat("il-dottore-des-noyes", 2),
    ...repeat("le-regisseur-sans-visage", 1),
    // Les figures de fond de salle.
    ...repeat("arlecchino-celui-derriere-le-masque-abyssal", 1),
    ...repeat("le-regisseur-des-profondeurs-abyssal", 1),
    ...repeat("la-prima-noyee-abyssal", 1),
    // Le geste central : renvoyer en main, et le rendre payant.
    ...repeat("le-masque-fendu", 3),
    ...repeat("la-clochette-du-rappel", 2),
    ...repeat("changement-de-role", 2),
    ...repeat("rappel-du-public", 2),
    ...repeat("les-coulisses-inondees", 2),
    ...repeat("trappe-du-souffleur", 2),
    ...repeat("le-theatre-englouti", 1),
    ...repeat("le-rideau-se-leve", 1),
    // La Raison, que rejouer une arrivée dépense vite.
    ...repeat("thermos-du-dernier-quart", 3),
  ],
};

/**
 * Sous la Ligne — L'Errant. Le plan spécialisé de l'Errant, là où « Cap de
 * Fer » joue la qualité de cartes.
 *
 * Condition de victoire : transformer une Raison basse et les états
 * dangereux de Marée en avantage ASYMÉTRIQUE — les Abyssales coûtent plus
 * cher mais frappent plus fort, et seul ce deck est préparé à les payer —
 * puis conclure avec des menaces que l'adversaire ne peut pas rentabiliser
 * aussi tôt.
 */
export const DECK_SOUS_LA_LIGNE: DeckList = {
  id: "sous-la-ligne",
  name: "Sous la Ligne",
  shipId: "lerrant",
  description:
    "Contrôle par la mer : pousse la Marée vers les Abysses, assume la Déraison, et conclut avec des menaces que personne d'autre ne peut payer si tôt.",
  cardIds: [
    // Les corps qui encaissent la descente.
    ...repeat("poisson-lanterne", 3),
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("anguille-des-profondeurs", 3),
    ...repeat("raie-des-fosses", 2),
    ...repeat("bat-marin", 2),
    ...repeat("second-au-visage-pale", 2),
    ...repeat("veilleur-des-profondeurs", 2),
    ...repeat("la-chose-qui-remonte", 2),
    ...repeat("lhomme-revenu-de-la-fosse", 1),
    // Les versions Abyssales — le rendement du plan, pas sa décoration.
    ...repeat("marin-aux-yeux-rouges-abyssal", 1),
    ...repeat("bat-marin-abyssal", 1),
    ...repeat("revenante-de-la-fosse-abyssal", 1),
    ...repeat("ce-qui-suit-le-navire", 1),
    ...repeat("ce-qui-suit-le-navire-abyssal", 1),
    // Le moteur de Marée : forcer l'état, le tenir, l'orienter.
    ...repeat("balise-des-profondeurs", 2),
    ...repeat("compas-aux-aiguilles-noires", 2),
    ...repeat("ancre-de-tempete", 2),
    ...repeat("sondeur-des-mauvaises-eaux", 2),
    ...repeat("lanterne-aux-verres-noirs", 2),
    // Payer le voyage, et piocher davantage une fois en bas.
    ...repeat("lettre-jamais-ouverte", 3),
    ...repeat("thermos-du-dernier-quart", 2),
  ],
};

/**
 * Tout Récupérer — Le Brise-Lames. Le plan spécialisé du Brise-Lames, là
 * où « Le Banc Déborde » sature simplement les Slots.
 *
 * Condition de victoire : faire payer DEUX FOIS chaque permanent — une
 * première fois quand il produit sa valeur sur le plateau, une seconde
 * quand il est détruit ou Sabordé.
 *
 * DEUX ÉCARTS ASSUMÉS avec la liste Notion, tous deux imposés par le
 * catalogue (`EXCEPTIONS` du même ordre que celles de la conformité de
 * cartes) :
 *
 *   - la page demande 3× Charpentière de Veille ; la carte est limitée à
 *     2 exemplaires (`maxCopies: 2`). Le 3e est rendu en Étau du Calfat
 *     (2 → 3), qui fait exactement le même travail sous forme
 *     d'Équipement : « Quand la Structure équipée est Sabordée, récupérez
 *     1 Ancrage » ;
 *   - la page demande 3× « Récupérer ce qui flotte », une carte qui
 *     n'existe dans AUCUN catalogue — elle traîne dans les listes Notion
 *     depuis la v2 sans jamais avoir été écrite. Rendus en 3× Grappin de
 *     Récupération, l'Objet qui repêche une Structure ou un Équipement
 *     coûtant 2 ou moins : les six permanents bon marché du deck sont
 *     précisément dans cette fourchette.
 *
 * À reprendre si « Récupérer ce qui flotte » est un jour écrite.
 */
export const DECK_TOUT_RECUPERER: DeckList = {
  id: "tout-recuperer",
  name: "Tout Récupérer",
  shipId: "le-brise-lames",
  description:
    "Recyclage : chaque permanent paie deux fois — une fois sur le plateau, une fois en partant — et revient du Cimetière pour recommencer.",
  cardIds: [
    // Ce qui transforme une Structure perdue en Ancrage regagné.
    ...repeat("charpentier-des-epaves", 3),
    ...repeat("charpentiere-de-veille", 2),
    ...repeat("etau-du-calfat", 3),
    ...repeat("atelier-de-calfatage", 2),
    // Les Structures qu'on pose POUR les perdre.
    ...repeat("caisses-arrimees", 3),
    ...repeat("epave-a-fleur-deau", 3),
    ...repeat("caisse-des-dernieres-planches", 3),
    ...repeat("epave-engloutie", 2),
    // Le repêchage, qui fait la deuxième moitié du plan.
    ...repeat("clous-de-recuperation", 3),
    ...repeat("grappin-de-recuperation", 3),
    // Les corps, et de quoi les rendre rentables.
    ...repeat("plongeur-des-epaves", 2),
    ...repeat("mecanicien-aux-mains-noires", 2),
    ...repeat("contremaitre-des-amarres", 1),
    ...repeat("crabe-de-fer", 1),
    ...repeat("plaque-de-fortune", 2),
    ...repeat("treuil-rouille", 2),
    ...repeat("kit-de-calfatage", 2),
    ...repeat("thermos-du-dernier-quart", 1),
  ],
};

/**
 * Les Petits Attendent — La Religieuse. Le plan spécialisé de La
 * Religieuse, là où « Grâce sous pression » tient simplement la ligne.
 *
 * Condition de victoire : rendre les échanges impossibles à gagner pour
 * l'adversaire. Défausser, perdre ou récupérer une unité doit presque
 * toujours produire une SECONDE valeur ; ensuite, Maman revient, La
 * Marelle et les morts directes grignotent le Navire adverse.
 *
 * Confié à La Religieuse pour son passif : quand le plan consiste à se
 * vider la main et à perdre ses propres unités, « Pénitence » est le seul
 * filet — et « Promis, j'attends » ne paie qu'en Déraison.
 */
export const DECK_LES_PETITS_ATTENDENT: DeckList = {
  id: "les-petits-attendent",
  name: "Les Petits Attendent",
  shipId: "la-religieuse",
  description:
    "Attrition : se défausser volontairement, repêcher au Cimetière, et convertir chaque perte en pression sur le Navire adverse.",
  cardIds: [
    // Le carburant : des corps à 1 qu'on est content de défausser.
    ...repeat("ptit-bout", 3),
    ...repeat("cache-cache", 3),
    ...repeat("doudou", 3),
    // Les exutoires de défausse : sans eux, la moitié du plan dort.
    ...repeat("le-gouter", 3),
    ...repeat("on-rentre-bientot", 3),
    ...repeat("tout-le-monde-a-table", 1),
    // Ce qui tient la ligne pendant que le moteur tourne.
    ...repeat("papa-est-en-mer", 3),
    ...repeat("promis-jattends", 3),
    ...repeat("le-copain-du-dessous", 3),
    // La récursion — la seconde valeur de chaque perte.
    ...repeat("tu-mavais-promis", 2),
    ...repeat("bonne-nuit", 2),
    ...repeat("tu-viens-jouer", 2),
    ...repeat("grappin-de-recuperation", 1),
    // Ce qui transforme le moteur en dégâts.
    ...repeat("maman-revient", 2),
    ...repeat("maman-revient-abyssal", 1),
    ...repeat("la-marelle", 2),
    ...repeat("on-avait-dit-tous-ensemble", 1),
    // De quoi ne jamais être à court.
    ...repeat("lettre-jamais-ouverte", 2),
  ],
};

/**
 * Grenouilles au Canon — Le Goliath. Le plan spécialisé du Goliath, là où
 * « À Portée » joue une courbe neutre.
 *
 * Condition de victoire : utiliser les 5 Slots pour installer une masse
 * critique de petits corps, pendant que le Canon retire les bloqueurs ou
 * achève les permanents qui survivraient normalement au swarm. L'hybride
 * est assumé : ce n'est pas un deck de famille, c'est un swarm qui a
 * trouvé sa portée.
 */
export const DECK_GRENOUILLES_AU_CANON: DeckList = {
  id: "grenouilles-au-canon",
  name: "Grenouilles au Canon",
  shipId: "le-goliath",
  description:
    "Swarm et artillerie : installe une masse de petits corps, pendant que le Canon retire les bloqueurs qui auraient tenu la ligne.",
  cardIds: [
    ...repeat("tetard-fesse", 3),
    ...repeat("ptite-fesse", 3),
    ...repeat("cra-poiscail-messager", 3),
    ...repeat("cra-poiscail-sauteur", 3),
    ...repeat("banc-de-cra-poiscail", 3),
    ...repeat("cra-poiscail-grand-gueule", 2),
    ...repeat("cra-poiscail-bavard", 2),
    ...repeat("cra-poiscail-chef-de-banc", 2),
    ...repeat("cra-poiscail-medecin", 2),
    ...repeat("cra-poiscail-porte-etendard", 2),
    // Ce qui renforce le banc.
    ...repeat("le-seau", 2),
    ...repeat("la-flaque-sacree", 2),
    ...repeat("fesses-en-avant", 2),
    // La Raison, que le Canon prélève tous les tours.
    ...repeat("thermos-du-dernier-quart", 3),
    ...repeat("rations-du-matin-gris", 2),
    ...repeat("lettre-jamais-ouverte", 2),
    ...repeat("bouee-de-derive", 2),
  ],
};

/**
 * Les cinq préconstruits, un par Navire — l'ordre est celui de la page v4,
 * donc celui du rayon à l'écran.
 */
/**
 * La Ligne Tenue — Le Brise-Lames. Le premier deck DÉFENSIF du format
 * (21/09/2026), né de la première vague de Structures-pièges.
 *
 * Condition de victoire : ne pas perdre. Chaque attaque adverse coûte plus
 * cher qu'elle ne rapporte — réduite, amputée de sa Puissance, ou renvoyée —
 * jusqu'à ce que l'adversaire n'ait plus de quoi passer.
 *
 * Confié au Brise-Lames pour ses 6 Slots : poser des pièges demande de la
 * place, et il faut pouvoir en tenir plusieurs masqués en même temps pour
 * que l'adversaire ne sache jamais lequel il vient de déclencher.
 *
 * Mesuré au banc d'essai avant d'entrer au catalogue : il tient le swarm à
 * 60 / 40 là où celui-ci écrasait le champ à 87 %, ramène l'aggro Courlis à
 * l'équilibre exact, et bat l'ancien deck Structures 73 / 27.
 */
export const DECK_LA_LIGNE_TENUE: DeckList = {
  id: "la-ligne-tenue",
  name: "La Ligne Tenue",
  shipId: "le-brise-lames",
  description:
    "Défense active : chaque attaque adverse est réduite, amputée ou renvoyée, et l'adversaire ne sait jamais quel piège il vient de déclencher.",
  cardIds: [
    // Les pièges — le cœur du plan, moitié visibles, moitié cachés.
    ...repeat("cylindre-flottant", 2),
    ...repeat("cage-de-flottaison", 2),
    ...repeat("filet-a-la-derive", 3),
    ...repeat("le-filet-qui-respire", 3),
    ...repeat("caisses-arrimees", 3),
    ...repeat("ancre-de-derive", 2),
    // La réponse au nombre, ajoutée le 21/09/2026 : contre un banc large,
    // la Nasse mord et le Rôle prélève ; contre trois corps, ni l'une ni
    // l'autre ne fait quoi que ce soit.
    ...repeat("la-nasse-trop-pleine", 2),
    ...repeat("le-role-dequipage", 2),
    // Les défenses qui ne se cachent pas.
    ...repeat("carcasse-renversee", 2),
    ...repeat("brise-vague-de-fortune", 3),
    ...repeat("barge-de-reparation", 2),
    // Les corps qui tiennent la ligne le temps que les pièges mordent.
    ...repeat("crabe-de-fer", 3),
    ...repeat("murene-aveugle", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("marin-des-jetees", 3),
    // De quoi durer.
    ...repeat("plongeur-des-epaves", 2),
    ...repeat("thermos-du-dernier-quart", 2),
    ...repeat("bibliotheque-salee", 2),
  ],
};

export const PRECON_DECK_LISTS: readonly DeckList[] = [
  DECK_DERNIER_RAPPEL,
  DECK_SOUS_LA_LIGNE,
  DECK_TOUT_RECUPERER,
  DECK_LES_PETITS_ATTENDENT,
  DECK_GRENOUILLES_AU_CANON,
  DECK_LA_LIGNE_TENUE,
];
