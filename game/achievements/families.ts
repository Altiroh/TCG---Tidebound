/**
 * FAMILLES D'EXPLOITS — l'en-tête sous lequel le tableau range chaque
 * exploit (`AchievementDefinition.family`).
 *
 * Module à part, sans dépendance : le tableau des exploits (client) n'a
 * besoin que des libellés et de l'ordre, pas du catalogue et de ses
 * conditions.
 *
 * L'ORDRE est celui de lecture : du premier pas (escales, cale, équipage,
 * phares) au jeu lui-même (combat, Marée, Déraison…), les Traversées en
 * dernier. Les identifiants des cinq premières familles sont ceux de
 * l'ancienne table locale du tableau : ils ne changent pas.
 */
export const ACHIEVEMENT_FAMILIES = [
  { id: "voyage", label: "Premières escales" },
  { id: "cale", label: "La cale" },
  { id: "equipage", label: "L'équipage" },
  { id: "phare", label: "Les phares" },
  { id: "combat", label: "Combat" },
  { id: "records", label: "Records" },
  { id: "maree", label: "Marée" },
  { id: "deraison", label: "Déraison" },
  { id: "bris", label: "Bris & pièges" },
  { id: "navire", label: "Navires" },
  { id: "fatal", label: "Coups fatals" },
  { id: "traversees", label: "Traversées" },
] as const;

export type AchievementFamilyId = (typeof ACHIEVEMENT_FAMILIES)[number]["id"];

export function isAchievementFamilyId(value: string): value is AchievementFamilyId {
  return ACHIEVEMENT_FAMILIES.some((family) => family.id === value);
}
