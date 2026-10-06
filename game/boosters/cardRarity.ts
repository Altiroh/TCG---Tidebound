import { CORE_SET } from "@/game/cards/sets/core";
import type { CardRarity } from "@/game/boosters/types";

/**
 * Rareté carte par carte — donnée de COLLECTION, pas de gameplay.
 *
 * Elle ne vit donc pas dans `CardDefinition` (le moteur ne la lit jamais)
 * mais ici, et c'est cette table que `scripts/seedCards.ts` pousse dans
 * `cards.rarity`. La base reste la source de vérité à l'exécution ; ce
 * fichier est la source de vérité VERSIONNÉE qui l'alimente.
 *
 * Origine des valeurs : Notion "Audit cartes — équilibre, rareté & limites"
 * (audit carte par carte, 80 entrées). Trois écarts assumés avec cet audit,
 * qui n'a pas encore été repassé sur le catalogue actuel (98 cartes) :
 *
 *  1. L'audit désigne les cartes par NOM affiché, et plusieurs noms ont
 *     changé depuis ("L'Homme Revenu de la Fosse" → "Revenante de la
 *     Fosse", "Charpentier de Bord" → "Gabière du Grand Large", "Masse
 *     Noire" → "Masse-Sombre"). Le mapping se fait donc par SLUG, stable,
 *     conformément à la convention technique de l'audit lui-même.
 *  2. Les variantes Abyssales (`*-abyssal`) sont postérieures à l'audit.
 *     Règle appliquée : une variante Abyssale est « une version légendaire
 *     et beaucoup plus rare d'une carte existante » (Notion "Catalogue de
 *     cartes"), donc rareté `abyssal` par construction.
 *  3. Les cartes absentes de l'audit sont regroupées en fin de fichier avec
 *     une valeur PROVISOIRE explicite. Elles sont à valider par le design.
 *
 * Garde-fou : `assertRarityCoverage()` (et le test
 * `tests/game/cardRarity.test.ts`) échouent si une carte du catalogue n'a
 * pas d'entrée ici. C'est volontaire — sans ça, une carte ajoutée retombe
 * silencieusement en `common` et déséquilibre tous les boosters sans que
 * rien ne le signale.
 */

