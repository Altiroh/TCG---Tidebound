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
 *
 * LISTE REVUE LE 29/09/2026. Une fois les autres decks renforcés, le banc
 * est tombé à 41 %, et ses Structures en étaient la cause : elles prenaient
 * la place de corps dans un deck qui vit du nombre (La Flaque Sacrée Δ −14,
 * Le Tas de Trucs −12). Elles cèdent la place à trois Cra-Poiscail des
 * Hautes-Eaux et deux Casques-Coquilles. Mesuré au labo (bot moyen, 60
 * parties par paire contre le rayon) : 42 % → 48 %. Les Messagers
 * montaient à 63 %, les Rois à 70 % : écartés, au-dessus de la cible.
 * Aucun texte changé.
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
    ...repeat("cra-poiscail-des-hautes-eaux", 3),
    ...repeat("casque-coquille", 2),
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
 *
 * LISTE REVUE LE 29/09/2026. Dix cartes suspendues à deux Chevaliers :
 * sans pièce pivot, la formation ne se montait qu'une partie sur deux. Le
 * Chevalier abyssal — déjà désigné par l'Écuyer, le Destrier, la Quête et
 * le Tournoi — en ajoute une, et trois Bancs de Cra-Poiscail remplacent la
 * Bannière (jouée 38 % des fois où elle est en main) et Dernières Réserves
 * (« 1 carte ou moins en main », Δ −13). Mesuré au labo (bot moyen, 60
 * parties par paire contre le rayon) : 44 % → 53 %. Une formation plus
 * serrée, sans équipements, montait à 69 % : écartée. Aucun texte changé.
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
    ...repeat("chevalier-cra-poiscail-abyssal", 1),
    ...repeat("bourreau-cra-poiscail", 3),
    ...repeat("banc-de-cra-poiscail", 3),
    ...repeat("cra-poiscail-porte-etendard", 2),
    ...repeat("roi-cra-poiscail", 1),
    // Le soutien : soigner et relancer, pas ajouter des corps.
    ...repeat("cra-poiscail-medecin", 3),
    ...repeat("cra-poiscail-messager", 3),
    ...repeat("ptite-fesse-grand-reve", 2),
    // Ce qui transforme une formation en menace.
    ...repeat("fourchette-du-grand-etang", 3),
    ...repeat("slip-de-guerre-cra-poiscail", 2),
    ...repeat("la-quete-du-grand-nenuphar", 2),
    ...repeat("le-tournoi-du-grand-etang", 2),
    ...repeat("le-grand-saut", 1),
    // Lot 14 : le piège signature, et de quoi ne pas rester sans pièce.
    ...repeat("filet-de-sauvetage", 2),
    ...repeat("faire-linventaire", 2),
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
 *
 * LISTE ET NAVIRE REVUS LE 29/09/2026. Quatorze cartes rappelaient, deux
 * arrivées seulement valaient d'être rejouées, et les pièces de soutien du
 * rappel faisaient perdre au labo (Coulisses Δ −9, Théâtre Englouti −6).
 * Sortent les rappels morts (Corde de Rappel, Le Rideau se Lève, Rappel du
 * Public), deux Coulisses, Le Théâtre Englouti et un Changement de rôle ;
 * entrent les Marionnettes abyssales (Arlecchino, Prima Noyée, Régisseur
 * des Profondeurs), la Trappe du Souffleur et trois Matelots du Sans-Nom
 * pour tenir la ligne. Le Courlis cède la place à La Religieuse : ses 4
 * Slots étouffaient un deck de permanents. Mesuré au labo (bot moyen, 60
 * parties par paire contre le rayon) : 31 % → 49 %, 35 cartes Marionnette
 * sur 40, arrivées rejouées 0,07 → 0,43 par partie. Une liste plus chargée
 * en corps montait à 61–69 % : écartée. Aucun texte changé.
 */
