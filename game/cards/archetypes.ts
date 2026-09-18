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
import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES, type CardInstance } from "@/game/cards/types";

export type ArchetypeId = "cra-poiscail" | "un-dead";

/** Libellé humain — outils de design, journaux, tests. Jamais rendu sur une carte. */
export const ARCHETYPE_LABELS: Record<ArchetypeId, string> = {
  "cra-poiscail": "Cra-Poiscail",
  "un-dead": "Un Dead",
};

/**
 * Membres d'un archétype PRÉSENTS sur un plateau.
 *
 * Règle verrouillée le 2026-09-14 : seuls les **Marins et Créatures**
 * comptent pour les effets de dénombrement ("si vous contrôlez déjà un
 * autre Cra-Poiscail", "au moins 3 Cra-Poiscail"). Les Structures, Objets,
 * Équipements et Anomalies de la famille portent bien leur `archetype` —
 * ils restent ciblables et reconnaissables — mais ne gonflent pas les
 * seuils : sans ça, poser Le Seau et La Flaque Sacrée suffisait à allumer
 * un bonus censé récompenser un banc de créatures.
 */
export function countArchetypeUnits(
  board: readonly CardInstance[],
  archetype: ArchetypeId,
  options: { excludeInstanceId?: string } = {}
): number {
  return board.filter((unit) => {
    if (options.excludeInstanceId && unit.instanceId === options.excludeInstanceId) return false;
    const def = getCardDefinition(unit.cardId);
    return def.archetype === archetype && (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  }).length;
}