/** Raretés issues directement de l'audit carte par carte. */
const AUDITED_RARITY: Record<string, CardRarity> = {
  // --- Communes ---------------------------------------------------------
  "marin-des-jetees": "common",
  "murene-aveugle": "common",
  "poisson-lanterne": "common",
  "caisses-arrimees": "common",
  "brise-vague-de-fortune": "common",
  "harpon-de-pont": "common",
  "cartes-des-courants": "common",
  "marin-aux-yeux-rouges": "common",
  "matelot-du-sans-nom": "common",
  "epave-a-fleur-deau": "common",
  "matelot-insomniaque": "common",
  "poisson-aux-dents-de-verre": "common",
  "treuil-rouille": "common",
  "lampe-de-pont-rouge": "common",
  "filet-a-la-derive": "common",
  "harponneur-du-dernier-quai": "common",
  "requin-balafre": "common",
  "mousse-du-premier-quart": "common",
  "charpentier-de-bord": "common",
  "barracuda-des-hauts-fonds": "common",
  "bernard-lermite-dacier": "common",
  "corde-de-remorquage": "common",
  "meduse-des-lanternes": "common",

  // --- Peu communes -----------------------------------------------------
  "chose-des-hauts-fonds": "uncommon",
  "thermos-du-dernier-quart": "uncommon",
  "cloche-dalerte": "uncommon",
  "anguille-des-profondeurs": "uncommon",
  "crabe-de-fer": "uncommon",
  "plaque-de-fortune": "uncommon",
  "lanterne-aux-verres-noirs": "uncommon",
  "cage-de-flottaison": "uncommon",
  "contremaitre-des-amarres": "uncommon",
  "poisson-scie-gris": "uncommon",
  "kit-de-calfatage": "uncommon",
  "levier-de-lest": "uncommon",
  "grappin-de-recuperation": "uncommon",
  "mecanicien-aux-mains-noires": "uncommon",
  "regulateur-de-courant": "uncommon",
  "sondeur-des-mauvaises-eaux": "uncommon",

  // --- Rares ------------------------------------------------------------
  "vieux-loup-de-mer": "rare",
  "cylindre-flottant": "rare",
  // Anti-swarm (21/09/2026) : la Nasse est une réponse ciblée et
  // conditionnelle, donc rare ; le Rôle d'Équipage est une taxe lente et
  // lisible, donc commune.
  "la-nasse-trop-pleine": "rare",
  "le-role-dequipage": "common",
  "raie-des-fosses": "rare",
  "la-chose-qui-remonte": "rare",
  "balise-des-profondeurs": "rare",
  "masse-sombre": "rare",
  "treuil-a-chair": "rare",
  "second-au-visage-pale": "rare",
  "chaine-de-fer-noir": "rare",
  "carcasse-renversee": "rare",
  "compas-aux-aiguilles-noires": "rare",
  "bouee-de-rappel": "rare",
  "horloge-de-maree": "rare",

  /*
   * --- Le haut du catalogue -------------------------------------------
   *
   * RÈGLE VERROUILLÉE (design, 2026-09-16) : **une carte Abyssale est la
   * variante `-abyssal`, et rien d'autre.** Une carte sans ce suffixe
   * plafonne à `legendary`, quel que soit son registre.
   *
   * Ces neuf entrées valaient `abyssal` parce que l'audit les désignait
   * ainsi à une époque où la variante Abyssale n'existait pas encore comme
   * mécanique. La rareté était restée accrochée à l'ID de base : elle
   * suivait l'identifiant au lieu de suivre la carte. Un emplacement de
   * booster tiré en Abyssale rendait donc la version STANDARD, annoncée
   * « ABYSSALE » par l'écran d'ouverture — bonne étiquette, mauvaise carte.
   *
   * Elles se répartissent selon qu'une variante leur a été SCINDÉE :
   *
   *  - variante `-abyssal` existante → la carte de base n'est plus le haut
   *    de sa lignée, c'est sa variante qui l'est : `epic`.
   *  - aucune variante → rien ne les surclasse, elles restent le sommet de
   *    leur ligne : `legendary`.
   *
   * `tests/game/cardRarity.test.ts` interdit désormais qu'une carte sans le
   * suffixe soit Abyssale : la règle ne peut plus se perdre.
   */

  // Sommet de leur lignée — aucune variante ne les surclasse.
  "lhomme-revenu-de-la-fosse": "legendary",
  "la-gueule-sous-la-mer": "legendary",
  "sept-brasses-plus-bas": "legendary",

  // Versions STANDARD de paires scindées : leur variante `-abyssal` tient
  // le haut du panier, elles prennent le palier juste en dessous.
  "ce-qui-suit-le-navire": "epic",
  "le-fond-vous-regarde": "epic",
  "cloche-du-grand-fond": "epic",


  /*
   * Cartes postérieures à l'audit, arbitrées par le design le 2026-09-12.
   * Raisonnement conservé pour la prochaine passe d'audit :
   *  - `guetteur-mefiant` : Marin utilitaire voisin de Guetteur de Brume
   *    (retiré du catalogue le 02/10/2026).
   *  - `si-raie-ponce` : Créature 3/4 pour 4 avec bascule de Raison selon
   *    l'orientation — registre des Créatures Peu communes.
   *  - `bat-marin` : contourne Garde sur DEUX états de Marée là où
   *    `raie-des-fosses` (Rare, `max_copies` 2) ne le fait qu'en Abysses.
   *    RESTE OUVERT : `max_copies` n'a pas été abaissé à 2, c'est une
   *    décision d'équilibrage distincte de la rareté.
   *  - `chope` : 2 Raison pour 1 (0 en Calme) mais strictement conditionné à
   *    Calme, donc en dessous du `thermos-du-dernier-quart` (Peu commune).
   *  - `wood-vy` / `carape-hus` : posées en Commune, la valeur la moins
   *    structurante pour l'économie.
   */
  "guetteur-mefiant": "uncommon",
  "si-raie-ponce": "uncommon",
  "bat-marin": "rare",
  chope: "common",
  "wood-vy": "common",
  "carape-hus": "common",

  /*
   * Lot 10 — Cra-Poiscail, Booster 1. Raretés VALIDÉES par le design dans
   * la passe d'équilibrage du 2026-09-14 (Notion "Catalogue de cartes",
   * tableau "Lot 10 — paramètres d'équilibrage retenus"), reprises telles
   * quelles : rien n'est déduit ici.
   */
  "tetard-fesse": "common",
  "ptite-fesse": "common",
  "cra-poiscail-grand-gueule": "common",
  "cra-poiscail-sauteur": "common",
  "banc-de-cra-poiscail": "uncommon",
  "le-seau": "common",
  "la-flaque-sacree": "common",
  "fesses-en-avant": "uncommon",

  /* Lot 10 — Cra-Poiscail, Booster 2 (mêmes source et passe d'équilibrage). */
  "cra-poiscail-bavard": "uncommon",
  "cra-poiscail-chef-de-banc": "uncommon",
  "cra-poiscail-ramasseur": "uncommon",
  "cra-poiscail-des-bas-fonds": "common",
  "cra-poiscail-des-hautes-eaux": "common",
  "slip-de-guerre-cra-poiscail": "common",
  "casque-coquille": "common",
  "le-tas-de-trucs": "uncommon",
  "le-trone-de-bouchon": "rare",
  "la-grande-migration": "rare",

  /* Lot 10 — Cra-Poiscail, Booster 3. Les trois variantes Abyssales ne sont
     pas listées : leur suffixe `-abyssal` suffit (règle de design, cf. plus
     haut). */
  "ecuyer-cra-poiscail": "common",
  "chevalier-cra-poiscail": "rare",
  "destrier-du-grand-etang": "uncommon",
  "bourreau-cra-poiscail": "uncommon",
  "cra-poiscail-porte-etendard": "rare",
  "roi-cra-poiscail": "rare",
  "ptite-fesse-grand-reve": "rare",
  "fourchette-du-grand-etang": "uncommon",
  "banniere-en-vieille-chaussette": "uncommon",
  "la-quete-du-grand-nenuphar": "rare",
  "le-grand-saut": "rare",
  "le-tournoi-du-grand-etang": "rare",
};