export const DECK_LE_THEATRE_ENGLOUTI: DeckList = {
  id: "le-theatre-englouti-deck",
  name: "Le Théâtre Englouti",
  shipId: "la-religieuse",
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
    // Les têtes d'affiche abyssales.
    ...repeat("arlecchino-celui-derriere-le-masque-abyssal", 1),
    ...repeat("la-prima-noyee-abyssal", 1),
    ...repeat("le-regisseur-des-profondeurs-abyssal", 1),
    // Les rappels eux-mêmes.
    ...repeat("le-masque-fendu", 3),
    ...repeat("la-clochette-du-rappel", 3),
    ...repeat("trappe-du-souffleur", 2),
    // Les Coulisses Inondées, supprimées du catalogue (01/10/2026), cèdent
    // leur place à un deuxième Changement de rôle !, refondu le même jour.
    ...repeat("changement-de-role", 2),
    // Tenir la ligne pendant que le moteur se monte.
    ...repeat("matelot-du-sans-nom", 3),
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
 *
 * LISTE REVUE LE 29/09/2026 — des pièges qui rapportent. Chaque piège se
 * détruit après avoir tiré, et rien ne profitait de ce départ ; le deck
 * cherchait, sauvait et cassait des Structures (Journal de Bord, Planche de
 * Fortune, Charge de Démolition, Pont Miné) au lieu de gagner, avec 2,8
 * unités posées par partie. Les outils cèdent la place à ce qui vit du
 * départ d'une Structure (Charpentier et Plongeur des Épaves, Treuil
 * Rouillé), à Bernard-l'Ermite d'Acier et à trois Choses des Hauts-Fonds
 * à la place des Guetteurs de Brume. Mesuré au labo (bot moyen, 60
 * parties par paire contre le rayon) : 13 % → 52 %, 22 Structures
 * toujours en jeu. Aucun texte changé.
 *
 * DEUXIÈME PASSE (29/09/2026, contre le rayon révisé) : retombé à 38 %.
 * Chaîne de Travers (Δ −13) cède la place à deux Baleines aux Cicatrices
 * Blanches. 38 % → 50 % au labo.
 *
 * RECONSTRUIT LE 03/10/2026. Le retrait du catalogue (02/10) lui avait pris
 * six cartes sans remplaçant : Ancre de Dérive ×2, Plongeur des Épaves ×2
 * et les deux Baleines. Le Plongeur cède sa place à la Charpentière de
 * Veille ×2 (elle aussi vit du départ d'un piège) ; l'Ancre et les Baleines
 * à des corps, parce que c'est ce qui manquait : Cormoran de Fer ×2, Mouette
 * du Brise-Lames ×1 et Le Dernier Rempart ×1, un gros corps à
 * Garde, qui fait le travail de la Baleine. Au premier tri (40 parties par
 * paire), un deuxième piège (Pont Miné ×2 à la place de l'Ancre) faisait
 * perdre — 35 % — et deux Derniers Remparts montaient à 57,5 % : écartés.
 * Mesuré au labo (bot moyen, 200 parties par paire contre le rayon) :
 * 39,0 % à 34 cartes → 51,7 %. Aucun texte changé.
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
    ...repeat("fausse-cargaison", 2),
    ...repeat("cloison-etanche", 2),
    ...repeat("cale-inondable", 2),
    ...repeat("derniere-barricade", 2),
    // Les pièges historiques, qui rendent le bluff crédible.
    ...repeat("filet-a-la-derive", 3),
    ...repeat("cloche-dalerte", 2),
    // Ce qui vit du départ d'un piège (29/09/2026).
    ...repeat("charpentier-des-epaves", 3),
    ...repeat("charpentiere-de-veille", 2),
    ...repeat("treuil-rouille", 1),
    ...repeat("bernard-lermite-dacier", 3),
    // Assez de corps pour ne pas perdre en attendant.
    ...repeat("crabe-de-fer", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("cormoran-de-fer", 2),
    ...repeat("mouette-du-brise-lames", 1),
    ...repeat("le-dernier-rempart", 1),
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
 *
 * LISTE REVUE LE 29/09/2026 — des cartes qui attendaient un état qui ne
 * vient pas. Les Abysses durent UN tour de table, environ une fois par
 * partie : L'Œil Sous la Mer n'était joué que 26 % des fois où il était
 * en main, Ce que la Marée Rend 14 %, Sept Brasses 29 %, et les outils
 * qui n'agissent que par Sabordage (Compas, Horloge) avaient le pire Δ du
 * deck. Ils cèdent la place à des corps de Marée, utiles tout de suite et
 * meilleurs quand la mer descend : Veilleur des Profondeurs (qui pousse
 * lui-même la Marée), Masse Sombre, Si-Raie-Ponce, un troisième Ce Qui
 * Suit, Bat-Marin. Mesuré au labo (bot moyen, 60 parties par paire contre
 * le rayon) : 22 % → 49 %. Une version plus agressive montait à 62 % :
 * écartée, au-dessus de la cible. Rendre Anguille et Raie actives
 * « pendant Tempête ou Abysses » n'apportait qu'un à deux points : aucun
 * texte changé.
 *
 * DEUXIÈME PASSE (29/09/2026, contre le rayon révisé) : retombé à 37 %.
 * Pont Miné et Balise des Profondeurs cèdent la place à l'Albatros de
 * Mauvais Temps et au Second au Visage Pâle — deux corps de Tempête.
 * 37 % → 50 % au labo.
 *
 * RECONSTRUIT LE 03/10/2026. Le retrait du catalogue (02/10) lui avait pris
 * onze cartes : Cartographe du Large ×3, Gardien du Sondeur ×2, Veilleuse
 * des Profondeurs ×3, Ancre de Tempête ×2 et Épave Engloutie. Il n'en
 * reste plus qui poussent la Marée sans en payer le prix ; la liste suit
 * donc la pente du 29/09 — des corps de Marée, utiles tout de suite et
 * meilleurs en bas. Entrent Poisson-Lanterne ×3 et Marin des Jetées ×2 (la
 * courbe basse qui manquait), Masse-Sombre abyssale ×2 et Revenante de la
 * Fosse ×2 à la place de la Veilleuse, et deux Bat-Marins de plus. Il ne
 * reste que trois Structures (Régulateur de Courant). Mesuré au labo (bot
 * moyen, 200 parties par paire contre le rayon) : 48,4 % à 29 cartes →
 * 45,3 % à 40, mains sans carte à 2 ou moins 50 % → 29 %. Aucun texte
 * changé.
 */
export const DECK_DESCENTE_AUX_ABYSSES: DeckList = {
  id: "descente-aux-abysses",
  name: "Descente aux Abysses",
  shipId: "lerrant",
  description:
    "Contrôle de Marée : fabriquer soi-même l'environnement, et y être chez soi quand l'adversaire n'y survit plus.",
  cardIds: [
    // Ceux qui lisent et poussent la Marée.
    ...repeat("anguille-des-profondeurs", 3),
    ...repeat("raie-des-fosses", 2),
    ...repeat("sondeur-des-mauvaises-eaux", 2),
    // La courbe basse, qui lit la Marée elle aussi (03/10/2026).
    ...repeat("poisson-lanterne", 3),
    ...repeat("marin-des-jetees", 2),
    // Les instruments : durée, intensité, orientation.
    ...repeat("regulateur-de-courant", 3),
    // Le forçage, et ce qui vit en bas.
    ...repeat("la-gueule-sous-la-mer", 1),
    ...repeat("la-chose-qui-remonte", 2),
    ...repeat("masse-sombre", 3),
    ...repeat("masse-sombre-abyssal", 2),
    ...repeat("lhomme-revenu-de-la-fosse", 2),
    ...repeat("si-raie-ponce", 2),
    ...repeat("bat-marin", 3),
    ...repeat("albatros-de-mauvais-temps", 2),
    ...repeat("second-au-visage-pale", 2),
    // La récompense de la descente, reprise de Sous la Ligne : ce que
    // personne d'autre ne peut se permettre de payer aussi tôt.
    ...repeat("ce-qui-suit-le-navire", 3),
    ...repeat("marin-aux-yeux-rouges-abyssal", 1),
    ...repeat("bat-marin-abyssal", 1),
    ...repeat("revenante-de-la-fosse-abyssal", 1),
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
 *
 * TREIZE CORPS, ET NON SEPT (relevé du 22/09/2026). La maladie d'Arsenal de
 * Pont, à l'identique : 17 % de victoires, dix-neuf Structures et sept
 * unités. Le moteur de recyclage tournait très bien — Charpentier des
 * Épaves sortait 178 fois en 132 parties, Caisses Arrimées 141 — mais rien
 * ne convertissait la valeur en dégâts. Le deck recyclait jusqu'à la fin du
 * temps.
 *
 * Les corps ajoutés restent dans le sujet : Charpentière de Veille et
 * Wood-Vy lisent la destruction de leurs propres Structures, Matelot du
 * Sans-Nom est le corps neutre qui manquait pour tenir la ligne.
 *
 * Ce qui a sauté : Clous de Récupération (12 poses pour 77 morts en main),
 * Dernière Planche (2 poses) et un Journal de Bord.
 *
 * LISTE REVUE LE 29/09/2026 — le moteur tournait encore sans rien gagner :
 * 3,3 Sabordages par partie, 5,6 dégâts, 17 % contre le rayon, et aucune
 * carte du catalogue ne transforme un Sabordage en dégâts. Sortent ce qui
 * va contre le thème (Planche de Fortune ; Radeau de Fortune, qui ne rend
 * rien s'il est détruit), le hors-sujet (Tas de Bouts de Bois, qui lit la
 * mort d'un Cra-Poiscail) et le moins joué (Journal, deux Grappins, une
 * Épave Accrochée). Entrent des corps qui tiennent pendant le recyclage —
 * Matelot, Chose des Hauts-Fonds, Baleine aux Cicatrices Blanches — et des
 * Structures qui gardent le Sabordage au centre : Cage de Flottaison, Étau
 * du Calfat, la Caisse des Dernières Planches abyssale. Mesuré au labo
 * (bot moyen, 60 parties par paire contre le rayon) : 14 % → 49 %, 16
 * Structures et 2,1 Sabordages par partie. Une liste plus lourde montait à
 * 57 % mais ne sabordait plus que 1,5 fois : écartée, le deck y perdait son
 * sujet. Aucun texte changé.
 *
 * DEUXIÈME PASSE (29/09/2026, contre le rayon révisé) : retombé à 39 %
 * une fois les autres decks renforcés. L'Étau du Calfat et le dernier
 * Radeau cèdent la place à trois Crabes de Fer. 39 % → 48 % au labo,
 * 15 Structures toujours en jeu.
 *
 * RECONSTRUIT LE 03/10/2026. Le retrait du catalogue (02/10) lui avait pris
 * Plongeur des Épaves ×2, les deux Baleines et Épaves Accrochées ×2. Le
 * Plongeur cède sa place à Bernard-l'Ermite d'Acier ×2, qui grandit au
 * départ de chaque Structure ; les Baleines et les Épaves à des corps qui
 * tiennent pendant le recyclage, Cormoran de Fer ×2, Mouette du Brise-Lames
 * et Le Dernier Rempart, le gros corps à Garde qui fait le travail de la
 * Baleine. Combler avec des Structures et des outils (Treuil Rouillé,
 * Régulateur de Courant) le faisait tomber à 29 % : la maladie du 22/09,
 * toujours la même — le recyclage ne convertit rien seul. Deux Derniers
 * Remparts montaient à 57,5 % : écartés. Mesuré au labo (bot moyen, 200
 * parties par paire contre le rayon) : 34,4 % à 34 cartes → 50,7 %, 13
 * Structures. Aucun texte changé.
 */
export const DECK_EPAVISTES: DeckList = {
  id: "epavistes",
  name: "Épavistes",
  shipId: "le-goliath",
  description:
    "Recyclage : une Structure détruite ou Sabordée n'est pas une perte, c'est la ressource que le deck attendait.",
  cardIds: [
    // Ceux qui vivent de ce qui casse.
    ...repeat("charpentier-des-epaves", 3),
    ...repeat("mecanicien-aux-mains-noires", 2),
    ...repeat("charpentiere-de-veille", 2),
    ...repeat("wood-vy", 2),
    ...repeat("bernard-lermite-dacier", 2),
    // Les corps qui tiennent pendant que ça recycle.
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("crabe-de-fer", 3),
    ...repeat("cormoran-de-fer", 2),
    ...repeat("mouette-du-brise-lames", 1),
    ...repeat("le-dernier-rempart", 1),
    // Les Structures à faire disparaître.
    ...repeat("caisses-arrimees", 3),
    ...repeat("caisse-des-dernieres-planches", 3),
    ...repeat("caisse-des-dernieres-planches-abyssal", 1),
    ...repeat("atelier-de-calfatage", 2),
    ...repeat("cage-de-flottaison", 2),
    // Les outils du démontage.
    ...repeat("levier-de-lest", 2),
    ...repeat("grappin-de-recuperation", 1),
    // Lot 14 : garder ce qu'on veut garder.
    ...repeat("cloison-etanche", 2),
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
 *
 * LES ANOMALIES À 5 SONT PARTIES (relevé du 22/09/2026). 14 % de victoires,
 * dernier du banc. La liste portait douze Anomalies à 4 et 5 Raison,
 * lancées ONZE fois en tout sur 132 parties : Ils Sont Sous Nous finissait
 * en main 118 fois sur 132 sans jamais être jouée une seule fois, Quelque
 * Chose Sous la Coque 40 fois pour zéro pose. Le défaut est structurel et
 * non conjoncturel — un deck dont le plan consiste à dépenser sa Raison
 * pour faire perdre celle d'en face n'a, par construction, jamais les cinq
 * Raison que ses propres finishers réclament.
 *
 * Elles laissent la place à ce que le deck peut réellement payer : Mousse
 * du Premier Quart, qui rend de la Raison précisément quand on en a moins
 * que l'adversaire — c'est-à-dire tout le temps dans ce deck —, la Marin
 * aux Yeux Rouges Abyssale que la page Notion nomme, et deux corps bon
 * marché pour convertir la pression en dégâts.
 *
 * LISTE ET NAVIRE REVUS LE 29/09/2026. La « main injouable » n'existe pas
 * en règles : sans plancher, l'adversaire s'endette et joue quand même, et
 * aucune carte ne lit la Raison ADVERSE. Mousse du Premier Quart allait
 * même contre le plan (elle ne rend que si VOUS êtes plus bas — plus on
 * draine, moins elle sert). Sortent Mousse, Guetteur de Brume, La Bouée,
 * Fausse Cargaison, Le Chant (symétrique) et Le Fond Vous Regarde (joué
 * 17 % des fois où il est en main). Entrent des corps qui drainent ou qui
 * vivent bas en Raison — Si-Raie-Ponce, Matelot du Sans-Nom, Vieux Loup de
 * Mer, Capitaine sans Sommeil — et Le Rôle d'Équipage, qui fait payer les
 * grands plateaux.
 *
 * Le Courlis cède la place à L'Errant : ses 12 Raison ne paient rien (la
 * Raison remonte par la même courbe pour tous), ses 4 Slots et 26 Ancrage
 * coûtaient cher, et le nouveau Cap sûr de L'Errant rend la Raison du tour
 * la première fois qu'elle tombe à 0 — exactement ce que vit ce deck.
 * Mesuré au labo (bot moyen, 60 parties par paire contre le rayon) :
 * 19 % → 35 % avec la liste seule, 54 % sous L'Errant. Aucun texte changé.
 *
 * RECONSTRUIT LE 03/10/2026. Le retrait du catalogue (02/10) lui avait pris
 * neuf cartes : Ponton aux Cloches ×3, Cloche Immergée ×2, La Mer Réclame
 * Davantage, Capitaine sans Sommeil et Cartographe du Large ×2. Entrent ce
 * qui fait encore payer — le troisième Marin aux Yeux Rouges abyssal, Le
 * Fond Vous Regarde ×2 à la place de l'Anomalie, Bat-Marin abyssal — et ce
 * qui vit bas en Raison à la place du Capitaine : Ce Qui Suit le Navire ×2
 * et la Seconde au Visage Pâle ×2. Trois Choses des Hauts-Fonds à la place
 * de la Seconde et d'un Fond montaient à 71,6 % au premier tri (40 parties
 * par paire) : écartées. Mesuré au labo (bot moyen, 200 parties par paire
 * contre le rayon) : 54,5 % à 31 cartes → 52,6 %. Aucun texte changé.
 */
export const DECK_A_BOUT_DE_RAISON: DeckList = {
  id: "a-bout-de-raison",
  name: "À bout de Raison",
  shipId: "lerrant",
  description:
    "Attrition mentale : vider la réserve de Raison adverse, puis regarder sa main devenir injouable.",
  cardIds: [
    // Ceux qui font payer.
    ...repeat("marin-aux-yeux-rouges", 3),
    ...repeat("marin-aux-yeux-rouges-abyssal", 3),
    ...repeat("si-raie-ponce", 3),
    ...repeat("anguille-des-profondeurs", 3),
    ...repeat("bat-marin-abyssal", 1),
    ...repeat("le-role-dequipage", 2),
    // L'Anomalie : deux tours où chacun paie, en Raison ou en Ancrage.
    ...repeat("le-fond-vous-regarde", 2),
    // Ceux qui vivent bas en Raison, et ce qui convertit la pression.
    ...repeat("matelot-insomniaque", 3),
    ...repeat("ce-qui-suit-le-navire", 2),
    ...repeat("second-au-visage-pale", 2),
    ...repeat("vieux-loup-de-mer", 2),
    ...repeat("murene-aveugle", 3),
    ...repeat("requin-balafre", 3),
    ...repeat("matelot-du-sans-nom", 3),
    // Lot 14 : retarder, renvoyer.
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
 *
 * LA VERRIÈRE (24/09/2026), et non plus L'Errant. Il fallait un
 * préconstruit au sixième Navire ; L'Errant en portait trois, il en garde
 * deux. Pique à Glace est du removal ciblé en coque — le mot même de la
 * fiche de ce deck : 1 dégât pour finir ce que Coup de Harpon a entamé, ou
 * pour achever un corps à 1 avant qu'il ne bloque. Mesuré au labo (bot
 * moyen, 180 parties contre le rayon) : 39 % sous L'Errant, 49 % sous La
 * Verrière.
 */
export const DECK_ARSENAL_DE_PONT: DeckList = {
  id: "arsenal-de-pont",
  name: "Arsenal de Pont",
  shipId: "la-verriere",
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
    // Planche de Fortune, supprimée du catalogue (01/10/2026), cède sa
    // place à un deuxième Bouclier d'Écume : même rôle, sauver un permanent.
    ...repeat("bouclier-decume", 2),
    ...repeat("signal-de-detresse", 1),
    ...repeat("corde-de-rappel", 1),
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
 *
 * RECONSTRUIT LE 03/10/2026. Les deux Baleines aux Cicatrices Blanches,
 * retirées du catalogue (02/10), cèdent leur place à deux Choses des
 * Hauts-Fonds : le même corps à 4 qui reste debout après l'échange. La
 * Vieille-Selle, essayée à la même place, donnait 45,7 % au premier tri.
 * Mesuré au labo (bot moyen, 200 parties par paire contre le rayon) :
 * 49,8 % à 38 cartes → 52,8 %. Aucun texte changé.
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
    ...repeat("chose-des-hauts-fonds", 2),
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
 *
 * LISTE REVUE LE 29/09/2026. Sept cartes attendaient que l'adversaire
 * contrôle au moins quatre unités — ~9 % des tours : Panique sur le Pont
 * jouée 6 % des fois où elle était en main, Chacun sa Place 1 %,
 * Abandonnez le Navire jamais — et le deck n'avait que neuf unités, alors
 * que ses meilleurs Δ étaient des corps. Sortent Panique, Chacun sa Place,
 * Abandonnez, les deux Nasses, le Journal de Bord et deux Dernières
 * Réserves ; entrent des corps qui survivent aux balais du deck : Baleine
 * aux Cicatrices Blanches, Carapé-Hus (Garde pendant le Calme, quand le
 * Crabe la perd), Capitaine du Dernier Retour, Chose des Hauts-Fonds,
 * Matelot du Sans-Nom. Mesuré au labo (bot moyen, 60 parties par paire
 * contre le rayon) : 20 % → 47 %, toujours sur Le Courlis. Aucun texte
 * changé.
 *
 * LE COURLIS, MESURÉ : ce sont ses 26 points d'Ancrage qui coûtent, pas
 * ses 4 Slots — la même liste gagne 0 point avec 5 Slots, 13 avec 30
 * Ancrage. Décision de rééquilibrage laissée au design.
 *
 * DEUXIÈME PASSE (29/09/2026, contre le rayon révisé) : retombé à 42 %.
 * Le Capitaine du Dernier Retour (Δ −12) cède la place à deux Matelots du
 * Sans-Nom. 42 % → 48 % au labo.
 *
 * LE COURLIS À 5 SLOTS (01/10/2026) : 49 % → 46 %, dans le bruit — la
 * mesure de 2026-09 se confirme, le Slot de plus ne lui sert pas. Son
 * frein est sa courbe : 38 % de mains sans carte à 2 Raison ou moins.
 *
 * STANDARD VERRIER (01/10/2026, validé par le propriétaire) : la courbe.
 * Sortent Chirurgien du Bord ×2 (Δ −11) et Un Peu de Répit ×3 (joué 4 fois
 * sur 10) ; entrent Mouette du Brise-Lames ×3 — Garde, et +1 Puissance
 * conservée chaque fois qu'elle survit : les balais du deck la forgent — et
 * Matelot Insomniaque ×2, qui vit bien en Déraison. Aucun texte changé.
 * Mesuré sur cette liste (bot moyen, 60 parties par paire contre le rayon) :
 * 52,5 % → 63 %, mains sans carte à 2 ou moins 66 % → 29 %.
 *
 * RECONSTRUIT LE 03/10/2026. Les deux Baleines aux Cicatrices Blanches,
 * retirées du catalogue (02/10), laissaient 38 cartes — et le deck à
 * 63,3 % contre le rayon, au-dessus de la cible avant même d'être complété.
 * Les deux places reviennent au nettoyage, Chacun sa Place et Abandonnez le
 * Navire !, revus le 01/10 (coût 5 → 3, 6 → 2) : la page fait de ce deck
 * celui des balais, et ce sont les deux seuls qui restaient hors de la
 * liste. Ils partent peu (23 % et 45 % des fois où ils sont en main), et le
 * deck revient dans la cible. Le Dernier Rempart ×2, gros corps à la place
 * des gros corps, le laissait à 67 % au premier tri : écarté. Mesuré au
 * labo (bot moyen, 200 parties par paire contre le rayon) : 63,3 % à 38
 * cartes → 53,3 %. Aucun texte changé.
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
    ...repeat("vague-scelerate", 2),
    ...repeat("le-large-se-fache", 1),
    ...repeat("la-mer-reprend-tout", 1),
    // Les deux balais à la carte, revus le 01/10/2026 (reconstruit le 03/10).
    ...repeat("chacun-sa-place", 1),
    ...repeat("abandonnez-le-navire", 1),
    // Les pièges qui achètent les tours qui manquent.
    ...repeat("jugement-du-phare", 1),
    ...repeat("derniere-barricade", 2),
    ...repeat("cage-de-flottaison", 2),
    // Tenir jusque-là — des corps qui survivent aux balais du deck.
    ...repeat("crabe-de-fer", 3),
    ...repeat("carape-hus", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("chose-des-hauts-fonds", 2),
    ...repeat("trousse-du-bord", 2),
    // Les petits corps que les balais forgent (Standard Verrier, 01/10/2026).
    ...repeat("mouette-du-brise-lames", 3),
    ...repeat("matelot-insomniaque", 2),
    // Voir venir : un deck de contrôle qui pioche mal ne contrôle rien.
    ...repeat("dernieres-reserves", 1),
    ...repeat("faire-linventaire", 3),
    // Et de quoi conclure, une fois le plateau vide.
    ...repeat("le-brise-ligne", 2),
    ...repeat("lamiral-sans-pavillon", 1),
    ...repeat("leviathan-balafre", 1),
    ...repeat("dernier-jour-en-mer", 1),
  ],
};

/**
 * LOT 15 — ÉCLATS EN SELLE : trois préconstruits, un par archétype
 * (demande du 24/09/2026). Les listes sont celles que le labo mesurait
 * depuis le 23/09 comme candidates ; seules leurs COQUES ont été choisies
 * ici, au labo (bot moyen, 16 parties par paire contre le rayon de quinze).
 *
 * ÉCART DE PUISSANCE SIGNALÉ, NON CORRIGÉ. Ces trois listes gagnent 65 à
 * 83 % contre le rayon selon la coque, là où les douze autres tournent
 * autour de 50 %. Le Lot 15 est plus fort que ce qui l'entoure ; ce n'est
 * pas aux listes de le cacher en silence. Les coques retenues sont donc
 * celles qui les poussent le MOINS haut sans trahir leur thème — le
 * Brise-Lames et La Religieuse, à ~80 %, sont écartés.
 */

/**
 * 13 — Équipage de Verre. Se fêler sans casser.
 *
 * La Verrière, et non le Brise-Lames de la liste candidate : Pique à Glace
 * est la seule capacité de Navire qui blesse SES PROPRES unités — 1 dégât
 * sur un Matelot Fêlé, c'est un « survit à des dégâts » à la demande, et
 * Maître Verrier rend 1 Raison quand c'est un de vos effets qui frappe.
 * Mesuré : 65 % (79 % sous le Brise-Lames).
 */
export const DECK_EQUIPAGE_DE_VERRE: DeckList = {
  id: "equipage-de-verre",
  name: "Équipage de Verre",
  shipId: "la-verriere",
  description: "Se fêler sans casser : chaque dégât survécu fait grandir l'équipage.",
  cardIds: [
    ...repeat("eclaireur-ebreche", 3),
    ...repeat("matelot-fele", 3),
    ...repeat("eclat-de-bouteille", 2),
    ...repeat("duelliste-de-verre", 2),
    ...repeat("vigie-aux-fissures", 2),
    ...repeat("verrier-de-pont", 2),
    ...repeat("trinquer-trop-fort", 1),
    ...repeat("encore-debout", 1),
    ...repeat("bouclier-fendu", 1),
    ...repeat("bandages-humides", 1),
    ...repeat("canonnier-fele", 2),
    ...repeat("porte-eclats", 2),
    ...repeat("polisseuse-des-felures", 2),
    ...repeat("pont-de-verre", 1),
    ...repeat("bretteuse-au-bord", 3),
    ...repeat("maitre-verrier", 2),
    ...repeat("coup-de-harpon", 2),
    ...repeat("la-grande-fissure", 2),
    ...repeat("chirurgien-du-bord", 2),
    ...repeat("jusqua-ce-que-ca-casse", 1),
    ...repeat("le-brise-ligne", 2),
    ...repeat("lamiral-sans-pavillon", 1),
  ],
};

/**
 * 14 — Cavalerie. Peu de bêtes, mais lourdes, et de quoi percer la Garde.
 *
 * Le Goliath : son Canon ouvre la route que les Bêtes ne peuvent pas
 * prendre seules. Mesuré : 68 % (83 % sous le Brise-Lames).
 */
export const DECK_CAVALERIE: DeckList = {
  id: "cavalerie",
  name: "Cavalerie",
  shipId: "le-goliath",
  description: "Peu de bêtes, mais lourdes : elles tiennent la ligne et percent la Garde.",
  cardIds: [
    ...repeat("monture-de-breche", 3),
    ...repeat("bete-de-halage", 3),
    ...repeat("selle-de-guerre", 3),
    ...repeat("harnais-de-retenue", 1),
    ...repeat("debusquer", 2),
    ...repeat("faire-linventaire", 1),
    ...repeat("eclaireur-a-cornes", 3),
    ...repeat("destrier-du-ressac", 2),
    ...repeat("mufle-au-fanion", 3),
    ...repeat("chargeur-des-ecueils", 2),
    ...repeat("bete-de-percee", 2),
    ...repeat("ouvrez-la-ligne", 1),
    ...repeat("pas-un-pas-de-plus", 2),
    ...repeat("coup-de-harpon", 2),
    ...repeat("mange-fer", 2),
    ...repeat("vieille-selle", 2),
    ...repeat("le-deserteur-gris", 3),
    ...repeat("la-bete-quon-nattend-plus", 2),
    ...repeat("vieux-harponneur", 1),
  ],
};

/**
 * 15 — Sentinelles Chromatiques. Des pierres qui se répondent.
 *
 * L'Errant : la coque neutre, qui ne prête rien à un deck dont tout le
 * moteur tient sur son propre plateau. Il retrouve ainsi le troisième
 * préconstruit qu'Arsenal de Pont lui a pris. Mesuré : 74 % (80 % sous le
 * Brise-Lames).
 *
 * LISTE ET NAVIRE REVUS LE 29/09/2026. Après la révision des six decks du
 * bas, les Sentinelles restaient seules au-dessus du rayon (77 %, le
 * nouveau Cap sûr de L'Errant leur ayant donné huit points), en traînant
 * pourtant une dizaine de cartes qui font perdre : le sous-moteur des
 * Éclats sans source (Bracelet Δ −18, Pierre Retrouvée −13, Coffret −12)
 * et des sorts qui ne partent presque jamais (Les Couleurs Répondent −22,
 * Synchronisation −13). Ils sortent pour des Sentinelles — chaque carte
 * fait désormais quelque chose —, et le deck passe sur Le Courlis, dont
 * les 26 Ancrage tiennent un plateau aussi fort à distance. Mesuré au labo
 * (bot moyen, 60 parties par paire contre le rayon) : liste nettoyée 87 %
 * sous L'Errant, 75 % sous Le Goliath, 50 % sous Le Courlis. Aucun texte
 * changé. Si Le Courlis passe un jour à 30 Ancrage, remesurer.
 *
 * LE COURLIS À 5 SLOTS (01/10/2026). Remesuré contre la méta du jour :
 * 41 % sous le Courlis à 4 Slots / 30 Ancrage — le deck restait inactif
 * deux tours sur T1-4 dans 19 % des parties, faute de place. À 5 Slots :
 * 54 %, 6 % de tours perdus. Liste inchangée.
 */
export const DECK_SENTINELLES_CHROMATIQUES: DeckList = {
  id: "sentinelles-chromatiques",
  name: "Sentinelles Chromatiques",
  shipId: "le-courlis",
  description: "Des pierres qui se répondent : chaque Sentinelle renforce les autres, jusqu'au Géant.",
  cardIds: [
    ...repeat("heros-de-la-flamme", 3),
    ...repeat("gardienne-de-leclat", 3),
    ...repeat("tacticien-de-lecume", 3),
    ...repeat("porteur-de-jade", 2),
    ...repeat("appel-des-sentinelles", 3),
    ...repeat("poste-chromatique", 1),
    ...repeat("veilleuse-de-lombre", 3),
    ...repeat("survivant-de-la-mousse", 2),
    ...repeat("emissaire-de-quartz", 2),
    ...repeat("la-premiere-pierre", 1),
    ...repeat("briseur-du-brasier", 3),
    ...repeat("rempart-du-soleil", 3),
    ...repeat("stratege-de-lazur", 3),
    ...repeat("oracle-damethyste", 3),
    ...repeat("coup-de-harpon", 1),
    ...repeat("heraut-de-nacre", 2),
    ...repeat("formation-prismatique", 1),
    ...repeat("le-geant-chromatique", 1),
  ],
};

/**
 * Les quinze : les douze dans l'ordre de la page — qui est aussi celui de la couverture
 * mécanique : swarm, formation, cimetière, bounce, pièges, forteresse,
 * marée, sabordage, raison, objets, midrange, contrôle — puis les trois
 * archétypes du Lot 15 : survie, cavalerie, couleurs.
 */
/**
 * 16 — Les Altérés (Lot 16, 04/10/2026). Multiplier les Éveils jusqu'à
 * produire plus de valeur que le coût payé, puis convertir la chaîne en
 * plateau, en dégâts ou en attaque immédiate.
 *
 * Liste et Navire de Notion (« Préconstruits » § 16) : La Religieuse, dont
 * Réparation d'urgence prolonge la fenêtre de combo et rattrape un tour où
 * le joueur s'est endetté en Raison — le deck amorce lui-même ses Éveils.
 * 30 Marins Altérés, 10 Anomalies, 25 cartes à 2 Raison ou moins.
 * ÉCART DE PUISSANCE SIGNALÉ, NON CORRIGÉ (décision du 04/10/2026 : gardé
 * tel quel). Mesuré au labo (bot moyen, 60 parties par paire) : 77 % contre
 * le rayon sous La Religieuse, là où les quinze autres tiennent entre 42 et
 * 59 %. Sous les autres coques : 84 % L'Errant, 82 % Brise-Lames, 69 %
 * Courlis, 67 % Verrière, 63 % Goliath (`scripts/preconLab/libraries/lot16Navires.ts`).
 */
export const DECK_LES_ALTERES: DeckList = {
  id: "les-alteres",
  name: "Les Altérés",
  shipId: "la-religieuse",
  description: "Un Éveil en appelle un autre : la chaîne paie plus qu'elle ne coûte.",
  cardIds: [
    ...repeat("linstable", 3),
    ...repeat("le-dedouble", 2),
    ...repeat("lentendant", 3),
    ...repeat("leveilleur", 3),
    ...repeat("le-copieur", 2),
    ...repeat("le-buveur", 2),
    ...repeat("le-fendu", 2),
    ...repeat("le-recousu", 1),
    ...repeat("lintangible", 1),
    ...repeat("le-meneur", 2),
    ...repeat("le-feral", 2),
    ...repeat("lattire-fer", 1),
    ...repeat("la-conscience-commune", 1),
    ...repeat("la-revenante", 1),
    ...repeat("la-chute-de-lange", 2),
    ...repeat("le-diable-en-personne", 1),
    ...repeat("lanomalie-premiere", 1),
    ...repeat("alteration-forcee", 3),
    ...repeat("propagation", 3),
    ...repeat("ils-etaient-deja-la", 1),
    ...repeat("surcharge", 2),
    ...repeat("mutation-reflexe", 1),
  ],
};

/**
 * 17 — Les Veilleurs d'Opale (Lot 17, 05/10/2026). Installer des Opalins qui
 * produisent une valeur récurrente, puis faire évoluer LV1 vers LV5 et LVX.
 *
 * Liste et Navire de Notion (« Lot 15 — Dungeon et Ladalle / Opalins »,
 * Préconstruit Opalin) : Île-Tortue Opaline. ÉCART SIGNALÉ, NON CORRIGÉ
 * D'AUTORITÉ : la liste Notion met 2 Morhal (Max deck 1) et 3 Eidolon LV1
 * (Max deck 2). Ramenée aux limites des cartes, elle complète ses 40 avec
 * +1 Veille des Niveaux et +1 Sommeil de Pierre (tous deux limités à 3).
 */
export const DECK_LES_VEILLEURS_D_OPALE: DeckList = {
  id: "les-veilleurs-d-opale",
  name: "Les Veilleurs d'Opale",
  shipId: "ile-tortue-opaline",
  description: "Des gardiens qui ne cèdent rien, et une lignée qui s'éveille si on la laisse vivre.",
  cardIds: [
    ...repeat("cartographe-opalin-mefiant", 3),
    ...repeat("velm-opalin-des-armures", 3),
    ...repeat("sila-opalin-du-large", 3),
    ...repeat("orram-opalin-des-memoires", 2),
    ...repeat("kaor-opalin-des-reliques", 2),
    ...repeat("seren-opalin-du-silence", 2),
    ...repeat("tharos-opalin-des-brisants", 2),
    ...repeat("elyor-opalin-du-retour", 2),
    ...repeat("morhal-opalin-des-navires", 1),
    ...repeat("dhar-opalin-du-premier-coup", 2),
    ...repeat("astel-opalin-de-la-derniere-veille", 1),
    ...repeat("eidolon-opalin-lv1", 2),
    ...repeat("eidolon-opalin-lv5", 2),
    ...repeat("eidolon-opalin-lvx-abyssal", 1),
    ...repeat("fragment-d-eveil", 2),
    ...repeat("sommeil-de-pierre", 3),
    ...repeat("veille-des-niveaux", 3),
    ...repeat("boussole-fendue", 2),
    ...repeat("bouclier-decume", 2),
    ...repeat("coup-de-harpon", 2),
  ],
};

/**
 * 18 — La Quête était pourtant simple (Lot 17, 05/10/2026). Apprendre D4, D6
 * et D8, puis utiliser la Chaîne pour transformer les jets importants.
 *
 * Liste de Notion, telle quelle. Notion ne nomme PAS de Navire : L'Errant,
 * la coque polyvalente sans faiblesse, en attendant l'arbitrage.
 */
export const DECK_LA_QUETE_ETAIT_POURTANT_SIMPLE: DeckList = {
  id: "la-quete-etait-pourtant-simple",
  name: "La Quête était pourtant simple",
  shipId: "lerrant",
  description: "Une compagnie qui lance les dés à chaque porte — et triche quand il le faut.",
  cardIds: [
    ...repeat("gaston-aventurier-de-ladalle", 3),
    ...repeat("miss-franche-comte-1987-roublarde-aux-des-pipes", 2),
    ...repeat("balthazar-mage-approximatif", 2),
    ...repeat("frere-michel-clerc-de-secours", 2),
    ...repeat("hubert-paladin-persuade-d-etre-l-elu", 2),
    ...repeat("gege-rodeur-du-mauvais-chemin", 2),
    ...repeat("barnabe-barde-insupportable", 2),
    ...repeat("maurice-ecuyer-de-troisieme-choix", 3),
    ...repeat("gnome-du-sac-sans-fond", 2),
    ...repeat("le-nain-qui-connait-un-raccourci", 2),
    ...repeat("brigitte-druidesse-des-caves", 2),
    ...repeat("rita-sorciere-sous-contrat", 1),
    ...repeat("le-geant-qui-croyait-etre-discret", 1),
    ...repeat("le-mimique-du-coffre-evidemment-piege", 1),
    ...repeat("maitre-de-ladalle", 1),
    ...repeat("l-aventurier-de-niveau-beaucoup-trop-eleve", 1),
    ...repeat("de-pipe", 3),
    ...repeat("relance-j-te-jure", 2),
    ...repeat("c-etait-presque-un-six", 1),
    ...repeat("double-tentative", 1),
    ...repeat("de-du-destin-tres-officiel", 1),
    ...repeat("on-retourne-a-l-auberge", 1),
    ...repeat("plan-du-donjon-mal-dessine", 1),
    ...repeat("le-donjon-de-ladalle", 1),
  ],
};

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
  // Lot 15 — Éclats en Selle (24/09/2026).
  DECK_EQUIPAGE_DE_VERRE,
  DECK_CAVALERIE,
  DECK_SENTINELLES_CHROMATIQUES,
  // Lot 16 — Les Altérés (04/10/2026).
  DECK_LES_ALTERES,
  // Lot 17 — Dungeon et Ladalle / Opalins (05/10/2026).
  DECK_LES_VEILLEURS_D_OPALE,
  DECK_LA_QUETE_ETAIT_POURTANT_SIMPLE,
];
