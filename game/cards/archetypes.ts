/**
 * Archétypes — familles de cartes qui partagent une identité et des
 * synergies explicites (Notion "Catalogue de cartes", Lot 10 Cra-Poiscail
 * du 2026-09-14).
 *
 * DONNÉE DE MOTEUR UNIQUEMENT, jamais affichée sur la carte (décision du
 * 2026-09-14, cohérente avec le cadrage "aucun archétype ne doit être nommé
 * côté joueur") : l'appartenance sert à compter, cibler et conditionner
 * ("si vous contrôlez déjà un autre Cra-Poiscail", "vos autres
 * Cra-Poiscail gagnent +1 Puissance"). Le joueur, lui, reconnaît la
 * famille à ses noms et ses illustrations — pas à un badge sur le cadre.
 *
 * `CardDefinition.archetype` reste donc distinct de `subtype` (qui, lui,
 * pilote le cadre Abyssal) et de `tags` (étiquettes libres de ciblage) :
 * une carte peut être Abyssale ET Cra-Poiscail, comme les trois variantes
 * du Lot 10.
 */
export type ArchetypeId = "cra-poiscail";

/** Libellé humain — outils de design, journaux, tests. Jamais rendu sur une carte. */
export const ARCHETYPE_LABELS: Record<ArchetypeId, string> = {
  "cra-poiscail": "Cra-Poiscail",
};