/**
 * Cartes dont la rareté est posée par défaut EN ATTENDANT l'arbitrage du
 * design. Actuellement vide : les six cartes postérieures à l'audit ont été
 * validées le 2026-09-12 et sont passées dans `AUDITED_RARITY`.
 *
 * Le mécanisme est conservé pour les prochaines cartes : y placer une
 * entrée fait échouer `tests/game/cardRarity.test.ts` tant que le design
 * n'a pas tranché. C'est voulu — un rappel qui bloque vaut mieux qu'un
 * TODO qu'on ne relit jamais.
 */
const PROVISIONAL_RARITY: Record<string, CardRarity> = {};

/**
 * Lot 11 — Les Masques Noyés / Théâtre Englouti. Raretés VALIDÉES par la
 * passe d'équilibrage Notion du 15 septembre 2026, carte par carte : ce
 * n'est pas une table provisoire, elle est directement issue du design.
 *
 * C'est ce lot qui introduit les paliers `epic` et `legendary`.
 */
const THEATRE_ENGLOUTI_RARITY: Record<string, CardRarity> = {
  "pulcinella-gonfle": "common",
  "le-masque-fendu": "common",
  "changement-de-role": "common",
  "arlecchino-des-profondeurs": "uncommon",
  "pantalone-sans-sou": "uncommon",
  "la-clochette-du-rappel": "uncommon",
  "rappel-du-public": "uncommon",
  "colombina-aux-cent-visages": "rare",
  "il-capitano-naufrage": "rare",
  "il-dottore-des-noyes": "rare",
  "le-regisseur-sans-visage": "epic",
  "le-theatre-englouti": "epic",
  "le-rideau-se-leve": "legendary",
  // Les deux variantes Abyssales sont déduites de leur suffixe de slug
  // (`-abyssal`), comme toutes les autres.
};


