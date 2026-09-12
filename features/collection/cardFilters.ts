import type { CardDefinition, CardType } from "@/game";

export const TYPE_FILTERS: CardType[] = ["marin", "creature", "equipement", "structure", "objet", "anomalie"];

export type SortMode = "name" | "cost" | "power";

export const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "name", label: "Nom" },
  { value: "cost", label: "Raison" },
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
