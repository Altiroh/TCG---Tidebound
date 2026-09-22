import { repeat, type DeckList } from "@/game/cards/decks/types";

/**
 * DECKS PRÉCONSTRUITS — les listes fournies par le jeu.
 *
 * Source de vérité : Notion « Decks d'emprunt — refonte depuis zéro ·
 * 12 archétypes » (22/09/2026), et la fusion des deux rayons décidée le
 * même jour.
 *
 * UN SEUL RAYON DEPUIS LE 22/09/2026. Le jeu distinguait jusque-là des
 * « decks d'emprunt » et des « préconstruits ». La distinction ne portait
 * sur rien : dans les deux cas les cartes restaient PRÊTÉES, dans les deux
 * cas la liste était fournie par le jeu, et seule la PORTE d'entrée
 * différait — ce qui reste vrai et n'a jamais eu besoin de deux familles
 * de decks pour être dit :
 *
 *   - le PREMIER préconstruit est gratuit, choisi une fois depuis la
 *     Collection à la sortie du tutoriel (Notion « Progression joueur »
 *     §3) ;
 *   - les SUIVANTS coûtent un Jeton de Préconstruit, gagné aux gros
 *     paliers de niveau (§4). « Le jeton n'impose aucun deck précis. »
 *
 * C'est donc la manière de l'obtenir qui se note en base (`source`), pas
 * une nature du deck. Et dans tous les cas : « le premier deck ne doit pas
 * injecter un gros volume de cartes gratuites dans la collection » — rien
 * n'est crédité, les boosters remplacent peu à peu le prêt par de la
 * possession réelle.
 *
 * LES SIX ANCIENNES LISTES SONT RETIRÉES. L'audit de recouvrement les
 * donnait toutes en doublon d'un des douze axes — Les Petits Attendent à
 * 80 % de La Veillée, Dernier Rappel à 80 % du Théâtre Englouti,
 * Grenouilles au Canon à 65 % du Grand Banc, Tout Récupérer à 53 %
 * d'Épavistes, La Ligne Tenue coincée entre Mineurs de Fond (30 %) et La
 * Forteresse (27 %) — et aucune ne jouait la moindre carte du Lot 14.
 * Leurs en-têtes citaient encore « Cap de Fer » et « Le Banc Déborde »,
 * des listes v4 supprimées depuis. La seule chose qu'elles avaient
 * d'unique, le paquet Abyssal de Sous la Ligne, est reprise dans Descente
 * aux Abysses.
 *
 * Ce que la refonte demande : la bibliothèque se range par MÉCANIQUE et
 * non par Navire. Elle doit « couvrir les grandes mécaniques actuelles
 * sans proposer plusieurs variantes déguisées du même plan agressif », et
 * permettre de « passer d'un deck à l'autre avec une expérience réellement
 * différente » :
 *
 *   Swarm → Formation → Cimetière → Bounce → Pièges → Forteresse →
 *   Marée → Sabordage → Raison → Objets → Midrange → Contrôle.
 *
 * D'où douze listes, et plusieurs par Navire : c'est la mécanique qui
 * choisit la coque, pas l'inverse.
 *
 * Deux règles de la page valent d'être répétées ici, parce qu'elles se
 * perdent vite en construisant :
 *
 *  - « rester des decks capables de gagner, pas des listes pédagogiques
 *    volontairement faibles » ;
 *  - « ne pas utiliser les dix pièges comme package générique dans tous
 *    les decks — leur intérêt vient justement de leur spécialisation ».
 *    La répartition des pièges suit donc le tableau de la page, et un deck
 *    qui n'a rien à en faire n'en joue aucun.
 */
/**
 * 1 — Le Grand Banc. Cra-Poiscail, swarm agressif.
 *
 * Le Brise-Lames et ses SIX emplacements : c'est la seule coque qui laisse
 * la place d'aller au bout du plan. Sa Raison basse (8) ne gêne pas un
 * deck dont rien ne dépasse 3.
 *
 * Aucun piège, et c'est voulu — la page le dit en toutes lettres : « éviter
 * de remplir ce deck de pièges. Son identité doit rester remplir →
 * renforcer → frapper. » Les deux seules cartes du Lot 14 sont de la
 * stabilité, pas du contrôle.
 */
