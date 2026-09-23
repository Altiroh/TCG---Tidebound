import { ARCHETYPE_LABELS, type ArchetypeId } from "@/game/cards/archetypes";
import {
  BOOSTER_BIENVENUE,
  BOOSTER_DEFAUT,
  BOOSTER_ECLATS_EN_SELLE,
  BOOSTER_ETRANGETE_SOUS_MARINE,
  BOOSTER_POISSONS_PAS_FRAIS,
  BOOSTER_NECESSAIRE_DU_MARIN,
  BOOSTER_VEILLEE_DES_DISPARUS,
} from "@/game/boosters/pools";

/**
 * CE QU'UN BOOSTER RACONTE — l'extension dont il vient, et son histoire.
 *
 * La base ne dit d'un booster que son nom, son nombre de cartes et son
 * prix (`booster_definitions`). C'est assez pour le vendre, pas pour le
 * comprendre : devant le rayon, le joueur voyait quatre sachets, quatre
 * noms et aucune raison de préférer l'un à l'autre. Ce fichier ajoute les
 * deux choses qui manquaient — de quelle EXTENSION vient le sachet, et ce
 * qu'on achète vraiment en l'ouvrant.
 *
 * DONNÉE DE MOTEUR, pas d'interface : le texte est du contenu de jeu, au
 * même titre que celui d'une carte, et il doit pouvoir être relu par un
 * test comme par un script. Aucun rendu ici.
 *
 * ── Sur le nom de l'archétype ────────────────────────────────────────
 *
 * La règle du 2026-09-14 (`game/cards/archetypes.ts`) dit qu'aucun
 * archétype n'est nommé côté joueur : le joueur reconnaît une famille à
 * ses noms et ses illustrations, pas à un badge sur le cadre. Elle reste
 * entière POUR LA CARTE.
 *
 * Elle ne vaut pas pour le PRODUIT (décision du 19/09/2026). Un booster
 * n'est pas une carte : c'est ce qu'on achète, et on doit savoir ce qu'il
 * y a dedans avant de payer. « Extension · Un Dead » est une promesse
 * commerciale, pas une étiquette de règles.
 *
 * L'archétype n'est annoncé que s'il DOMINE réellement le pool — le seuil
 * et le décompte sont vérifiés par `tests/game/boosterExtensions.test.ts`,
 * pour qu'une promesse ne puisse pas survivre à la liste qui la fondait.
 */

/**
 * Un booster de BASE porte le catalogue commun ; un booster d'EXTENSION
 * porte un lot et son identité. Le joueur doit pouvoir les distinguer
 * avant d'ouvrir, pas après.
 */
export type BoosterKind = "base" | "extension";

export interface BoosterExtension {
  boosterId: string;
  /**
   * Nom commercial, tel que `booster_definitions.name` le porte en base.
   *
   * Dupliqué ici À DESSEIN : la Collection filtre par booster côté client,
   * dans un composant qui ne peut pas interroger la base, et le laboratoire
   * de layout (`previewInventory`) en gardait déjà sa propre copie. Une
   * seule copie vaut mieux que deux. La BASE reste la source de vérité du
   * produit — prix, nombre de cartes, disponibilité — et
   * `tests/game/boosterExtensions.test.ts` garde ces noms sous surveillance.
   */
  name: string;
  kind: BoosterKind;
  /**
   * Archétype dominant du pool, `null` si aucune famille ne s'y détache.
   * On ne promet que ce que la liste tient (voir l'en-tête).
   */
  archetype: ArchetypeId | null;
  /**
   * Nom annoncé à la place d'une famille, quand le design le TRANCHE pour un
   * pool qui en réunit plusieurs (Éclats en Selle : Verre, Cavalerie et
   * Sentinelles — « le libellé reste sur Éclats en Selle », 23/09/2026).
   * Il prime sur la règle du seuil : c'est une décision, pas une mesure.
   */
  familyLabel?: string;
  /**
   * Une ligne, sous le titre — ce que le sachet dit de lui-même.
   *
   * UNE seule, littéralement : la fiche l'affiche sans retour à la ligne
   * (`.panelTagline`), dans une colonne étroite. Au-delà d'une trentaine
   * de signes, elle s'y termine en points de suspension — le test borne
   * donc sa longueur.
   */
  tagline: string;
  /** L'histoire derrière le booster : trois à cinq lignes, jamais des règles. */
  lore: string;
}

