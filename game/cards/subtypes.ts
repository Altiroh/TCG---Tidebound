import type { CardDefinition } from "@/game/cards/types";

/**
 * SOUS-TYPES — étiquettes de jeu qu'une carte PORTE et que les effets
 * peuvent viser (« vos Marionnettes », « un Volatile », « chaque Pirate »).
 *
 * Notion, « Piste de design — Sous-types transversaux des cartes »
 * (08/10/2026) : distinguer le TYPE (Créature, Objet…), les SOUS-TYPES,
 * transversaux, et l'ARCHÉTYPE (la famille, Cra-Poiscail…). Un sous-type se
 * partage entre archétypes : c'est lui qui fait passer une synergie d'une
 * famille à l'autre (un Cra-Poiscail Chevalier profite des effets
 * Chevalier ; « vos Pirates gagnent +1 Puissance » touche les Pirates de
 * toutes les familles).
 *
 * Le vocabulaire ne garde que ce qu'une carte porte (ménage du 09/10/2026 :
 * Marchand, Chasseur, Spectral, Trésor, Arme, Armure, Fortification
 * retirés faute de porteur) ; un sous-type revient avec sa première carte.
 *
 * Une carte en porte au plus `MAX_SUBTYPES`, affichés sous son type. Le
 * vocabulaire est FERMÉ : un sous-type nouveau s'ajoute ici, avec son
 * libellé, jamais en texte libre sur une carte (pas de synonymes — « Oiseau »
 * et « Volatile » ne doivent pas désigner la même chose par deux noms).
 *
 * Les identifiants sont FIGÉS : des effets les nomment (`filter.subtype`,
 * `sourceFilter.subtype`…). On en ajoute, on n'en renomme jamais.
 */
export const SUBTYPE_LABELS = {
  // --- Familles de jeu historiques (déjà lues par des effets) ------------
  marionnette: "Marionnette",
  "un-dead": "Un Dead",
  volatile: "Volatile",
  cavalerie: "Cavalerie",
  altere: "Altéré",
  "eclat-chromatique": "Éclat",
  "objet-flottant": "Objet flottant",
  objet: "Objet",

  // --- Espèces ----------------------------------------------------------
  // Pas d'« Oiseau » : l'espèce existe déjà sous le nom de VOLATILE, que les
  // textes de cartes emploient (« vos Volatiles ») — deux noms pour une
  // même chose, c'est le synonyme que Notion demande d'éviter.
  humain: "Humain",
  poisson: "Poisson",
  amphibien: "Amphibien",
  squelette: "Squelette",
  crustace: "Crustacé",
  // Ajouts du 09/10/2026, validés carte par carte (Atelier des sous-types).
  bete: "Bête",
  reptile: "Reptile",
  monstre: "Monstre",
  metahumain: "Métahumain",
  "homme-poisson": "Homme-poisson",
  "homme-bete": "Homme-bête",
  gobelin: "Gobelin",
  gnome: "Gnome",
  nain: "Nain",
  troll: "Troll",
  geant: "Géant",
  dragon: "Dragon",
  fantome: "Fantôme",
  "mort-vivant": "Mort-vivant",
  // 09/10/2026 : On joue aux morts (Lot 18).
  grenouille: "Grenouille",

  // --- Rôles ------------------------------------------------------------
  pirate: "Pirate",
  chevalier: "Chevalier",
  gardien: "Gardien",
  // Ajouts du 09/10/2026, validés carte par carte (Atelier des sous-types).
  soigneur: "Soigneur",
  mage: "Mage",
  hero: "Héros",
  voleur: "Voleur",
  necromancien: "Nécromancien",

  // --- Natures ----------------------------------------------------------
  mecanique: "Mécanique",
  maudit: "Maudit",
  sauvage: "Sauvage",
  mythique: "Mythique",
} as const;

export type SubtypeId = keyof typeof SUBTYPE_LABELS;

/** Familles du vocabulaire, pour les outils (filtres de collection, conformité). */
export const SUBTYPE_FAMILIES: Readonly<Record<string, readonly SubtypeId[]>> = {
  jeu: ["marionnette", "un-dead", "cavalerie", "altere", "eclat-chromatique", "objet-flottant", "objet"],
  especes: [
    "volatile", "humain", "poisson", "amphibien", "squelette", "crustace", "bete", "reptile", "monstre",
    "metahumain", "homme-poisson", "homme-bete", "gobelin", "gnome", "nain", "troll", "geant", "dragon", "fantome", "mort-vivant", "grenouille",
  ],
  roles: ["pirate", "chevalier", "gardien", "soigneur", "mage", "hero", "voleur", "necromancien"],
  natures: ["mecanique", "maudit", "sauvage", "mythique"],
};

/** Au plus trois sous-types par carte (Notion : « deux visibles, sauf exception »). */
export const MAX_SUBTYPES = 3;

export function isSubtypeId(value: string): value is SubtypeId {
  return Object.prototype.hasOwnProperty.call(SUBTYPE_LABELS, value);
}

/**
 * Tous les sous-types d'une carte, dans l'ordre d'affichage : la famille
 * historique (`subtype`) d'abord, puis les sous-types transversaux
 * (`subtypes`). Sans doublon. LECTEUR UNIQUE : moteur et interface ne lisent
 * jamais `subtype` / `subtypes` directement.
 */
export function subtypesOf(def: Pick<CardDefinition, "subtype" | "subtypes">): string[] {
  const all = [def.subtype, ...(def.subtypes ?? [])].filter((value): value is string => Boolean(value));
  return Array.from(new Set(all));
}

/**
 * Familles historiques qui ne sont, pour le joueur, que l'ARCHÉTYPE de la
 * carte (décision du 09/10/2026) : Un Dead, Altérés, Cavalerie. Le moteur
 * garde ce sous-type — les textes et les effets le visent (« un Altéré »,
 * « vos Un Dead ») —, mais il ne s'imprime pas sous le type : l'archétype
 * est déjà écrit en bas de la carte. Marionnette, elle, reste un vrai
 * sous-type, imprimé : l'archétype de sa troupe est le Théâtre Englouti.
 */
const ARCHETYPE_FAMILY_SUBTYPES: Readonly<Record<string, string>> = {
  "un-dead": "un-dead",
  alteres: "altere",
  cavalerie: "cavalerie",
};

/** Sous-types IMPRIMÉS sous le type : tous, sauf la famille qui n'est que l'archétype, dans la limite de `MAX_SUBTYPES`. */
export function displayedSubtypes(def: Pick<CardDefinition, "subtype" | "subtypes" | "archetype">): string[] {
  const hidden = def.archetype ? ARCHETYPE_FAMILY_SUBTYPES[def.archetype] : undefined;
  return subtypesOf(def)
    .filter((subtype) => subtype !== hidden)
    .slice(0, MAX_SUBTYPES);
}

/** La carte porte-t-elle ce sous-type ? C'est la question que pose tout effet qui vise un sous-type. */
export function hasSubtype(def: Pick<CardDefinition, "subtype" | "subtypes">, subtype: string): boolean {
  return def.subtype === subtype || (def.subtypes?.includes(subtype as SubtypeId) ?? false);
}

/** Libellé d'un sous-type tel qu'imprimé sur la carte ; un identifiant inconnu s'affiche tel quel. */
export function subtypeLabel(subtype: string): string {
  return isSubtypeId(subtype) ? SUBTYPE_LABELS[subtype] : subtype;
}