export const DECK_LE_GRAND_BANC: DeckList = {
  id: "le-grand-banc",
  name: "Le Grand Banc",
  shipId: "le-brise-lames",
  description:
    "Swarm : remplir le plateau de petits corps, les renforcer tous d'un coup, et frapper avant que l'adversaire ne réponde.",
  cardIds: [
    // Le banc : tout ce qui coûte 1 ou 2 et se pose sans condition.
    ...repeat("tetard-fesse", 3),
    ...repeat("ptite-fesse", 3),
    ...repeat("cra-poiscail-sauteur", 3),
    ...repeat("cra-poiscail-grand-gueule", 3),
    ...repeat("cra-poiscail-bavard", 3),
    ...repeat("cra-poiscail-ramasseur", 3),
    // Ce qui récompense le nombre.
    ...repeat("banc-de-cra-poiscail", 3),
    ...repeat("cra-poiscail-chef-de-banc", 3),
    ...repeat("cra-poiscail-porte-etendard", 2),
    ...repeat("le-trone-de-bouchon", 2),
    ...repeat("la-flaque-sacree", 3),
    ...repeat("le-tas-de-trucs", 2),
    // Des corps de plus sans passer par la Raison, et le coup de grâce.
    ...repeat("le-seau", 3),
    ...repeat("fesses-en-avant", 2),
    // Lot 14 : de la stabilité, rien d'autre.
    ...repeat("faire-linventaire", 2),
  ],
};

/**
 * 2 — Chevaliers du Grand Étang. Cra-Poiscail, midrange de formation.
 *
 * Moins de corps que Le Grand Banc, mais des pièces qui comptent — et donc
 * quelque chose à protéger. C'est exactement ce que demande le piège
 * signature de la page : Filet de Sauvetage donne +2 Résistance à toute la
 * formation tant qu'il est visible, et sauve la pièce maîtresse une fois
 * quand il ne l'est pas.
 */
export const DECK_CHEVALIERS_DU_GRAND_ETANG: DeckList = {
  id: "chevaliers-du-grand-etang",
  name: "Chevaliers du Grand Étang",
  shipId: "lerrant",
  description:
    "Midrange : assembler une formation où chaque pièce renforce les autres, et la protéger plutôt que de la remplacer.",
  cardIds: [
    // La formation, dans l'ordre où elle se monte.
    ...repeat("ecuyer-cra-poiscail", 3),
    ...repeat("destrier-du-grand-etang", 3),
    ...repeat("chevalier-cra-poiscail", 2),
    ...repeat("bourreau-cra-poiscail", 3),
    ...repeat("cra-poiscail-porte-etendard", 2),
    ...repeat("roi-cra-poiscail", 1),
    // Le soutien : soigner et relancer, pas ajouter des corps.
    ...repeat("cra-poiscail-medecin", 3),
    ...repeat("cra-poiscail-messager", 3),
    ...repeat("ptite-fesse-grand-reve", 2),
    // Ce qui transforme une formation en menace.
    ...repeat("fourchette-du-grand-etang", 3),
    ...repeat("banniere-en-vieille-chaussette", 2),
    ...repeat("slip-de-guerre-cra-poiscail", 2),
    ...repeat("la-quete-du-grand-nenuphar", 2),
    ...repeat("le-tournoi-du-grand-etang", 2),
    ...repeat("le-grand-saut", 1),
    // Lot 14 : le piège signature, et de quoi ne pas rester sans pièce.
    ...repeat("filet-de-sauvetage", 2),
    ...repeat("faire-linventaire", 2),
    ...repeat("dernieres-reserves", 2),
  ],
};

