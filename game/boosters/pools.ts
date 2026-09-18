import { CORE_SET } from "@/game/cards/sets/core";

/**
 * Pools de boosters — quelles cartes peuvent tomber dans quel booster.
 *
 * SOURCE DE VÉRITÉ : Notion « Catalogue de cartes » §« Répartition globale
 * des boosters — source de vérité au 15 septembre 2026 », recoupée avec
 * « Boosters & économie de collection ». Les listes ci-dessous en sont la
 * transcription carte par carte, par SLUG.
 *
 * Le cadrage est explicite sur le principe :
 *
 *   > Une carte appartient à une collection. Elle peut appartenir à un
 *   > archétype. Ce sont les pools de boosters qui déterminent où elle peut
 *   > être obtenue.
 *
 * D'où ce fichier, qui remplace l'ancien bricolage : le tirage filtrait sur
 * `set_code = 'core'` et sur `pool_excluded_rarities`, ce qui rendait tout
 * le Lot 10 Cra-Poiscail intirable et n'aurait jamais pu exprimer trois
 * pools distincts. L'éligibilité est désormais « définie au niveau du pool
 * de booster, pas déduite automatiquement de la rareté ou de l'archétype »,
 * comme le cadrage le demande.
 *
 * Ces listes alimentent `booster_pool_cards` via `npm run seed:cards` ; à
 * l'exécution, c'est la BASE qui fait autorité (une carte peut y être
 * désactivée sans toucher au moteur).
 */

/** Identifiants des boosters — mêmes valeurs que `booster_definitions.id`. */
export const BOOSTER_DEFAUT = "standard";
export const BOOSTER_POISSONS_PAS_FRAIS = "poissons-pas-frais";
export const BOOSTER_ETRANGETE_SOUS_MARINE = "etrangete-sous-marine";
export const BOOSTER_BIENVENUE = "welcome_tutorial";
/** B4 — La Veillée des Disparus (Lot 13). */
export const BOOSTER_VEILLEE_DES_DISPARUS = "la-veillee-des-disparus";

/**
 * B1 — Défaut. 61 entrées. Pool d'apprentissage : cartes lisibles,
 * fondamentaux de Raison / Marée / Structures / Équipements, premières
 * cartes Cra-Poiscail et un teaser Marionnette.
 */
