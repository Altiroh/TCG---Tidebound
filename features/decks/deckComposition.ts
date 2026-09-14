import { getCardDefinition, getMaxCopies, RULES, validateDeckList, type CardDefinition, type CardType } from "@/game";

/**
 * Lecture d'un deck en construction — regroupement, courbe, contrôle.
 *
 * Fonctions PURES sur la liste brute `cardIds` (un élément par exemplaire,
 * exactement ce que `saveDeck` attend) : l'éditeur ne maintient qu'une
 * seule source de vérité et dérive tout le reste à l'affichage. Aucune
 * règle n'est définie ici — elles viennent toutes de `@/game`
 * (`RULES.DECK_SIZE_*`, `getMaxCopies`, `validateDeckList`).
 */

export interface DeckEntry {
  cardId: string;
  def: CardDefinition;
  count: number;
  /** Limite d'exemplaires de CETTE carte (`getMaxCopies`, jamais dérivée de la rareté). */
  max: number;
}

/** Une ligne par carte distincte, triée par Raison puis par nom — l'ordre de lecture d'une liste de deck. */
export function groupDeck(cardIds: readonly string[]): DeckEntry[] {
  const counts = new Map<string, number>();
  for (const cardId of cardIds) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);

  const entries: DeckEntry[] = [];
  for (const [cardId, count] of counts) {
    let def: CardDefinition;
    try {
      def = getCardDefinition(cardId);
    } catch {
      // Carte retirée du catalogue depuis la sauvegarde : on ne casse pas
      // l'éditeur, la ligne est simplement absente (et `validateDeckList`
      // signalera l'identifiant inconnu à la sauvegarde).
      continue;
    }
    entries.push({ cardId, def, count, max: getMaxCopies(def) });
  }
  return entries.sort((a, b) => (a.def.cost !== b.def.cost ? a.def.cost - b.def.cost : a.def.name.localeCompare(b.def.name, "fr")));
}

/** Nombre d'exemplaires d'une carte dans le deck. */
export function countInDeck(cardIds: readonly string[], cardId: string): number {
  let total = 0;
  for (const id of cardIds) if (id === cardId) total += 1;
  return total;
}

/** Le dernier palier regroupe tout ce qui coûte au moins ça. */
export const CURVE_BUCKETS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export const CURVE_OVERFLOW = 7;

/** Répartition des exemplaires par Raison, un compteur par palier de `CURVE_BUCKETS`. */
export function costCurve(cardIds: readonly string[]): number[] {
  const curve = CURVE_BUCKETS.map(() => 0);
  for (const entry of groupDeck(cardIds)) {
    const bucket = Math.min(entry.def.cost, CURVE_OVERFLOW);
    curve[bucket] = (curve[bucket] ?? 0) + entry.count;
  }
  return curve;
}

/** Exemplaires par type de carte, dans l'ordre du catalogue ; les types absents du deck ne sont pas listés. */
export function typeBreakdown(cardIds: readonly string[]): Array<{ type: CardType; count: number }> {
  const counts = new Map<CardType, number>();
  for (const entry of groupDeck(cardIds)) counts.set(entry.def.type, (counts.get(entry.def.type) ?? 0) + entry.count);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

export type DeckSizeStatus = "short" | "valid" | "over";

export function deckSizeStatus(count: number): DeckSizeStatus {
  if (count < RULES.DECK_SIZE_MIN) return "short";
  if (count > RULES.DECK_SIZE_MAX) return "over";
  return "valid";
}

/**
 * Message de règle bloquant la sauvegarde d'un deck JOUABLE — celui de
 * `validateDeckList`, la même fonction que le serveur exécute. `null` si
 * le deck est valide. Un deck invalide se sauvegarde quand même (marqué
 * non jouable) : ce message informe, il n'interdit pas d'enregistrer.
 */
export function deckRuleIssue(cardIds: readonly string[], shipId: string, name: string): string | null {
  const result = validateDeckList({ id: "draft", name, shipId, description: "", cardIds: [...cardIds] });
  return result.ok ? null : result.error;
}