/**
 * Part du pool qu'un archétype doit occuper pour être ANNONCÉ. Sous ce
 * seuil, la famille est présente mais le booster n'est pas « le sien » :
 * l'annoncer vendrait une liste que le sachet ne rend pas.
 */
export const ARCHETYPE_DOMINANCE_THRESHOLD = 0.4;

/**
 * Décomptes relevés le 19/09/2026 sur `BOOSTER_POOLS` (le test les
 * recalcule, ils n'ont pas à être crus sur parole) :
 *
 *   standard               61 entrées — cra-poiscail 8            (13 %)
 *   poissons-pas-frais     65 entrées — cra-poiscail 10           (15 %)
 *   etrangete-sous-marine  64 entrées — cra-poiscail 19           (30 %)
 *   la-veillee-des-disparus 37 entrées — un-dead 18               (49 %)
 *
 * Un seul booster dépasse le seuil, et c'est le seul qui annonce sa
 * famille. « Étrangeté sous-marine » en est le cas limite intéressant :
 * 19 Cra-Poiscail et 20 Marionnettes s'y partagent le pool à une carte
 * près — deux familles, donc aucune. Son texte le dit en toutes lettres
 * plutôt que d'en couronner une au hasard.
 */
const EXTENSIONS: readonly BoosterExtension[] = [
  {
    boosterId: BOOSTER_DEFAUT,
    name: "Booster Défaut",
    kind: "base",
    archetype: null,
    tagline: "Le fond du coffre",
    lore:
      "Tout équipage commence par le même inventaire : une lanterne, une corde, un nom qu'on répète pour ne pas " +
      "l'oublier. Le Booster Défaut rassemble ce que la mer exige avant d'exiger le reste — de quoi tenir un quart, " +
      "lire une Marée, et comprendre pourquoi personne ne se penche au bastingage après la tombée du jour.",
  },
  {
    // Le seul booster de BASE avec le Défaut : il ne raconte rien, il
    // outille. D'où le `kind` — l'étagère annonce « Booster de base », et
    // c'est exact : son pool n'est pas un lot narratif, c'est le socle
    // commun que tous les decks partagent.
    boosterId: BOOSTER_NECESSAIRE_DU_MARIN,
    name: "Nécessaire du Marin",
    kind: "base",
    archetype: null,
    tagline: "Ce qu'il faut à bord",
    lore:
      "Aucun équipage ne part avec des histoires. Il part avec une gaffe, un filet, de quoi colmater et de quoi " +
      "couper. Le Nécessaire du Marin rassemble ce qu'on n'a jamais assez : les pièges qu'on tend avant d'en " +
      "avoir besoin, les objets qu'on garde en main pour le tour d'en face, et les quelques poids lourds qu'on " +
      "n'appelle qu'une fois par traversée.",
  },
  {
    boosterId: BOOSTER_POISSONS_PAS_FRAIS,
    name: "Poissons pas frais",
    kind: "extension",
    archetype: null,
    tagline: "Ce que le filet ramène",
    lore:
      "Il y a la pêche, et il y a ce qui s'y accroche. Poissons pas frais rassemble ce qu'on ne mange pas : des " +
      "bêtes qui ont trop vécu en bas, des objets qu'on casse volontiers parce qu'ils rendent mieux en partant, et " +
      "des marées qu'on apprend enfin à retourner. L'odeur prévient longtemps avant les dents.",
  },
  {
    boosterId: BOOSTER_ETRANGETE_SOUS_MARINE,
    name: "Étrangeté sous-marine",
    kind: "extension",
    archetype: null,
    tagline: "La mer cesse d'imiter la mer",
    lore:
      "Étrangeté sous-marine réunit ce qui se joue en bas sans public. Une troupe masquée qui rejoue la même scène " +
      "jusqu'à ce qu'elle tombe juste. Une cour minuscule qui se prend pour un royaume et se bat pour de vrai. Et, " +
      "au fond de la salle, quelques choses assez grandes pour qu'on ait renoncé à les nommer.",
  },
  {
    boosterId: BOOSTER_VEILLEE_DES_DISPARUS,
    name: "La Veillée des Disparus",
    kind: "extension",
    archetype: "un-dead",
    tagline: "Les ombres se souviennent",
    lore:
      "Des feux se rallument dans la brume, et des voix s'élèvent depuis les flots. La Veillée des Disparus explore " +
      "la frontière entre la mémoire et l'oubli : les petits qui attendent encore sur le quai, les promesses qu'on " +
      "leur a faites pour qu'ils patientent, et tout ce qu'un équipage laisse derrière lui sans jamais l'avouer.",
  },
  {
    // Trois familles dans un même sachet. Les Sentinelles y pèsent 25 cartes
    // sur 61 (41 %), au-dessus du seuil d'annonce — mais le design a tranché
    // (23/09/2026) : le rayon annonce le LOT, pas l'une de ses trois familles.
    boosterId: BOOSTER_ECLATS_EN_SELLE,
    name: "Éclats en Selle",
    kind: "extension",
    archetype: null,
    familyLabel: "Éclats en Selle",
    tagline: "Du verre, des bêtes, des pierres",
    lore:
      "Un équipage qui se fêle et tient quand même, des Bêtes de guerre que personne n'appelle plus qu'à la " +
      "dernière extrémité, et des marins qui ont trouvé au fond des pierres de couleur qui répondent les unes aux " +
      "autres. Éclats en Selle réunit ce qui brille parce que ça a été brisé — et ce qui charge quand plus rien ne " +
      "tient la ligne.",
  },
];

