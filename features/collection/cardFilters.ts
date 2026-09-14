import type { CardDefinition, CardType } from "@/game";

export const TYPE_FILTERS: CardType[] = ["marin", "creature", "equipement", "structure", "objet", "anomalie"];

/**
 * `name`/`cost`/`power` sont les tris historiques, partagés avec l'éditeur
 * de deck (`SORT_OPTIONS` ci-dessous). Les deux modes décroissants ont été
 * ajoutés pour la Collection seule ; l'éditeur garde sa liste inchangée.
 */
export type SortMode = "name" | "name-desc" | "cost" | "cost-desc" | "power";

/** Tris proposés par l'éditeur de deck — volontairement courts. */
export const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "name", label: "Nom" },
  { value: "cost", label: "Raison" },
  { value: "power", label: "Puissance" },
];

/** Tris proposés par la Collection, où l'on cherche une carte précise plutôt qu'on ne feuillette un deck. */
export const COLLECTION_SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "name", label: "Nom A → Z" },
  { value: "name-desc", label: "Nom Z → A" },
  { value: "cost", label: "Raison croissante" },
  { value: "cost-desc", label: "Raison décroissante" },
  { value: "power", label: "Puissance" },
];

/** Insensible aux accents (ex: "epave" retrouve "Épave") et à la casse. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Comparateur de tri. `cost` et `power` départagent toujours les égalités
 * (et, pour `power`, l'absence de Puissance — Équipement/Structure/Objet/
 * Anomalie) par ordre alphabétique, comme demandé : jamais d'ordre
 * arbitraire résiduel.
 */
export function compareCards(a: CardDefinition, b: CardDefinition, sort: SortMode): number {
  // Les modes décroissants inversent le seul critère principal : à valeur
  // égale, l'ordre alphabétique reste croissant, sinon la liste paraîtrait
  // deux fois mélangée.
  if (sort === "name-desc") return b.name.localeCompare(a.name, "fr");
  if (sort === "cost-desc") {
    return a.cost !== b.cost ? b.cost - a.cost : a.name.localeCompare(b.name, "fr");
  }
  if (sort === "cost") {
    return a.cost !== b.cost ? a.cost - b.cost : a.name.localeCompare(b.name, "fr");
  }
  if (sort === "power") {
    const aHasPower = a.attack !== undefined;
    const bHasPower = b.attack !== undefined;
    if (aHasPower && bHasPower && a.attack !== b.attack) return (a.attack as number) - (b.attack as number);
    if (aHasPower !== bHasPower) return aHasPower ? -1 : 1;
    return a.name.localeCompare(b.name, "fr");
  }
  return a.name.localeCompare(b.name, "fr");
}