/**
 * Lot 12 — Rapiécer la Coque. Raretés issues de la passe d'équilibrage
 * Notion du 18/09/2026, carte par carte. Les quatre variantes Abyssales ne
 * sont pas listées : leur suffixe `-abyssal` suffit (règle de design).
 */
const RAPIECER_LA_COQUE_RARITY: Record<string, CardRarity> = {
  /* common */
  "mousse-des-quarts": "common",
  "gabier-au-carnet-mouille": "common",
  "chirurgien-de-coque": "common",
  "pansements-de-coque": "common",
  "rations-du-matin-gris": "common",
  "lettre-jamais-ouverte": "common",
  "sterne-des-embruns": "common",
  "goeland-chapardeur": "common",
  "pelican-des-cales": "common",
  "mouette-du-brise-lames": "common",
  "cra-poiscail-messager": "common",
  "arlequin-raccommodeur": "common",
  /* uncommon */
  "quartier-maitre-des-vivres": "uncommon",
  "charpentiere-de-veille": "uncommon",
  "caisse-de-pieces-seches": "uncommon",
  "bibliotheque-salee": "uncommon",
  "caisse-des-dernieres-planches": "uncommon",
  "longue-vue-rayee": "uncommon",
  "cormoran-de-fer": "uncommon",
  "harnois-de-vigie": "uncommon",
  "cra-poiscail-medecin": "uncommon",
  "tas-de-bouts-de-bois": "uncommon",
  "la-prima-noyee": "uncommon",
  "charpentier-des-epaves": "uncommon",
  "clous-de-recuperation": "uncommon",
  "etau-du-calfat": "uncommon",
  /* rare */
  "capitaine-du-dernier-retour": "rare",
  "journal-de-bord-detrempe": "rare",
  "derniere-planche": "rare",
  "atelier-de-calfatage": "rare",
  "infirmerie-de-pont": "rare",
  "albatros-de-mauvais-temps": "rare",
  "trappe-du-souffleur": "rare",
  "barge-de-reparation": "rare",
  "sonde-des-courants-perdus": "rare",
};

/** Ids dont la rareté n'est pas encore validée par le design. */
export const PROVISIONAL_RARITY_CARD_IDS: readonly string[] = Object.keys(PROVISIONAL_RARITY);

/** Suffixe d'une variante Abyssale (cf. convention technique de l'audit). */
/**
 * Lot 13 — La Veillée des Disparus. Raretés lues telles quelles dans la
 * colonne « Rareté » de la page Notion du lot : elles ne sont pas déduites
 * du coût ni de la puissance, elles sont données par le design.
 */
const VEILLEE_DES_DISPARUS_RARITY: Record<string, CardRarity> = {
  "ptit-bout": "common",
  "cache-cache": "common",
  doudou: "common",
  "encore-cinq-minutes": "common",
  "papa-est-en-mer": "common",
  "le-gouter": "uncommon",
  "promis-jattends": "uncommon",
  "la-petite-chanson": "uncommon",
  "on-rentre-bientot": "uncommon",
  "le-copain-du-dessous": "uncommon",
  "maman-revient": "rare",
  "la-marelle": "rare",
  "bonne-nuit": "rare",
  "tout-le-monde-a-table": "rare",
  "tu-mavais-promis": "rare",
  "tu-viens-jouer": "epic",
  "on-avait-dit-tous-ensemble": "epic",
};