const DEFAUT: readonly string[] = [
  "marin-des-jetees", // Marin des Jetées
  "vieux-loup-de-mer", // Vieux Loup de Mer
  "plongeur-des-epaves", // Plongeur des Épaves
  "murene-aveugle", // Murène Aveugle
  "poisson-lanterne", // Poisson-Lanterne
  "chose-des-hauts-fonds", // Chose des Hauts-Fonds
  "caisses-arrimees", // Caisses Arrimées
  "brise-vague-de-fortune", // Brise-Vague de Fortune
  "harpon-de-pont", // Harpon de Pont
  "thermos-du-dernier-quart", // Thermos du Dernier Quart
  "cylindre-flottant", // Cylindre flottant
  "cartes-des-courants", // Cartes des Courants
  "cloche-dalerte", // Cloche d'Alerte
  "ancre-de-derive", // Ancre de Dérive
  "marin-aux-yeux-rouges", // Marin aux Yeux Rouges
  "marin-aux-yeux-rouges-abyssal", // Marin aux Yeux Rouges
  "guetteur-mefiant", // Guetteur Méfiant
  "guetteur-de-brume", // Guetteur de Brume
  "matelot-du-sans-nom", // Matelot du Sans-Nom
  "crabe-de-fer", // Crabe de Fer
  "bouee-de-derive", // Bouée de Dérive
  "epave-a-fleur-deau", // Épave à Fleur d'Eau
  "plaque-de-fortune", // Plaque de Fortune
  "poisson-aux-dents-de-verre", // Poisson aux Dents de Verre
  "treuil-rouille", // Treuil Rouillé
  "filet-a-la-derive", // Filet à la Dérive
  "mousse-du-premier-quart", // Mousse du Premier Quart
  "charpentier-de-bord", // Gabière du Grand Large
  "contremaitre-des-amarres", // Contremaître des Amarres
  "bernard-lermite-dacier", // Bernard-l'Ermite d'Acier
  "corde-de-remorquage", // Corde de Remorquage
  "kit-de-calfatage", // Kit de Calfatage
  "radeau-de-fortune", // Radeau de Fortune
  "epaves-accrochees", // Épaves Accrochées
  "levier-de-lest", // Levier de Lest
  "regulateur-de-courant", // Régulateur de Courant
  "wood-vy", // Wood Vy
  "carape-hus", // Carape Hus
  "tetard-fesse", // Têtard-Fesse
  "cra-poiscail-sauteur", // Cra-Poiscail Sauteur
  "banc-de-cra-poiscail", // Banc de Cra-Poiscail
  "ptite-fesse", // P'tite Fesse
  "cra-poiscail-grand-gueule", // Cra-Poiscail Grand-Gueule
  "le-seau", // Le Seau
  "la-flaque-sacree", // La Flaque Sacrée
  "fesses-en-avant", // Fesses en Avant !
  "pulcinella-gonfle", // Pulcinella Gonflé
  // --- Lot 12 — Rapiécer la Coque ---
  "mousse-des-quarts",
  "gabier-au-carnet-mouille",
  "chirurgien-de-coque",
  "journal-de-bord-detrempe",
  "pansements-de-coque",
  "caisse-de-pieces-seches",
  "rations-du-matin-gris",
  "lettre-jamais-ouverte",
  "bibliotheque-salee",
  "longue-vue-rayee",
  "sterne-des-embruns",
  "pelican-des-cales",
  "mouette-du-brise-lames",
  "harnois-de-vigie",
];

/**
 * B2 — Poissons pas frais. 65 entrées. Pool intermédiaire : créatures
 * marines plus marquées, Bris d'Objets, Cra-Poiscail développés,
 * manipulation de Marée.
 */
