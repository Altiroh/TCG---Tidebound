import {
  effectiveQualifications,
  QUALIFICATION_EQUIVALENTS,
  qualificationGlyphUrl,
  qualificationLabel,
  QUALIFICATIONS,
  type CardDefinition,
  type CardInstance,
  type QualificationId,
} from "@/game";

/**
 * Ce que l'interface montre des QUALIFICATIONS d'une carte (« spé. ») : en
 * tête de son effet, en médaillons sur le plateau, et dans sa fiche.
 *
 * Deux sources, distinguées :
 *   - les vraies qualifications (définition + modificateurs), que le moteur
 *     applique (`game/cards/qualifications.ts`) ;
 *   - les ÉQUIVALENTS d'un effet déjà écrit (`qualificationEquivalents.ts`),
 *     montrés avec leur condition (« Contournement (Abysses) ») — affichage
 *     seulement, l'effet reste celui du texte.
 */
export interface QualificationChip {
  key: string;
  id: QualificationId;
  /** « Éclaboussure 2 », « Contournement (Abysses) ». */
  label: string;
  /** Nom seul, sans valeur ni condition. */
  name: string;
  /** Valeur X, si la qualification en porte une. */
  value?: number;
  description: string;
  activation: string;
  glyph: string;
  /** Équivalent d'un effet écrit, sous condition : ce n'est pas une qualification au sens du moteur. */
  equivalent: boolean;
  /** Règles encore provisoires ou non appliquées, et ce qui attend validation. */
  rules: "validated" | "provisional" | "notImplemented";
  pending: readonly string[];
}

export function qualificationChips(def: CardDefinition, instance?: Pick<CardInstance, "cardId" | "modifiers">): QualificationChip[] {
  const own = effectiveQualifications(instance ?? { cardId: def.id, modifiers: [] }, def).map((q): QualificationChip => {
    const rule = QUALIFICATIONS[q.id];
    return {
      key: `q-${q.id}`,
      id: q.id,
      label: qualificationLabel(q),
      name: rule.name,
      value: q.value,
      description: rule.describe(q.value),
      activation: rule.activation,
      glyph: qualificationGlyphUrl(q.id),
      equivalent: false,
      rules: rule.rules,
      pending: rule.pending ?? [],
    };
  });
  const seen = new Set(own.map((chip) => chip.id));
  const equivalents = (QUALIFICATION_EQUIVALENTS[def.id] ?? [])
    .filter((eq) => !seen.has(eq.id))
    .map((eq): QualificationChip => {
      const rule = QUALIFICATIONS[eq.id];
      const base = qualificationLabel({ id: eq.id, value: eq.value });
      return {
        key: `e-${eq.id}`,
        id: eq.id,
        label: eq.condition ? `${base} (${eq.condition})` : base,
        name: rule.name,
        value: eq.value,
        description: rule.describe(eq.value),
        activation: eq.condition ? `Seulement ${eq.condition.startsWith("à ") ? eq.condition : `pendant ${eq.condition}`} — l'effet de la carte le précise.` : rule.activation,
        glyph: qualificationGlyphUrl(eq.id),
        equivalent: true,
        rules: "validated",
        pending: [],
      };
    });
  return [...own, ...equivalents];
}

/** La ligne « spé. » en tête de l'effet : « Rafale · Éclaboussure 2 ». */
export function qualificationLead(chips: readonly QualificationChip[]): string {
  return chips.map((chip) => chip.label).join(" · ");
}
