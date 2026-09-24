import { achievementByCode } from "@/game/achievements/catalog";

/**
 * TITRES — une courte appellation portée à côté du nom du joueur
 * (« Loup de mer », « Capitaine »…).
 *
 * RIEN NE S'ACHÈTE. Un titre ne passe jamais par le Market ni par une
 * boutique : il se MÉRITE, et chacun est accroché à un exploit existant
 * (`game/achievements/catalog.ts`). D'où un seul genre de condition —
 * « avoir obtenu tel exploit » — et deux propriétés qu'on n'a pas à
 * réinventer :
 *   - la preuve est déjà en base (`player_achievements`), écrite par
 *     l'octroi idempotent des exploits : aucun circuit de récompense de
 *     plus, aucune ligne « titre possédé » à tenir à jour ;
 *   - un titre ajouté plus tard se débloque tout seul pour les comptes qui
 *     ont déjà l'exploit, comme un exploit ajouté après coup.
 *
 * Règle du projet : jamais un titre sans moyen réel de l'obtenir. Le test
 * `tests/game/titles.test.ts` vérifie que chaque condition renvoie à un
 * exploit du catalogue.
 *
 * Les identifiants sont FIGÉS : le titre choisi est stocké en base
 * (`player_titles.title_id`). Un titre retiré du catalogue ne casse rien —
 * le joueur retombe simplement sur « aucun titre ».
 */

export type TitleUnlock =
  /** Débloqué dès que cet exploit figure dans `player_achievements`. */
  { kind: "achievement"; code: string };

export interface TitleDefinition {
  /** Identifiant stable, en kebab-case — stocké dans `player_titles.title_id`. */
  id: string;
  /** Ce qui s'affiche sous le nom du joueur. */
  name: string;
  unlock: TitleUnlock;
}

/**
 * Le catalogue, du premier pas au bout de la route : les titres d'équipage
 * d'abord, puis la hiérarchie du bord, qui suit les paliers de niveau.
 */
export const TITLE_CATALOG: readonly TitleDefinition[] = [
  { id: "mousse", name: "Mousse", unlock: { kind: "achievement", code: "tutorial_completed" } },
  { id: "flibustier", name: "Flibustier", unlock: { kind: "achievement", code: "first_win" } },
  { id: "matelot", name: "Matelot", unlock: { kind: "achievement", code: "ten_matches" } },
  { id: "ecumeur-d-epaves", name: "Écumeur d'épaves", unlock: { kind: "achievement", code: "collection_60" } },
  { id: "cartographe-des-marees", name: "Cartographe des marées", unlock: { kind: "achievement", code: "collection_100" } },
  { id: "revenant-des-abysses", name: "Revenant des abysses", unlock: { kind: "achievement", code: "first_abyssal" } },
  { id: "maitre-d-equipage", name: "Maître d'équipage", unlock: { kind: "achievement", code: "deck_fully_owned" } },
  { id: "loup-de-mer", name: "Loup de mer", unlock: { kind: "achievement", code: "level_10" } },
  { id: "bosco", name: "Bosco", unlock: { kind: "achievement", code: "level_20" } },
  { id: "second", name: "Second", unlock: { kind: "achievement", code: "level_30" } },
  { id: "capitaine", name: "Capitaine", unlock: { kind: "achievement", code: "level_40" } },
  { id: "amiral-des-marees", name: "Amiral des marées", unlock: { kind: "achievement", code: "level_50" } },
  // Traversées bouclées (audit du 24/09/2026).
  { id: "timonier", name: "Timonier", unlock: { kind: "achievement", code: "voyage_premier_quart" } },
  { id: "revenant-des-brumes", name: "Revenant des brumes", unlock: { kind: "achievement", code: "voyage_eaux_troubles" } },
  { id: "maitre-de-manoeuvre", name: "Maître de manœuvre", unlock: { kind: "achievement", code: "voyage_grand_fond" } },
];

export function titleById(id: string | null | undefined): TitleDefinition | undefined {
  if (!id) return undefined;
  return TITLE_CATALOG.find((title) => title.id === id);
}

/** Le titre qu'un exploit fait gagner, s'il y en a un. */
export function titleForAchievement(code: string): TitleDefinition | undefined {
  return TITLE_CATALOG.find((title) => title.unlock.kind === "achievement" && title.unlock.code === code);
}

/**
 * Le titre est-il débloqué ? `unlockedAchievementCodes` : les codes lus
 * dans `player_achievements` — c'est la ligne en base qui fait foi, jamais
 * un compteur recalculé côté client.
 */
export function isTitleUnlocked(title: TitleDefinition, unlockedAchievementCodes: ReadonlySet<string>): boolean {
  switch (title.unlock.kind) {
    case "achievement":
      return unlockedAchievementCodes.has(title.unlock.code);
  }
}

/** Tous les titres que ces exploits débloquent, dans l'ordre du catalogue. */
export function unlockedTitles(unlockedAchievementCodes: ReadonlySet<string>): TitleDefinition[] {
  return TITLE_CATALOG.filter((title) => isTitleUnlocked(title, unlockedAchievementCodes));
}

/**
 * La condition, dite au joueur : l'exploit à obtenir et ce qu'il demande.
 * Jamais « Verrouillé » tout court — un objectif qu'on ne connaît pas ne
 * donne envie de rien.
 */
export function titleUnlockLabel(title: TitleDefinition): string {
  switch (title.unlock.kind) {
    case "achievement": {
      const achievement = achievementByCode(title.unlock.code);
      return achievement ? `Exploit « ${achievement.name} » : ${achievement.description}` : "Exploit à obtenir";
    }
  }
}

/**
 * Ce que le serveur doit vérifier en base avant d'équiper ce titre. Exposé
 * à part pour que la fonction Postgres (`set_player_title`) reçoive la
 * condition du catalogue, et non une valeur venue du navigateur.
 */
export function titleRequiredAchievement(title: TitleDefinition): string {
  return title.unlock.code;
}