const POISSONS_PAS_FRAIS: readonly string[] = [
  "anguille-des-profondeurs", // Anguille des Profondeurs
  "le-chant-sous-la-ligne", // Le Chant Sous la Ligne
  "cartographe-du-large", // Cartographe du Large
  "matelot-insomniaque", // Matelot Insomniaque
  "gardien-du-sondeur", // Gardien du Sondeur
  "raie-des-fosses", // Raie des Fosses
  "lampe-de-pont-rouge", // Lampe de Pont Rouge
  "balise-des-profondeurs", // Balise des Profondeurs
  "harponneur-du-dernier-quai", // Harponneur du Dernier Quai
  "capitaine-sans-sommeil", // Capitaine Sans Sommeil
  "requin-balafre", // Requin Balafré
  "cage-de-flottaison", // Cage de Flottaison
  "ponton-aux-cloches", // Ponton aux Cloches
  "barracuda-des-hauts-fonds", // Barracuda des Hauts-Fonds
  "poisson-scie-gris", // Poisson-Scie Gris
  "grappin-de-recuperation", // Grappin de Récupération
  "mecanicien-aux-mains-noires", // Mécanicien aux Mains Noires
  "meduse-des-lanternes", // Méduse des Lanternes
  "baleine-aux-cicatrices-blanches", // Baleine aux Cicatrices Blanches
  "carcasse-renversee", // Carcasse Renversée
  "bouee-de-rappel", // Bouée de Rappel
  "horloge-de-maree", // Horloge de Marée
  "sondeur-des-mauvaises-eaux", // Sondeur des Mauvaises Eaux
  "ancre-de-tempete", // Ancre de Tempête
  "si-raie-ponce", // Si, Raie Ponce
  "bat-marin", // Bat-Marin
  "bat-marin-abyssal", // Bat-Marin
  "chope", // Choppe !
  "la-chose-qui-remonte", // La Chose qui Remonte
  "epave-engloutie", // Épave Engloutie
  "lhomme-revenu-de-la-fosse", // Revenante de la Fosse
  "revenante-de-la-fosse-abyssal", // Revenante de la Fosse — ABYSSALE
  "treuil-a-chair", // Treuil à Chair
  "second-au-visage-pale", // Seconde au Visage Pâle
  "veilleur-des-profondeurs", // Veilleuse des Profondeurs
  "masque-de-plongee-fissure", // Masque de Plongée Fissuré
  "chaine-de-fer-noir", // Chaîne de Fer Noir
  "le-filet-qui-respire", // Le Filet qui Respire
  "compas-aux-aiguilles-noires", // Compas aux Aiguilles Noires
  "cra-poiscail-bavard", // Cra-Poiscail Bavard
  "cra-poiscail-chef-de-banc", // Cra-Poiscail Chef de Banc
  "cra-poiscail-ramasseur", // Cra-Poiscail Ramasseur
  "cra-poiscail-des-bas-fonds", // Cra-Poiscail des Bas-Fonds
  "cra-poiscail-des-hautes-eaux", // Cra-Poiscail des Hautes-Eaux
  "slip-de-guerre-cra-poiscail", // Slip de Guerre Cra-Poiscail
  "casque-coquille", // Casque-Coquille
  "le-tas-de-trucs", // Le Tas de Trucs
  "le-trone-de-bouchon", // Le Trône de Bouchon
  "la-grande-migration", // La Grande Migration
  "arlecchino-des-profondeurs", // Arlecchino des Profondeurs
  "le-masque-fendu", // Le Masque Fendu
  // --- Lot 12 — Rapiécer la Coque ---
  "quartier-maitre-des-vivres",
  "charpentiere-de-veille",
  "capitaine-du-dernier-retour",
  "derniere-planche",
  "atelier-de-calfatage",
  "infirmerie-de-pont",
  "caisse-des-dernieres-planches",
  "caisse-des-dernieres-planches-abyssal",
  "goeland-chapardeur",
  "cormoran-de-fer",
  "cormoran-de-fer-abyssal",
  "albatros-de-mauvais-temps",
  "charpentier-des-epaves",
  "barge-de-reparation",
];

/**
 * B3 — Étrangeté sous-marine. 64 entrées. Pool avancé et thématique :
 * Marionnettes / Théâtre, étrangeté abyssale, grosses cartes de rupture et
 * branche pseudo-médiévale Cra-Poiscail.
 */