/**
 * 3 — La Veillée. Un Dead, Cimetière, attrition.
 *
 * La Religieuse : Pénitence rend la dette moins chère, et ce deck en prend
 * beaucoup — il joue à découvert pour tenir la cadence.
 *
 * Le Naufragé Impossible (Lot 14) y est un vrai finisher de famille depuis
 * qu'il porte le sous-type. Pas de Filet de Sauvetage : la page prévient
 * que « certaines unités veulent mourir », et ce deck en compte trop pour
 * qu'un anti-destruction ne se retourne pas contre lui.
 */
export const DECK_LA_VEILLEE: DeckList = {
  id: "la-veillee",
  name: "La Veillée",
  shipId: "la-religieuse",
  description:
    "Attrition : la main et le Cimetière forment un circuit, et chaque perte revient sous une autre forme.",
  cardIds: [
    // Les petits, qu'on est content de perdre.
    ...repeat("ptit-bout", 3),
    ...repeat("cache-cache", 3),
    ...repeat("encore-cinq-minutes", 3),
    ...repeat("papa-est-en-mer", 3),
    ...repeat("promis-jattends", 3),
    // Ce qui remonte du Cimetière, ou le remplit.
    ...repeat("on-rentre-bientot", 3),
    ...repeat("le-copain-du-dessous", 3),
    ...repeat("maman-revient", 2),
    ...repeat("tu-mavais-promis", 2),
    ...repeat("le-gouter", 3),
    ...repeat("la-petite-chanson", 2),
    ...repeat("bonne-nuit", 2),
    ...repeat("la-marelle", 2),
    // Ce qui ferme la partie.
    ...repeat("tu-viens-jouer", 2),
    ...repeat("on-avait-dit-tous-ensemble", 1),
    ...repeat("le-naufrage-impossible", 1),
    // Lot 14 : de quoi choisir ce qu'on jette, ce qui est tout le deck.
    ...repeat("mauvaise-main", 2),
  ],
};

/**
 * 4 — Le Théâtre Englouti. Marionnettes, retours en main, arrivées
 * rejouées.
 *
 * Le Courlis n'a que QUATRE emplacements — une contrainte qui cesse d'en
 * être une quand la même unité vaut trois arrivées. Ses 12 Raison paient
 * les rappels.
 *
 * Corde de Rappel (Lot 14) est la carte que la page appelle de ses vœux :
 * une Marionnette ciblée par une attaque rentre en main, et son arrivée
 * repart. Chaîne de Travers tient le tempo pendant que le moteur se monte.
 */
export const DECK_LE_THEATRE_ENGLOUTI: DeckList = {
  id: "le-theatre-englouti-deck",
  name: "Le Théâtre Englouti",
  shipId: "le-courlis",
  description:
    "Tempo : les cartes reviennent sans cesse en main pour être rejouées, et chaque retour vaut une arrivée de plus.",
  cardIds: [
    // La troupe — des arrivées qu'on veut voir plusieurs fois.
    ...repeat("pulcinella-gonfle", 3),
    ...repeat("arlecchino-des-profondeurs", 3),
    ...repeat("arlequin-raccommodeur", 3),
    ...repeat("pantalone-sans-sou", 3),
    ...repeat("la-prima-noyee", 3),
    ...repeat("colombina-aux-cent-visages", 2),
    ...repeat("il-dottore-des-noyes", 2),
    ...repeat("il-capitano-naufrage", 2),
    ...repeat("le-regisseur-sans-visage", 1),
    // Les rappels eux-mêmes.
    ...repeat("le-masque-fendu", 3),
    ...repeat("la-clochette-du-rappel", 3),
    ...repeat("changement-de-role", 2),
    ...repeat("rappel-du-public", 2),
    ...repeat("les-coulisses-inondees", 2),
    ...repeat("le-theatre-englouti", 1),
    ...repeat("le-rideau-se-leve", 1),
    // Lot 14 : un rappel de plus, et du temps pour le monter.
    ...repeat("corde-de-rappel", 2),
    ...repeat("chaine-de-travers", 2),
  ],
};