/**
 * Lot 14 — Nécessaire du Marin. Raretés PROVISOIRES, à valider par le
 * design : la page de lot donne les coûts, les stats et les effets, mais
 * pas la rareté carte par carte, contrairement aux Lots 11 à 13.
 *
 * Règle appliquée, faute de mieux et pour qu'elle soit relisible : la
 * rareté suit ce que la carte VERROUILLE. Un outil qu'on veut voir dans
 * tous les decks reste Commune ; une réponse qui décide d'un échange est
 * Rare ; un effet qui referme une partie à lui seul est Épique ou
 * Légendaire, et porte déjà `maxCopies: 1`.
 *
 * Aucune Abyssale : le lot n'en déclare pas. C'est une lacune assumée du
 * lot, pas une omission d'implémentation — le booster tire donc ses
 * Abyssales de rééditions, comme La Veillée des Disparus (cf.
 * `game/boosters/pools.ts`).
 */
const NECESSAIRE_DU_MARIN_RARITY: Record<string, CardRarity> = {
  // --- Structures-pièges ------------------------------------------------
  "cloison-etanche": "common",
  "chaine-de-travers": "common",
  "barils-de-poudre": "uncommon",
  "pont-mine": "uncommon",
  "cale-inondable": "uncommon",
  "derniere-barricade": "uncommon",
  "fausse-cargaison": "uncommon",
  "filet-de-sauvetage": "rare",
  "jugement-du-phare": "epic",

  // --- Anti-swarm / contrôle --------------------------------------------
  "le-pont-est-plein": "common",
  "vague-scelerate": "rare",
  "pas-tous-a-la-fois": "rare",
  "chacun-sa-place": "epic",
  "le-large-se-fache": "epic",

  // --- Pioche / filtrage -------------------------------------------------
  "faire-linventaire": "common",
  "mauvaise-main": "common",
  "un-peu-de-repit": "common",
  "dernieres-reserves": "common",
  "fouille-de-la-cale": "uncommon",

  // --- Objets réactifs / défense ----------------------------------------
  "harpon-a-ressort": "uncommon",
  "bouclier-decume": "uncommon",
  "signal-de-detresse": "uncommon",
  "contre-harpon": "uncommon",
  "corde-de-rappel": "rare",

  // --- Removal / utilitaires --------------------------------------------
  "coup-de-harpon": "common",
  "par-dessus-bord": "common",
  "sabotage-discret": "uncommon",
  "coupez-les-cordages": "uncommon",
  "quon-en-finisse": "rare",
  "charge-de-demolition": "rare",

  // --- Heal / comeback ---------------------------------------------------
  "bandages-humides": "common",
  "trousse-du-bord": "uncommon",
  "reparations-durgence": "uncommon",
  "on-flotte-encore": "rare",

  // --- Marins / Créatures de haut coût -----------------------------------
  "vieux-harponneur": "uncommon",
  "chirurgien-du-bord": "uncommon",
  "le-brise-ligne": "rare",
  "le-dernier-rempart": "rare",
  "lamiral-sans-pavillon": "epic",
  "le-naufrage-impossible": "epic",
  "leviathan-balafre": "legendary",

  // --- Finishers non-unités ----------------------------------------------
  "dernier-jour-en-mer": "epic",
  "abandonnez-le-navire": "epic",
  "la-mer-reprend-tout": "legendary",
};