const ETRANGETE_SOUS_MARINE: readonly string[] = [
  "quelque-chose-sous-la-coque", // Quelque Chose Sous la Coque
  "les-voix-dans-le-sillage", // Les Voix dans le Sillage
  "masse-sombre", // Masse-Sombre
  "masse-sombre-abyssal", // Masse-Sombre — ABYSSALE
  "ce-qui-suit-le-navire", // Ce Qui Suit le Navire
  "ce-qui-suit-le-navire-abyssal", // Ce Qui Suit le Navire
  "lanterne-aux-verres-noirs", // Lanterne aux Verres Noirs
  "la-bouee-qui-regardait", // La Bouée qui Regardait
  "ils-sont-sous-nous", // Ils Sont Sous Nous
  "ils-sont-sous-nous-abyssal", // Ils Sont Sous Nous
  "loeil-sous-la-mer", // L'Œil Sous la Mer
  "loeil-sous-la-mer-abyssal", // L'Œil Sous la Mer
  "cloche-immergee", // Cloche Immergée
  "le-fond-vous-regarde", // Le Fond Vous Regarde
  "le-fond-vous-regarde-abyssal", // Le Fond Vous Regarde
  "cloche-du-grand-fond", // Cloche du Grand Fond
  "cloche-du-grand-fond-abyssal", // Cloche du Grand Fond
  "la-mer-reclame-davantage", // La Mer Réclame Davantage
  "la-mer-reclame-davantage-abyssal", // La Mer Réclame Davantage
  "la-gueule-sous-la-mer", // La Gueule Sous la Mer
  "sept-brasses-plus-bas", // Sept Brasses Plus Bas
  "ecuyer-cra-poiscail", // Écuyer Cra-Poiscail
  "chevalier-cra-poiscail", // Chevalier Cra-Poiscail
  "destrier-du-grand-etang", // Destrier du Grand Étang
  "bourreau-cra-poiscail", // Bourreau Cra-Poiscail
  "cra-poiscail-porte-etendard", // Cra-Poiscail Porte-Étendard
  "roi-cra-poiscail", // Roi Cra-Poiscail
  "ptite-fesse-grand-reve", // P'tite Fesse, Grand Rêve
  "fourchette-du-grand-etang", // Fourchette du Grand Étang
  "banniere-en-vieille-chaussette", // Bannière en Vieille Chaussette
  "la-quete-du-grand-nenuphar", // La Quête du Grand Nénuphar
  "le-grand-saut", // Le Grand Saut
  "le-tournoi-du-grand-etang", // Le Tournoi du Grand Étang
  "roi-cra-poiscail-abyssal", // Roi Cra-Poiscail
  "ptite-fesse-grand-reve-abyssal", // P'tite Fesse, Grand Rêve
  "chevalier-cra-poiscail-abyssal", // Chevalier Cra-Poiscail
  "pulcinella-gonfle", // Pulcinella Gonflé
  "arlecchino-des-profondeurs", // Arlecchino des Profondeurs
  "le-masque-fendu", // Le Masque Fendu
  "colombina-aux-cent-visages", // Colombina aux Cent Visages
  "pantalone-sans-sou", // Pantalone Sans-Sou
  "il-capitano-naufrage", // Il Capitano Naufragé
  "il-dottore-des-noyes", // Il Dottore des Noyés
  "le-regisseur-sans-visage", // Le Régisseur Sans Visage
  "la-clochette-du-rappel", // La Clochette du Rappel
  "le-theatre-englouti", // Le Théâtre Englouti
  "les-coulisses-inondees", // Les Coulisses Inondées
  "changement-de-role", // Changement de rôle !
  "rappel-du-public", // Rappel du Public
  "le-rideau-se-leve", // Le Rideau se Lève
  "arlecchino-celui-derriere-le-masque-abyssal", // Arlecchino, Celui derrière le Masque
  "le-regisseur-des-profondeurs-abyssal", // Le Régisseur des Profondeurs
  // --- Lot 12 — Rapiécer la Coque ---
  "cra-poiscail-medecin",
  "cra-poiscail-medecin-abyssal",
  "cra-poiscail-messager",
  "tas-de-bouts-de-bois",
  "la-prima-noyee",
  "la-prima-noyee-abyssal",
  "arlequin-raccommodeur",
  "trappe-du-souffleur",
  "clous-de-recuperation",
  "etau-du-calfat",
  "sonde-des-courants-perdus",
  "ce-que-la-maree-rend",
];

/**
 * Mini Booster de Bienvenue. Pool DÉRIVÉ de B1, et non écrit à la main :
 * le cadrage le définit par soustraction (« les Abyssales sont exclues par
 * défaut », « le Booster de Bienvenue reste exclu des Cra-Poiscail »), et
 * une liste recopiée divergerait de B1 au premier ajout.
 *
 * Le Théâtre en est exclu pour la même raison que les Cra-Poiscail : une
 * carte d'archétype dans un booster de découverte n'apprend rien et ne
 * mène nulle part tant que le reste de la troupe n'est pas là.
 */
/**
 * B4 — La Veillée des Disparus. Noyau identitaire du Lot 13, complété par
 * ce que le catalogue a déjà de compatible : défausse, Cimetière, attrition.
 *
 * Le cadrage Notion du lot le demande explicitement — « utiliser le Lot 13
 * comme noyau identitaire sans être fermé à la famille », 16 à 18 entrées
 * Un Dead sur le volume du booster. Un booster mono-famille ferait un
 * archétype fermé, exactement ce que l'audit d'équilibrage reproche.
 */
