import type { ShipDefinition } from "@/game/environment/types";

/**
 * Mise en forme des textes de Navire POUR LE JOUEUR.
 *
 * `game/environment/shipData.ts` garde des notes d'implémentation entre
 * parenthèses (« (non appliqué : capacité activable non modélisée) ») :
 * elles s'adressent au développeur, pas à quelqu'un qui choisit un Navire.
 * Elles sont retirées ici plutôt que dans la donnée — le jour où le moteur
 * les applique, c'est la note qui disparaîtra de `shipData`, pas ce
 * fichier.
 */

const IMPLEMENTATION_NOTE = /\s*\((?:non appliqué|nécessite)[^)]*\)/gi;

/** Un texte de Navire débarrassé de ses notes d'implémentation, `null` s'il n'en reste rien. */
export function playerFacingShipText(text: string | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(IMPLEMENTATION_NOTE, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export interface ShipTrait {
  /** Étiquette courte de la ligne — ce que le joueur lit en gras devant le texte. */
  label: "Passif" | "Capacité" | "Faiblesse";
  text: string;
}

/**
 * Les traits d'un Navire dans leur ordre de lecture : ce qu'il fait tout
 * seul, ce qu'il peut déclencher, ce qu'il paie en échange. Les traits
 * absents ne produisent pas de ligne vide (L'Errant n'a pas de faiblesse).
 */
export function shipTraits(ship: ShipDefinition): ShipTrait[] {
  const traits: ShipTrait[] = [];
  const passive = playerFacingShipText(ship.passiveText);
  const capacity = playerFacingShipText(ship.capacityText);
  const weakness = playerFacingShipText(ship.weaknessText);
  if (passive) traits.push({ label: "Passif", text: passive });
  if (capacity) traits.push({ label: "Capacité", text: capacity });
  if (weakness) traits.push({ label: "Faiblesse", text: weakness });
  return traits;
}
