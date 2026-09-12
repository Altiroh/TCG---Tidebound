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

  // --- Abyssales --------------------------------------------------------
  "lhomme-revenu-de-la-fosse": "abyssal",
  "ce-qui-suit-le-navire": "abyssal",
  "ils-sont-sous-nous": "abyssal",
  "loeil-sous-la-mer": "abyssal",
  "le-fond-vous-regarde": "abyssal",
  "cloche-du-grand-fond": "abyssal",
  "la-mer-reclame-davantage": "abyssal",

  /*
   * Les deux grandes Anomalies de la passe « nouvelle grammaire de Marée ».
   * L'audit ne leur donne pas de ligne de rareté mais les classe en
   * « nouvelles cartes à très haut risque », `max_copies` 1, « événement
   * exceptionnel » : Abyssale est la seule lecture cohérente.
   */
  "la-gueule-sous-la-mer": "abyssal",
  "sept-brasses-plus-bas": "abyssal",

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

/** Ids dont la rareté n'est pas encore validée par le design. */
export const PROVISIONAL_RARITY_CARD_IDS: readonly string[] = Object.keys(PROVISIONAL_RARITY);

/** Suffixe d'une variante Abyssale (cf. convention technique de l'audit). */
const ABYSSAL_VARIANT_SUFFIX = "-abyssal";

/**
 * Rareté d'une carte. Les variantes Abyssales sont déduites de leur slug
 * plutôt que listées une par une : c'est une règle de design, pas une
 * décision carte par carte, et ça évite d'oublier une variante ajoutée
 * plus tard.
 */
export function rarityForCardId(cardId: string): CardRarity | null {
  if (cardId.endsWith(ABYSSAL_VARIANT_SUFFIX)) return "abyssal";
  return AUDITED_RARITY[cardId] ?? PROVISIONAL_RARITY[cardId] ?? null;
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
