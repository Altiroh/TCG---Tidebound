import { ARCHETYPE_LABELS, CORE_SET, isAbyssalVariant, type CardDefinition, type CardType } from "@/game";
import { boostersContaining } from "@/game/boosters";
import { normalizeSearch } from "@/features/collection/cardFilters";

/**
 * État de filtrage de la Collection, et son évaluation.
 *
 * Les cinq axes sont indépendants et se combinent par ET. Ils vivent ici
 * plutôt que dans l'écran pour que le décompte par facette
 * (`countMatching`) applique EXACTEMENT les mêmes règles que le filtrage
 * réel — un compteur qui diverge du contenu de la grille est pire que pas
 * de compteur.
 *
 * Aucun axe « archétype » : l'appartenance à une famille est une donnée de
 * moteur, jamais montrée au joueur (`game/cards/archetypes.ts`).
 */

export type VariantFilter = "all" | "standard" | "abyssal";
export type OwnershipFilter = "all" | "owned" | "missing";

/** Le palier le plus haut du filtre de Raison regroupe tout ce qui coûte au moins ça. */
export const COST_BUCKETS = [0, 1, 2, 3, 4, 5, 6] as const;
export const COST_OVERFLOW_BUCKET = 6;

export interface CollectionFilterState {
  variant: VariantFilter;
  /** `null` = tous les types. */
  type: CardType | null;
  ownership: OwnershipFilter;
  /** Multi-sélection ; vide = tous les coûts. */
  costs: number[];
  /**
   * Boosters dans lesquels la carte peut tomber. Multi-sélection ; vide =
   * tous. Une carte cochée par PLUSIEURS boosters sélectionnés n'apparaît
   * qu'une fois — c'est un OU entre les boosters, un ET avec les autres
   * axes.
   */
  boosters: string[];
  search: string;
}

export const EMPTY_FILTERS: CollectionFilterState = {
  variant: "all",
  type: null,
  ownership: "all",
  costs: [],
  boosters: [],
  search: "",
};

/** Palier de Raison d'une carte (tout ce qui dépasse retombe sur `6+`). */
export function costBucket(cost: number): number {
  return Math.min(cost, COST_OVERFLOW_BUCKET);
}

function matchesVariant(def: CardDefinition, variant: VariantFilter): boolean {
  if (variant === "all") return true;
  const isAbyssal = isAbyssalVariant(def);
  return variant === "abyssal" ? isAbyssal : !isAbyssal;
}

function matchesOwnership(def: CardDefinition, ownership: OwnershipFilter, owned: ReadonlySet<string>): boolean {
  if (ownership === "all") return true;
  return ownership === "owned" ? owned.has(def.id) : !owned.has(def.id);
}

/**
 * D'OÙ VIENT UNE CARTE — l'axe ajouté le 22/09/2026.
 *
 * C'est un FILTRE et non un tri, parce qu'une carte n'a pas une extension :
 * elle a les boosters qui peuvent la donner, et 24 des 254 cartes du
 * catalogue tombent dans plusieurs. Les ranger « par extension » aurait
 * demandé d'en élire une au hasard pour chacune ; les filtrer ne demande
 * rien et répond à la vraie question — « qu'est-ce que j'ai, et qu'est-ce
 * qui me manque, dans tel sachet ».
 *
 * La source est `BOOSTER_POOLS` : ce qui est TIRABLE, pas le `setCode` de
 * la carte. Les deux divergent — 100 cartes n'ont aucun `setCode`, et une
 * carte d'un vieux lot peut très bien être reprise dans un booster récent.
 */
function matchesBoosters(def: CardDefinition, boosters: string[]): boolean {
  if (boosters.length === 0) return true;
  const sources = boostersContaining(def.id);
  return boosters.some((boosterId) => sources.includes(boosterId));
}

/**
 * Termes de FAMILLE d'une carte : son sous-type et son archétype, sous les
 * formes qu'un joueur peut taper.
 *
 * L'identifiant est en kebab-case (`un-dead`) ; on ajoute sa forme espacée
 * (`un dead`), parce que c'est ainsi que la carte l'écrit dans son texte, et
 * le libellé humain de l'archétype quand il en a un.
 */
