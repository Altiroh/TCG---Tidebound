import { CORE_SET, isAbyssalVariant, type CardDefinition, type CardType } from "@/game";
import { normalizeSearch } from "@/features/collection/cardFilters";

/**
 * État de filtrage de la Collection, et son évaluation.
 *
 * Les quatre axes sont indépendants et se combinent par ET. Ils vivent ici
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
  search: string;
}

export const EMPTY_FILTERS: CollectionFilterState = {
  variant: "all",
  type: null,
  ownership: "all",
  costs: [],
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
 * Recherche sur le nom ET le texte de règles : chercher « Garde » ou
 * « Sabordage » doit remonter les cartes qui en parlent, pas seulement
 * celles qui le portent dans leur nom.
 */
function matchesSearch(def: CardDefinition, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (normalizeSearch(def.name).includes(normalizedQuery)) return true;
  return def.text ? normalizeSearch(def.text).includes(normalizedQuery) : false;
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
    filters.search.trim() !== ""
  );
}