/**
 * Lot 15 — Éclats en Selle. Raretés ÉVALUÉES le 23/09/2026 (Notion n'en
 * donnait qu'une : le Géant Chromatique, Rare), à confirmer en playtest.
 *
 * Critère : la puissance réelle d'une carte à son coût, et ce qu'elle fait
 * tourner.
 *  - Commune : corps d'identité au niveau de la courbe, outils qu'on veut en
 *    trois exemplaires — un plan à deux couleurs ou un Verre de base doit se
 *    monter sans chance au tirage.
 *  - Peu commune : moteur de famille (Vigie, Verrier, Signal Vert cumulatif),
 *    ou corps qui apporte un effet réel (Canonnier Fêlé).
 *  - Rare : retourne un échange à elle seule — sauvetage (Porte-Éclats),
 *    ressource répétable (Maître Verrier), anti-Garde (Bête de Percée,
 *    Débusquer), enablers de couleur.
 *  - Épique : ce qui referme une partie — La Grande Fissure, Jusqu'à ce que
 *    ça casse, Formation Prismatique.
 * Aucune Légendaire : le palier se replie au tirage. La variante Abyssale du
 * Géant n'est pas listée, son suffixe suffit.
 */
const ECLATS_EN_SELLE_RARITY: Record<string, CardRarity> = {
  // --- Équipage de Verre -----------------------------------------------------
  "eclaireur-ebreche": "common",
  "matelot-fele": "common",
  "duelliste-de-verre": "common",
  "polisseuse-des-felures": "common",
  "vigie-aux-fissures": "uncommon",
  "verrier-de-pont": "uncommon",
  "canonnier-fele": "uncommon",
  "bretteuse-au-bord": "uncommon",
  "porte-eclats": "rare",
  "maitre-verrier": "rare",
  "la-grande-fissure": "epic",
  "eclat-de-bouteille": "common",
  "encore-debout": "common",
  "bouclier-fendu": "common",
  "trinquer-trop-fort": "uncommon",
  "pont-de-verre": "uncommon",
  "jusqua-ce-que-ca-casse": "epic",
  // --- Cavalerie -------------------------------------------------------------
  "monture-de-breche": "common",
  "bete-de-halage": "common",
  "destrier-du-ressac": "common",
  "eclaireur-a-cornes": "uncommon",
  "mufle-au-fanion": "uncommon",
  "chargeur-des-ecueils": "uncommon",
  "vieille-selle": "uncommon",
  "bete-de-percee": "rare",
  "mange-fer": "rare",
  "le-deserteur-gris": "uncommon",
  "la-bete-quon-nattend-plus": "rare",
  "selle-de-guerre": "common",
  "harnais-de-retenue": "common",
  "ouvrez-la-ligne": "common",
  debusquer: "rare",
  "pas-un-pas-de-plus": "uncommon",
  "la-mauvaise-reputation": "common",
  // --- Sentinelles Chromatiques ----------------------------------------------
  "heros-de-la-flamme": "common",
  "gardienne-de-leclat": "common",
  "tacticien-de-lecume": "common",
  "veilleuse-de-lombre": "common",
  "porteur-de-jade": "uncommon",
  "survivant-de-la-mousse": "uncommon",
  "briseur-du-brasier": "uncommon",
  "rempart-du-soleil": "uncommon",
  "stratege-de-lazur": "uncommon",
  "oracle-damethyste": "uncommon",
  "emissaire-de-quartz": "rare",
  "heraut-de-nacre": "rare",
  "appel-des-sentinelles": "common",
  "pierre-retrouvee": "common",
  "poste-chromatique": "common",
  "bracelet-chromatique": "uncommon",
  "transfert-de-pierre": "uncommon",
  "la-premiere-pierre": "uncommon",
  synchronisation: "uncommon",
  "les-couleurs-repondent": "uncommon",
  "bracelet-de-resonance": "rare",
  "formation-prismatique": "epic",
  "le-geant-chromatique": "rare",
};

const ABYSSAL_VARIANT_SUFFIX = "-abyssal";

/**
 * LOT 16 — Les Altérés (Notion « Boosters & économie » § Booster 4,
 * répartition des raretés). Un écart assumé : Notion classe L'Anomalie
 * Première « Abyssale », mais ce n'est pas une variante — la règle
 * verrouillée du 16/09/2026 (« une carte Abyssale est la variante
 * `-abyssal`, sinon au mieux c'est légendaire ») la plafonne à Légendaire.
 * Les Abyssales du booster sont deux vraies variantes, ajoutées le
 * 04/10/2026 (La Chute de l'Ange et Le Diable en Personne) : leur suffixe
 * suffit, elles ne sont pas listées ici.
 */