/**
 * 5 — Mineurs de Fond. Pièges, contrôle, bluff.
 *
 * Le deck qui exploite le plus franchement la grammaire des
 * Structures-pièges. Le Brise-Lames n'est pas un hasard : « Tenir la
 * ligne » protège ses Structures de la Marée, exactement ce dont vit un
 * plateau fait de pièges à durée limitée, et ses six emplacements
 * permettent d'en armer plusieurs à la fois.
 *
 * L'adversaire doit se demander en permanence ce qui l'attend sous la
 * Marée. C'est pour ça qu'on trouve ici les pièges de plusieurs familles —
 * anti-swarm, anti-grosse-unité, anti-Objet — plutôt qu'une seule.
 */
export const DECK_MINEURS_DE_FOND: DeckList = {
  id: "mineurs-de-fond",
  name: "Mineurs de Fond",
  shipId: "le-brise-lames",
  description:
    "Pièges : chaque Structure posée peut être n'importe laquelle, et l'adversaire paie son développement sans savoir laquelle.",
  cardIds: [
    // Les cartouches du Lot 14, une de chaque menace.
    ...repeat("la-nasse-trop-pleine", 2),
    ...repeat("jugement-du-phare", 1),
    ...repeat("barils-de-poudre", 2),
    ...repeat("pont-mine", 2),
    ...repeat("chaine-de-travers", 2),
    ...repeat("fausse-cargaison", 2),
    ...repeat("cloison-etanche", 2),
    ...repeat("cale-inondable", 2),
    ...repeat("derniere-barricade", 2),
    // Les pièges historiques, qui rendent le bluff crédible.
    ...repeat("filet-a-la-derive", 3),
    ...repeat("cloche-dalerte", 2),
    ...repeat("ancre-de-derive", 2),
    // Lot 14 : chercher le piège qui manque, et sauver celui qui tombe.
    ...repeat("journal-de-bord", 3),
    ...repeat("planche-de-fortune", 2),
    ...repeat("charge-de-demolition", 2),
    // Assez de corps pour ne pas perdre en attendant.
    ...repeat("guetteur-de-brume", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("matelot-du-sans-nom", 3),
  ],
};

/**
 * 6 — La Forteresse. Défense, Garde, Ancrage.
 *
 * Trente-six points de coque et six emplacements : le Brise-Lames est la
 * carte de ce deck autant que ses cartes.
 *
 * Garde-fou explicite de la page : « le deck ne doit pas devenir une boucle
 * de soin infinie. Son objectif est de retarder suffisamment la partie pour
 * rendre les grosses cartes pertinentes. » D'où UN seul finisher, et un
 * soin plafonné par l'Ancrage de départ du Navire depuis le 22/09.
 */
export const DECK_LA_FORTERESSE: DeckList = {
  id: "la-forteresse",
  name: "La Forteresse",
  shipId: "le-brise-lames",
  description:
    "Défense : encaisser, réparer, et ne laisser passer que le temps — jusqu'à ce qu'une seule grosse menace suffise.",
  cardIds: [
    // Les murs.
    ...repeat("crabe-de-fer", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("mouette-du-brise-lames", 3),
    ...repeat("cormoran-de-fer", 3),
    ...repeat("le-dernier-rempart", 2),
    // Les Structures qui tiennent la coque.
    ...repeat("brise-vague-de-fortune", 3),
    ...repeat("cage-de-flottaison", 2),
    ...repeat("carcasse-renversee", 2),
    ...repeat("barge-de-reparation", 2),
    ...repeat("infirmerie-de-pont", 2),
    // Lot 14 : les trois pièges défensifs de la page, et les réparations.
    ...repeat("derniere-barricade", 2),
    ...repeat("cloison-etanche", 2),
    ...repeat("cale-inondable", 2),
    ...repeat("signal-de-detresse", 2),
    ...repeat("reparations-durgence", 2),
    ...repeat("trousse-du-bord", 2),
    ...repeat("on-flotte-encore", 2),
    // Le seul finisher : il doit être rare pour rester une récompense.
    ...repeat("lamiral-sans-pavillon", 1),
  ],
};

/**
 * 7 — Descente aux Abysses. Contrôle de Marée.
 *
 * L'Errant et « Changer de cap » : une fois par partie, l'orientation
 * s'inverse au moment choisi. Dans un deck qui fabrique lui-même
 * l'environnement, c'est le tour où la descente cesse d'être négociable.
 *
 * Pont Miné plutôt qu'un autre piège : la page le désigne pour « punir une
 * tentative de finish rapide », ce qui est exactement ce qui tue ce deck.
 *
 * LE PAQUET ABYSSAL VIENT DE SOUS LA LIGNE (fusion du 22/09/2026). Ce deck
 * fabriquait la descente sans rien à y encaisser : dix-neuf Structures
 * pour bâtir l'environnement, et 20,6 % de victoires au banc — le dernier
 * des douze. Les Abyssales sont exactement la récompense qui manquait au
 * bout : elles coûtent plus cher, frappent plus fort, et seul un deck qui
 * vit en bas peut les payer. Cinq instruments partent pour leur faire de
 * la place — dont Sonde des Courants Perdus, qui filtrait sans jamais rien
 * conclure, et un exemplaire de Cloche du Grand Fond, qui demandait 2
 * Raison à un deck qui en manque déjà.
 */
export const DECK_DESCENTE_AUX_ABYSSES: DeckList = {
  id: "descente-aux-abysses",
  name: "Descente aux Abysses",
  shipId: "lerrant",
  description:
    "Contrôle de Marée : fabriquer soi-même l'environnement, et y être chez soi quand l'adversaire n'y survit plus.",
  cardIds: [
    // Ceux qui lisent et poussent la Marée.
    ...repeat("cartographe-du-large", 3),
    ...repeat("anguille-des-profondeurs", 3),
    ...repeat("raie-des-fosses", 2),
    ...repeat("sondeur-des-mauvaises-eaux", 2),
    ...repeat("gardien-du-sondeur", 2),
    // Les instruments : durée, intensité, orientation.
    ...repeat("regulateur-de-courant", 3),
    ...repeat("balise-des-profondeurs", 2),
    ...repeat("compas-aux-aiguilles-noires", 2),
    ...repeat("ancre-de-tempete", 2),
    ...repeat("horloge-de-maree", 1),
    ...repeat("cloche-du-grand-fond", 1),
    ...repeat("epave-engloutie", 1),
    // Le forçage, et ce qui vit en bas.
    ...repeat("la-gueule-sous-la-mer", 1),
    ...repeat("sept-brasses-plus-bas", 1),
    ...repeat("ce-que-la-maree-rend", 2),
    ...repeat("loeil-sous-la-mer", 3),
    ...repeat("la-chose-qui-remonte", 2),
    // La récompense de la descente, reprise de Sous la Ligne : ce que
    // personne d'autre ne peut se permettre de payer aussi tôt.
    ...repeat("ce-qui-suit-le-navire", 2),
    ...repeat("marin-aux-yeux-rouges-abyssal", 1),
    ...repeat("bat-marin-abyssal", 1),
    ...repeat("revenante-de-la-fosse-abyssal", 1),
    // Lot 14 : de quoi survivre à un adversaire pressé.
    ...repeat("pont-mine", 2),
  ],
};

/**
 * 8 — Épavistes. Structures, Sabordage, recyclage.
 *
 * À ne pas confondre avec Mineurs de Fond, et la page insiste : « Mineurs
 * veut conserver un piège jusqu'à son déclenchement ; Épavistes veut
 * volontairement faire disparaître ses propres Structures. » Les deux
 * jouent des Structures, pour des raisons opposées.
 *
 * Cloison Étanche y est le seul piège, et il y sert de deux façons : son
 * aura tient les Structures debout tant qu'elle est visible, sa Réaction
 * cachée en sauve une qui devait partir — ce que ce deck décide.
 */
export const DECK_EPAVISTES: DeckList = {
  id: "epavistes",
  name: "Épavistes",
  shipId: "le-goliath",
  description:
    "Recyclage : une Structure détruite ou Sabordée n'est pas une perte, c'est la ressource que le deck attendait.",
  cardIds: [
    // Ceux qui vivent de ce qui casse.
    ...repeat("plongeur-des-epaves", 2),
    ...repeat("charpentier-des-epaves", 3),
    ...repeat("mecanicien-aux-mains-noires", 2),
    // Les Structures à faire disparaître.
    ...repeat("caisses-arrimees", 3),
    ...repeat("epaves-accrochees", 3),
    ...repeat("tas-de-bouts-de-bois", 3),
    ...repeat("radeau-de-fortune", 3),
    ...repeat("caisse-des-dernieres-planches", 3),
    ...repeat("atelier-de-calfatage", 2),
    // Les outils du démontage.
    ...repeat("levier-de-lest", 2),
    ...repeat("grappin-de-recuperation", 3),
    ...repeat("clous-de-recuperation", 3),
    ...repeat("derniere-planche", 2),
    // Lot 14 : garder ce qu'on veut garder, jeter le reste.
    ...repeat("cloison-etanche", 2),
    ...repeat("planche-de-fortune", 2),
    ...repeat("journal-de-bord", 2),
  ],
};

/**
 * 9 — À bout de Raison. Pression sur la Raison, Déraison, attrition
 * mentale.
 *
 * Le Courlis et ses 12 Raison : il faut en avoir beaucoup pour se permettre
 * d'en faire perdre à l'autre sans se retrouver à sec soi-même.
 *
 * Différence avec Descente aux Abysses, que la page prend soin de poser :
 * « Descente contrôle l'environnement ; À bout de Raison attaque
 * directement l'économie mentale adverse. » Fausse Cargaison y est la carte
 * la plus cohérente du lot — elle augmente le prix payé par quelqu'un qui
 * n'a déjà plus de quoi payer.
 */
export const DECK_A_BOUT_DE_RAISON: DeckList = {
  id: "a-bout-de-raison",
  name: "À bout de Raison",
  shipId: "le-courlis",
  description:
    "Attrition mentale : vider la réserve de Raison adverse, puis regarder sa main devenir injouable.",
  cardIds: [
    // Ceux qui font payer.
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("ponton-aux-cloches", 3),
    ...repeat("quelque-chose-sous-la-coque", 2),
    ...repeat("le-chant-sous-la-ligne", 2),
    ...repeat("anguille-des-profondeurs", 3),
    ...repeat("cloche-immergee", 2),
    // Les Anomalies, qui imposent un choix dont aucune branche n'est bonne.
    ...repeat("les-voix-dans-le-sillage", 2),
    ...repeat("ils-sont-sous-nous", 2),
    ...repeat("le-fond-vous-regarde", 2),
    ...repeat("la-mer-reclame-davantage", 2),
    // Ce qui regarde la main d'en face pour savoir où appuyer.
    ...repeat("guetteur-de-brume", 3),
    ...repeat("la-bouee-qui-regardait", 2),
    ...repeat("matelot-insomniaque", 3),
    ...repeat("cartographe-du-large", 2),
    // Lot 14 : taxer, retarder, renvoyer.
    ...repeat("fausse-cargaison", 2),
    ...repeat("chaine-de-travers", 2),
    ...repeat("par-dessus-bord", 3),
  ],
};

/**
 * 10 — Arsenal de Pont. Objets, Bris depuis la main, jeu réactif.
 *
 * Le cœur du deck n'est pas son plateau mais SA MAIN : l'adversaire ne sait
 * jamais quelle réponse peut partir. Pantalone Sans-Sou en est le moteur
 * naturel — il récompense précisément le Bris direct depuis la main.
 *
 * Le Bris depuis la main coûte max(1, ceil(coût / 2)), soit 2 Raison pour
 * les six Objets réactifs du Lot 14 : c'est sur ce prix-là qu'ils ont été
 * calibrés, et c'est ce qui rend la main jouable à deux reprises par tour.
 *
 * TREIZE CORPS, ET NON CINQ (relevé du 22/09/2026). La première version de
 * cette liste jouait trente-trois Objets pour cinq unités : 3,4 % de
 * victoires sur 1836 parties, dernière de très loin. Le relevé carte par
 * carte ne montrait pas un problème d'Objets — Coup de Harpon partait 221
 * fois en 204 parties, Faire l'Inventaire 162 — mais une absence totale
 * d'horloge : le deck répondait à tout et ne tuait personne, et les Objets
 * à 4 finissaient en main 60 à 108 fois. Un deck réactif a besoin de
 * quelque chose à protéger. Cormoran de Fer (Garde ET Pied marin) tient la
 * ligne pendant que la main travaille, La Chose des Hauts-Fonds et Il
 * Capitano ferment la partie.
 *
 * Ce qui a sauté : Charge de Démolition (6 Raison, morte en main 96 fois
 * sur 204) et un exemplaire de chacun des réactifs les plus lents. La page
 * Notion exige des decks « capables de gagner, pas des listes
 * pédagogiques volontairement faibles » — c'était le cas de celui-ci.
 */
export const DECK_ARSENAL_DE_PONT: DeckList = {
  id: "arsenal-de-pont",
  name: "Arsenal de Pont",
  shipId: "lerrant",
  description:
    "Réactif : rien ne se voit venir, tout part de la main — et chaque Objet brisé paie le suivant.",
  cardIds: [
    // Le moteur du Bris depuis la main.
    ...repeat("pantalone-sans-sou", 3),
    // L'horloge — ce que les réponses protègent, et ce qui finit la partie.
    ...repeat("marin-des-jetees", 2),
    ...repeat("cormoran-de-fer", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("il-capitano-naufrage", 2),
    // Les six réactifs du Lot 14 : la main devient une menace permanente.
    // Deux exemplaires pour les deux qui partent vraiment, un pour le reste.
    ...repeat("harpon-a-ressort", 2),
    ...repeat("contre-harpon", 2),
    ...repeat("bouclier-decume", 1),
    ...repeat("signal-de-detresse", 1),
    ...repeat("corde-de-rappel", 1),
    ...repeat("planche-de-fortune", 1),
    // Le removal, qui part du même endroit.
    ...repeat("coup-de-harpon", 3),
    ...repeat("sabotage-discret", 2),
    ...repeat("coupez-les-cordages", 2),
    // Trouver l'Objet qui manque, et réparer ce qui a tenu.
    ...repeat("faire-linventaire", 3),
    ...repeat("fouille-de-la-cale", 3),
    ...repeat("chope", 2),
    ...repeat("thermos-du-dernier-quart", 1),
    ...repeat("bandages-humides", 1),
    // La Structure signature : elle taxe les Objets d'en face.
    ...repeat("fausse-cargaison", 2),
  ],
};

/**
 * 11 — Chasse au Gros. Midrange tactique, dégâts ciblés.
 *
 * La boucle que le Lot 14 rend enfin lisible : BLESSER, puis TERMINER.
 * Vieux Harponneur ne vise qu'une unité déjà blessée, Qu'on en Finisse
 * qu'une unité blessée CE TOUR — les deux récompensent d'avoir frappé
 * avant.
 *
 * Le Goliath et son canon : un tir arme la seconde moitié de la boucle sans
 * dépenser de carte. Pas de combo — le deck cherche le meilleur échange à
 * chaque tour, et finit avec ce qui reste debout.
 */
export const DECK_CHASSE_AU_GROS: DeckList = {
  id: "chasse-au-gros",
  name: "Chasse au Gros",
  shipId: "le-goliath",
  description:
    "Midrange : blesser d'abord, terminer ensuite, et ne jamais offrir un échange qu'on ne gagne pas.",
  cardIds: [
    // Ceux qui blessent.
    ...repeat("guetteur-mefiant", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("harponneur-du-dernier-quai", 3),
    ...repeat("requin-balafre", 3),
    ...repeat("poisson-aux-dents-de-verre", 3),
    ...repeat("crabe-de-fer", 3),
    // Lot 14 : ceux qui terminent.
    ...repeat("coup-de-harpon", 3),
    ...repeat("harpon-a-ressort", 2),
    ...repeat("quon-en-finisse", 2),
    ...repeat("par-dessus-bord", 2),
    ...repeat("vieux-harponneur", 2),
    ...repeat("pont-mine", 2),
    // Ce qui reste debout quand l'échange est fini.
    ...repeat("ce-qui-suit-le-navire", 3),
    ...repeat("baleine-aux-cicatrices-blanches", 2),
    ...repeat("le-brise-ligne", 2),
    ...repeat("lamiral-sans-pavillon", 1),
    ...repeat("chaine-de-fer-noir", 1),
  ],
};

/**
 * 12 — Après la Tempête. Contrôle lourd, wipes, finishers.
 *
 * Le deck accepte volontairement de laisser l'adversaire développer un
 * plateau avant de le reprendre. Le Courlis, encore : douze Raison, c'est
 * la seule coque qui pose une carte à 7 ou 8 sans y passer trois tours —
 * et la mesure du 22/09 disait qu'aucun deck n'y arrivait.
 *
 * « Le deck doit contenir relativement peu de petites unités » : il n'y en
 * a qu'une sorte ici, et elle est là pour tenir, pas pour attaquer. Tout le
 * reste est du nettoyage et sept menaces lourdes, en un exemplaire chacune
 * pour qu'un wipe ne se joue jamais deux fois de suite.
 */
export const DECK_APRES_LA_TEMPETE: DeckList = {
  id: "apres-la-tempete",
  name: "Après la Tempête",
  shipId: "le-courlis",
  description:
    "Contrôle : survivre, tout nettoyer, et ne reconstruire qu'une fois — avec ce que personne d'autre ne peut payer.",
  cardIds: [
    // Le nettoyage, du plus léger au plus définitif.
    ...repeat("le-pont-est-plein", 2),
    ...repeat("panique-sur-le-pont", 2),
    ...repeat("vague-scelerate", 2),
    ...repeat("chacun-sa-place", 1),
    ...repeat("le-large-se-fache", 1),
    ...repeat("abandonnez-le-navire", 1),
    ...repeat("la-mer-reprend-tout", 1),
    // Les pièges qui achètent les tours qui manquent.
    ...repeat("la-nasse-trop-pleine", 2),
    ...repeat("jugement-du-phare", 1),
    ...repeat("derniere-barricade", 2),
    ...repeat("cage-de-flottaison", 2),
    // Tenir jusque-là.
    ...repeat("crabe-de-fer", 3),
    ...repeat("chirurgien-du-bord", 2),
    ...repeat("trousse-du-bord", 2),
    // Voir venir : un deck de contrôle qui pioche mal ne contrôle rien.
    ...repeat("un-peu-de-repit", 3),
    ...repeat("dernieres-reserves", 3),
    ...repeat("faire-linventaire", 3),
    ...repeat("journal-de-bord", 2),
    // Et de quoi conclure, une fois le plateau vide.
    ...repeat("le-brise-ligne", 2),
    ...repeat("lamiral-sans-pavillon", 1),
    ...repeat("leviathan-balafre", 1),
    ...repeat("dernier-jour-en-mer", 1),
  ],
};

/**
 * Les douze, dans l'ordre de la page — qui est aussi celui de la couverture
 * mécanique : swarm, formation, cimetière, bounce, pièges, forteresse,
 * marée, sabordage, raison, objets, midrange, contrôle.
 */
export const PRECON_DECK_LISTS: readonly DeckList[] = [
  DECK_LE_GRAND_BANC,
  DECK_CHEVALIERS_DU_GRAND_ETANG,
  DECK_LA_VEILLEE,
  DECK_LE_THEATRE_ENGLOUTI,
  DECK_MINEURS_DE_FOND,
  DECK_LA_FORTERESSE,
  DECK_DESCENTE_AUX_ABYSSES,
  DECK_EPAVISTES,
  DECK_A_BOUT_DE_RAISON,
  DECK_ARSENAL_DE_PONT,
  DECK_CHASSE_AU_GROS,
  DECK_APRES_LA_TEMPETE,
];