function familyTerms(def: CardDefinition): string[] {
  const terms: string[] = [];
  for (const id of [def.subtype, def.archetype]) {
    if (!id) continue;
    terms.push(id, id.replace(/-/g, " "));
  }
  if (def.archetype) terms.push(ARCHETYPE_LABELS[def.archetype]);
  return terms;
}

/**
 * Recherche sur le nom, le texte de règles ET la famille.
 *
 * Le nom et le texte y étaient depuis le début : chercher « Garde » ou
 * « Sabordage » doit remonter les cartes qui en parlent, pas seulement
 * celles qui le portent dans leur nom.
 *
 * La FAMILLE a été ajoutée le 18/09/2026, après un cas qui ne laissait
 * aucun doute : chercher « Un Dead » rendait 9 des 18 cartes de la famille —
 * exactement celles dont le TEXTE écrit les mots (« choisissez une unité
 * Un Dead… »). Les neuf autres en sont tout autant, mais ne se nomment
 * jamais elles-mêmes. Pire, « Volatile » ne rendait RIEN : aucune des sept
 * cartes du sous-type n'écrit le mot. Cra-Poiscail ne marchait que par
 * accident, la famille étant dans le NOM des cartes.
 *
 * L'appartenance n'est donc pas « une donnée de moteur jamais montrée au
 * joueur » : le texte des cartes la nomme, et la fiche détaillée l'affiche.
 * C'est l'ARCHÉTYPE qui reste hors du cadre, pas ce qu'on peut y chercher.
 */
function matchesSearch(def: CardDefinition, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (normalizeSearch(def.name).includes(normalizedQuery)) return true;
  if (def.text && normalizeSearch(def.text).includes(normalizedQuery)) return true;
  return familyTerms(def).some((term) => normalizeSearch(term).includes(normalizedQuery));
}

/**
 * Évalue une carte contre l'état de filtrage.
 *
 * `ignore` neutralise un axe — c'est ce qui permet à chaque section de la
 * colonne de gauche d'afficher « ce que je donnerais si tu me cliquais »
 * plutôt qu'un décompte figé : le compteur du type Créature applique la
 * variante, la possession, le coût et la recherche courants, mais pas le
 * filtre de type lui-même.
 */
export function matchesFilters(
  def: CardDefinition,
  filters: CollectionFilterState,
  owned: ReadonlySet<string>,
  ignore?: keyof CollectionFilterState
): boolean {
  if (ignore !== "variant" && !matchesVariant(def, filters.variant)) return false;
  if (ignore !== "type" && filters.type && def.type !== filters.type) return false;
  if (ignore !== "ownership" && !matchesOwnership(def, filters.ownership, owned)) return false;
  if (ignore !== "costs" && filters.costs.length > 0 && !filters.costs.includes(costBucket(def.cost))) return false;
  if (ignore !== "boosters" && !matchesBoosters(def, filters.boosters)) return false;
  if (ignore !== "search" && !matchesSearch(def, normalizeSearch(filters.search.trim()))) return false;
  return true;
}

/** Nombre de cartes du catalogue qui passeraient les filtres, un axe mis de côté et un prédicat supplémentaire. */
export function countMatching(
  filters: CollectionFilterState,
  owned: ReadonlySet<string>,
  ignore: keyof CollectionFilterState,
  extra: (def: CardDefinition) => boolean
): number {
  let total = 0;
  for (const def of CORE_SET) if (matchesFilters(def, filters, owned, ignore) && extra(def)) total += 1;
  return total;
}

/** Un filtre est-il actif ? Sert à proposer « Tout effacer » seulement quand ça a un sens. */
export function hasActiveFilters(filters: CollectionFilterState): boolean {
  return (
    filters.variant !== "all" ||
    filters.type !== null ||
    filters.ownership !== "all" ||
    filters.costs.length > 0 ||
    filters.boosters.length > 0 ||
    filters.search.trim() !== ""
  );
}