const VEILLEE_DES_DISPARUS: readonly string[] = [
  // --- Le noyau Un Dead (Lot 13) ---
  "ptit-bout",
  "cache-cache",
  "doudou",
  "encore-cinq-minutes",
  "le-gouter",
  "papa-est-en-mer",
  "promis-jattends",
  "la-petite-chanson",
  "on-rentre-bientot",
  "maman-revient",
  "le-copain-du-dessous",
  "la-marelle",
  "bonne-nuit",
  "tout-le-monde-a-table",
  "on-avait-dit-tous-ensemble",
  "maman-revient-abyssal",
  // --- Compléments génériques : défausse et filtrage de main ---
  "epave-a-fleur-deau",
  "lettre-jamais-ouverte",
  "journal-de-bord-detrempe",
  "rations-du-matin-gris",
  "bibliotheque-salee",
  "mousse-des-quarts",
  "gabier-au-carnet-mouille",
  "le-masque-fendu",
  // --- Cimetière et récupération ---
  "grappin-de-recuperation",
  "plongeur-des-epaves",
  "mecanicien-aux-mains-noires",
  "charpentier-des-epaves",
  "caisse-des-dernieres-planches",
  // --- Attrition et tenue de ligne ---
  "marin-des-jetees",
  "crabe-de-fer",
  "chose-des-hauts-fonds",
  "thermos-du-dernier-quart",
  "vieux-loup-de-mer",
  "plaque-de-fortune",
];

const BIENVENUE: readonly string[] = DEFAUT.filter((cardId) => {
  const def = CORE_SET.find((card) => card.id === cardId);
  if (!def) return false;
  if (cardId.endsWith("-abyssal")) return false;
  if (def.archetype) return false;
  return def.setCode === undefined || def.setCode === "core";
});

/** Cartes éligibles par booster. La base en est le miroir (`booster_pool_cards`). */
export const BOOSTER_POOLS: Readonly<Record<string, readonly string[]>> = {
  [BOOSTER_DEFAUT]: DEFAUT,
  [BOOSTER_POISSONS_PAS_FRAIS]: POISSONS_PAS_FRAIS,
  [BOOSTER_ETRANGETE_SOUS_MARINE]: ETRANGETE_SOUS_MARINE,
  [BOOSTER_VEILLEE_DES_DISPARUS]: VEILLEE_DES_DISPARUS,
  [BOOSTER_BIENVENUE]: BIENVENUE,
};

/**
 * Boosters ACHETABLES, dans l'ordre d'affichage du Market. Le Mini Booster
 * de Bienvenue n'en fait pas partie : il n'est pas achetable.
 */
export const PURCHASABLE_BOOSTER_IDS: readonly string[] = [
  BOOSTER_DEFAUT,
  BOOSTER_POISSONS_PAS_FRAIS,
  BOOSTER_ETRANGETE_SOUS_MARINE,
  BOOSTER_VEILLEE_DES_DISPARUS,
];

/** Boosters dans lesquels cette carte peut tomber — vide si elle n'est dans aucun. */
export function boostersContaining(cardId: string): string[] {
  return Object.entries(BOOSTER_POOLS)
    .filter(([, cardIds]) => cardIds.includes(cardId))
    .map(([boosterId]) => boosterId);
}

/**
 * Cartes du catalogue qui ne tombent dans AUCUN booster — donc
 * inobtenables. La liste est VIDE depuis le rattachement des trois
 * dernières orphelines (Guetteur Méfiant en B1, Revenante de la Fosse —
 * ABYSSALE en B2, Masse-Sombre — ABYSSALE en B3, arbitrage du 18/09/2026) :
 * le test de couverture l'exige, pour qu'une carte ajoutée sans booster se
 * voie tout de suite au lieu de rester inobtenable en silence.
 */
export function unobtainableCardIds(): string[] {
  const inAnyPool = new Set(Object.values(BOOSTER_POOLS).flat());
  return CORE_SET.filter((def) => !inAnyPool.has(def.id)).map((def) => def.id);
}