const ALTERES_RARITY: Record<string, CardRarity> = {
  // --- Communes ---
  linstable: "common",
  "le-dedouble": "common",
  lentendant: "common",
  "le-buveur": "common",
  "le-fendu": "common",
  "le-recousu": "common",
  "alteration-forcee": "common",
  "ils-etaient-deja-la": "common",
  // --- Peu communes ---
  leveilleur: "uncommon",
  lintangible: "uncommon",
  "le-feral": "uncommon",
  "lattire-fer": "uncommon",
  "la-revenante": "uncommon",
  propagation: "uncommon",
  "mutation-reflexe": "uncommon",
  // --- Rares ---
  "le-copieur": "rare",
  "le-meneur": "rare",
  "la-chute-de-lange": "rare",
  surcharge: "rare",
  // --- Épiques ---
  "la-conscience-commune": "epic",
  "le-diable-en-personne": "epic",
  // --- Légendaire (Abyssale dans Notion, voir plus haut) ---
  "lanomalie-premiere": "legendary",
};

/**
 * Landes (05/10/2026, Notion « Boosters & économie » § Terrains
 * Légendaires) : Légendaires toutes trois — elles transforment la partie
 * entière. Leur limite de deck (×2) est portée par la carte, pas par le
 * palier.
 */
const LANDES_RARITY: Record<string, CardRarity> = {
  "pluie-corrosive": "legendary",
  "chaine-de-construction": "legendary",
  "vallee-de-verre": "legendary",
  // Réponses aux Landes (Notion, 05/10/2026).
  "lever-lancre": "rare",
  "cartographe-opalin-mefiant": "uncommon",
  "zone-de-repli": "rare",
};

/**
 * LOT 17 — Dungeon et Ladalle / Opalins (Notion « Lot 15 — Dungeon et
 * Ladalle / Opalins — VALIDÉ », 05/10/2026). Eidolon Opalin LVX existe en
 * deux versions : la variante ABYSSALE de Notion (suffixe `-abyssal`, qui
 * suffit) et la version standard ajoutée le 06/10/2026.
 */
