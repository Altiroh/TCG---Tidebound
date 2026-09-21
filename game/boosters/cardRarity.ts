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
  "bouee-de-derive": "common",
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
  "radeau-de-fortune": "common",
  "meduse-des-lanternes": "common",

  // --- Peu communes -----------------------------------------------------
  "plongeur-des-epaves": "uncommon",
  "chose-des-hauts-fonds": "uncommon",
  "thermos-du-dernier-quart": "uncommon",
  "cloche-dalerte": "uncommon",
  "ancre-de-derive": "uncommon",
  "guetteur-de-brume": "uncommon",
  "anguille-des-profondeurs": "uncommon",
  "crabe-de-fer": "uncommon",
  "plaque-de-fortune": "uncommon",
  "cartographe-du-large": "uncommon",
  "gardien-du-sondeur": "uncommon",
  "lanterne-aux-verres-noirs": "uncommon",
  "cage-de-flottaison": "uncommon",
  "ponton-aux-cloches": "uncommon",
  "contremaitre-des-amarres": "uncommon",
  "poisson-scie-gris": "uncommon",
  "kit-de-calfatage": "uncommon",
  "epaves-accrochees": "uncommon",
  "levier-de-lest": "uncommon",
  "grappin-de-recuperation": "uncommon",
  "mecanicien-aux-mains-noires": "uncommon",
  "masque-de-plongee-fissure": "uncommon",
  "le-filet-qui-respire": "uncommon",
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
  "quelque-chose-sous-la-coque": "rare",
  "le-chant-sous-la-ligne": "rare",
  "raie-des-fosses": "rare",
  "la-chose-qui-remonte": "rare",
  "epave-engloutie": "rare",
  "balise-des-profondeurs": "rare",
  "les-voix-dans-le-sillage": "rare",
  "capitaine-sans-sommeil": "rare",
  "masse-sombre": "rare",
  "treuil-a-chair": "rare",
  "la-bouee-qui-regardait": "rare",
  "second-au-visage-pale": "rare",
  "veilleur-des-profondeurs": "rare",
  "baleine-aux-cicatrices-blanches": "rare",
  "chaine-de-fer-noir": "rare",
  "carcasse-renversee": "rare",
  "cloche-immergee": "rare",
  "compas-aux-aiguilles-noires": "rare",
  "bouee-de-rappel": "rare",
  "horloge-de-maree": "rare",
  "ancre-de-tempete": "rare",

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
  "ils-sont-sous-nous": "epic",
  "loeil-sous-la-mer": "epic",
  "le-fond-vous-regarde": "epic",
  "cloche-du-grand-fond": "epic",
  "la-mer-reclame-davantage": "epic",


  /*
   * Cartes postérieures à l'audit, arbitrées par le design le 2026-09-12.
   * Raisonnement conservé pour la prochaine passe d'audit :
   *  - `guetteur-mefiant` : Marin utilitaire voisin de `guetteur-de-brume`.
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
  "les-coulisses-inondees": "uncommon",
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
  "ce-que-la-maree-rend": "rare",
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

const ABYSSAL_VARIANT_SUFFIX = "-abyssal";

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
