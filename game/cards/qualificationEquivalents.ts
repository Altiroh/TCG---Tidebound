import type { QualificationId } from "@/game/cards/qualifications";

/**
 * ÉQUIVALENTS DE QUALIFICATION — AFFICHAGE SEULEMENT (audit du catalogue du
 * 12/10/2026).
 *
 * Ces cartes avaient déjà, avant le système des qualifications, un effet
 * écrit qui en reprend une — le plus souvent sous condition de Marée.
 * Leur TEXTE ne change pas (Notion reste la source), et leur effet reste
 * appliqué par ses champs d'origine (`bypassesGardeTideStateIn`,
 * `opponentReasonLossOnDirectAttack`, capacité de l'Équipement…) : aucune
 * règle ne lit cette table. Elle sert uniquement à MONTRER la qualification
 * en tête de l'effet (« Contournement (Abysses) — … »), comme une vraie
 * qualification, pour que le joueur reconnaisse la mécanique.
 *
 * Leur attribution comme vraies qualifications (`CardDefinition.qualifications`)
 * reste une décision de design : elle remplacerait le champ d'origine, ou le
 * doublerait. Écarts non repris ici (pas équivalents) : les pertes de
 * Puissance temporaires ou conditionnelles (Tacticien de l'Écume, Pont
 * Miné…) ne sont pas Entaille ; « restaurez … répartie » n'est pas Salve.
 */
export interface QualificationEquivalent {
  id: QualificationId;
  /** Valeur X, si la qualification en porte une. */
  value?: number;
  /** Condition de l'effet d'origine, affichée entre parenthèses. */
  condition?: string;
}

export const QUALIFICATION_EQUIVALENTS: Readonly<Record<string, readonly QualificationEquivalent[]>> = {
  "raie-des-fosses": [{ id: "contournement", condition: "Abysses" }],
  "bat-marin": [{ id: "contournement", condition: "Tempête ou Abysses" }],
  "bat-marin-abyssal": [
    { id: "contournement", condition: "Tempête ou Abysses" },
    { id: "ponction", value: 1, condition: "Abysses" },
  ],
  "albatros-de-mauvais-temps": [{ id: "contournement", condition: "Tempête" }],
  "anguille-des-profondeurs": [{ id: "ponction", value: 1, condition: "Abysses" }],
  // Un Équipement CONFÈRE : la Sangsue s'affiche sur l'unité qu'il équipe, jamais sur lui
  // (`features/match/qualificationDisplay.ts`), comme `equipGrantsQualifications`.
  "le-cerf-volant": [{ id: "sangsue" }],
};