const LOT17_RARITY: Record<string, CardRarity> = {
  "gaston-aventurier-de-ladalle": "common",
  "miss-franche-comte-1987-roublarde-aux-des-pipes": "rare",
  "balthazar-mage-approximatif": "rare",
  "frere-michel-clerc-de-secours": "common",
  "hubert-paladin-persuade-d-etre-l-elu": "rare",
  "gege-rodeur-du-mauvais-chemin": "uncommon",
  "barnabe-barde-insupportable": "uncommon",
  "maurice-ecuyer-de-troisieme-choix": "common",
  "gnome-du-sac-sans-fond": "uncommon",
  "le-nain-qui-connait-un-raccourci": "common",
  "brigitte-druidesse-des-caves": "uncommon",
  "norbert-necromancien-amateur": "rare",
  "dede-moine-du-premier-degre": "common",
  "rita-sorciere-sous-contrat": "rare",
  "le-geant-qui-croyait-etre-discret": "rare",
  "le-mimique-du-coffre-evidemment-piege": "uncommon",
  "maitre-de-ladalle": "legendary",
  "l-aventurier-de-niveau-beaucoup-trop-eleve": "legendary",
  "de-pipe": "common",
  "relance-j-te-jure": "common",
  "c-etait-presque-un-six": "uncommon",
  "double-tentative": "uncommon",
  "de-du-destin-tres-officiel": "rare",
  "on-retourne-a-l-auberge": "uncommon",
  "j-avais-oublie-mon-sac": "common",
  "plan-du-donjon-mal-dessine": "uncommon",
  "le-donjon-de-ladalle": "rare",
  "la-taverne-avant-le-donjon": "uncommon",
  "nerhal-opalin-des-marees": "rare",
  "orram-opalin-des-memoires": "rare",
  "kaor-opalin-des-reliques": "rare",
  "velm-opalin-des-armures": "uncommon",
  "seren-opalin-du-silence": "rare",
  "tharos-opalin-des-brisants": "rare",
  "elyor-opalin-du-retour": "uncommon",
  "merai-opalin-des-profondeurs": "rare",
  "avar-opalin-des-structures": "rare",
  "sila-opalin-du-large": "uncommon",
  "morhal-opalin-des-navires": "legendary",
  "ylenn-opalin-de-la-main-close": "rare",
  "dhar-opalin-du-premier-coup": "rare",
  "astel-opalin-de-la-derniere-veille": "legendary",
  "eidolon-opalin-lv1": "rare",
  "eidolon-opalin-lv5": "epic",
  // Version STANDARD (06/10/2026) : le plafond d'une carte sans suffixe ; sa variante `-abyssal` est l'Abyssale du lot.
  "eidolon-opalin-lvx": "legendary",
  // Ajoutées au nettoyage du 06/10/2026.
  "banquet-ancestral": "uncommon",
  "corne-du-rassemblement": "uncommon",
  "veille-des-niveaux": "uncommon",
  "fragment-d-eveil": "rare",
  "sommeil-de-pierre": "uncommon",
  "cartographe-du-large": "common",
  "aventuriere-en-retard": "common",
  "mousse-superstitieux": "uncommon",
  "gardien-des-balises": "common",
  "boussole-fendue": "common",
  "piece-porte-bonheur": "uncommon",
  "carte-detrempee": "common",
  "campement-provisoire": "uncommon",
  "tour-de-guet-mobile": "common",
  "maree-imprevisible": "uncommon",
  "calme-trompeur": "rare",
  "terres-inconnues": "rare",
};

/**
 * Rareté d'une carte. Les variantes Abyssales sont déduites de leur slug
 * plutôt que listées une par une : c'est une règle de design, pas une
 * décision carte par carte, et ça évite d'oublier une variante ajoutée
 * plus tard.
 */
export function rarityForCardId(cardId: string): CardRarity | null {
  if (cardId.endsWith(ABYSSAL_VARIANT_SUFFIX)) return "abyssal";
  return (
    AUDITED_RARITY[cardId] ??
    THEATRE_ENGLOUTI_RARITY[cardId] ??
    RAPIECER_LA_COQUE_RARITY[cardId] ??
    VEILLEE_DES_DISPARUS_RARITY[cardId] ??
    NECESSAIRE_DU_MARIN_RARITY[cardId] ??
    ECLATS_EN_SELLE_RARITY[cardId] ??
    ALTERES_RARITY[cardId] ??
    LANDES_RARITY[cardId] ??
    LOT17_RARITY[cardId] ??
    PROVISIONAL_RARITY[cardId] ??
    null
  );
}

/** Ids du catalogue sans rareté explicite — doit toujours être vide. */
export function cardIdsMissingRarity(): string[] {
  return CORE_SET.filter((def) => rarityForCardId(def.id) === null).map((def) => def.id);
}

/**
 * Échoue si une carte du catalogue n'a pas de rareté. Appelée par
 * `scripts/seedCards.ts` AVANT toute écriture : mieux vaut un seed qui
 * refuse de tourner qu'une base où la moitié du catalogue est Commune par
 * défaut et où tous les boosters sont faux sans que rien ne l'indique.
 */
export function assertRarityCoverage(): void {
  const missing = cardIdsMissingRarity();
  if (missing.length === 0) return;
  throw new Error(
    `Rareté manquante pour ${missing.length} carte(s) : ${missing.join(", ")}.\n` +
      "Ajoute-les dans game/boosters/cardRarity.ts (table auditée, ou table provisoire si le design n'a pas tranché)."
  );
}