const BY_ID: ReadonlyMap<string, BoosterExtension> = new Map(EXTENSIONS.map((entry) => [entry.boosterId, entry]));

/**
 * Les boosters PRÉSENTÉS au joueur, dans l'ordre du rayon : le booster de
 * base d'abord, les extensions ensuite, de la plus ancienne à la plus
 * récente. C'est cette liste que l'écran affiche — possédée ou non,
 * chacune y a sa place, sinon le joueur ne sait pas ce qui existe.
 *
 * Le Mini Booster de Bienvenue n'y est PAS : il ne s'achète pas, il se
 * reçoit au tutoriel. Le poser sur l'étagère en ferait un produit dont le
 * bouton Market resterait éteint sans qu'on sache pourquoi.
 */
export const BOOSTER_EXTENSIONS: readonly BoosterExtension[] = EXTENSIONS;

/** Les identifiants du rayon, dans l'ordre d'affichage. */
export const SHELF_BOOSTER_IDS: readonly string[] = EXTENSIONS.map((entry) => entry.boosterId);

/** Boosters qui existent mais ne sont pas un produit — hors rayon. */
export const OFF_SHELF_BOOSTER_IDS: readonly string[] = [BOOSTER_BIENVENUE];

export function boosterExtension(boosterId: string): BoosterExtension | undefined {
  return BY_ID.get(boosterId);
}

/**
 * La ligne « Extension » du panneau : « Booster de base », « Booster
 * d'extension », ou « Booster d'extension · Un Dead » quand la famille
 * domine assez le pool pour être promise.
 */
export function boosterExtensionLabel(boosterId: string): string {
  const entry = BY_ID.get(boosterId);
  if (!entry) return "Booster";
  if (entry.kind === "base") return "Booster de base";
  if (entry.familyLabel) return `Booster d'extension · ${entry.familyLabel}`;
  if (!entry.archetype) return "Booster d'extension";
  return `Booster d'extension · ${ARCHETYPE_LABELS[entry.archetype]}`;
}
