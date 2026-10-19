import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * EFFETS D'ARRIVÉE FACULTATIFS — règle générale (décision du 12/10/2026) :
 * « Les cartes qui ont des effets à l'arrivée ne doivent s'appliquer qu'à
 * l'arrivée, selon l'envie du joueur, et non s'imposer. »
 *
 * PRÉCISÉE le même jour : « si l'effet est positif, comme pour les dés, on
 * ne demande pas — il faut que ça nécessite un CHOIX de l'utilisateur ».
 * Seul un effet d'arrivée qui demande une DÉCISION devient facultatif : une
 * unité à désigner (`chosenUnit`), une carte du Cimetière à choisir. Un
 * effet sans décision (piocher, gagner de la Raison, un bonus, un jet de dé)
 * s'applique à la pose, sans rien demander. Les capacités que le texte rend
 * déjà facultatives (« vous pouvez », « choisissez : A ou B ») le restent.
 *
 * Un permanent (unité, Structure, Objet, Équipement) qui arrive en jeu ne
 * résout plus son effet d'arrivée d'office : il se propose dans la fenêtre
 * de réaction habituelle (Appliquer / Passer), comme toute capacité
 * `mode: "optional"` — un effet ciblé y désigne sa cible. La règle est
 * appliquée UNE FOIS, au catalogue (`CORE_SET`) : la carte garde sa
 * définition, son effet d'arrivée devient une capacité `onEnterPlay`
 * facultative, ajoutée EN FIN de ses capacités (les index des autres ne
 * bougent pas).
 *
 * Ce qui reste IMPOSÉ :
 *   - une CONTREPARTIE seule (« à son arrivée, perdez 2 Raison »,
 *     « perdez 1 Ancrage », « défaussez ») : c'est le prix de la carte ;
 *   - le choix de sa COULEUR (Sentinelles chromatiques) : il fait la carte,
 *     ce n'est pas un effet qu'on peut ne pas prendre ;
 *   - la pose d'un Équipement sur sa cible (`attachEquipment`) : c'est la
 *     façon de jouer la carte, pas son effet.
 * Un effet MÊLÉ (« piochez 1 carte puis défaussez 1 carte ») se refuse en
 * bloc : tout ou rien.
 *
 * Les Anomalies et les Landes ne sont pas concernées : leur effet est leur
 * raison d'être jouées.
 */

const PERMANENT_TYPES = new Set(["creature", "marin", "structure", "objet", "equipement"]);

/** Une contrepartie : ce que l'effet coûte au joueur qui pose la carte. */
export function isArrivalCost(effect: EffectDefinition): boolean {
  const own = effect.target.kind === "controllerPlayer" || effect.target.kind === "self";
  switch (effect.type) {
    case "reasonLoss":
    case "discard":
    case "damage":
    case "destroy":
    case "lockReasonGainUntilNextTurn":
      return own;
    default:
      return false;
  }
}

/**
 * Un effet qui demande au joueur de DÉCIDER : une unité à désigner, une
 * carte du Cimetière à choisir (même liste que `graveyardEffectIn`).
 */
export function asksDecision(effect: EffectDefinition): boolean {
  if (effect.target.kind === "chosenUnit") return true;
  // Une décision peut ne vivre que dans une BRANCHE de dé (Rita, Sorcière sous
  // contrat : chaque palier vise l'unité désignée). Sans cette lecture, la
  // carte restait en `onPlayEffects` imposé, se posait sans qu'on demande la
  // cible, et son effet tombait dans le vide.
  if ((effect.dieBranches ?? []).some((branch) => branch.effects.some(asksDecision))) return true;
  return effect.type === "moveGraveyardCardToHand" || (effect.type === "summon" && effect.cardIdFrom === "chosenGraveyardCard");
}

/** Ce qui ne se refuse jamais, même mêlé à un bonus. */
function isImposed(effect: EffectDefinition): boolean {
  return effect.type === "attachEquipment" || effect.type === "chooseChromaticColor";
}

/** La phrase d'arrivée du texte, pour la fenêtre (« À son arrivée, … »). */
function arrivalSentence(def: CardDefinition): string {
  const text = def.text ?? "";
  const at = text.search(/À son arrivée|À l'arrivée|Lorsqu'il est posé|Lorsqu'elle est posée/);
  if (at < 0) return text || `Effet d'arrivée de ${def.name}`;
  const rest = text.slice(at);
  const end = rest.search(/\.(\s|$)/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

export function withOptionalArrival(def: CardDefinition): CardDefinition {
  if (!PERMANENT_TYPES.has(def.type) || def.token) return def;
  let changed = false;

  // 1. Les effets d'arrivée écrits en `onPlayEffects`.
  const onPlay = def.onPlayEffects ?? [];
  const kept = onPlay.filter(isImposed);
  const arrival = onPlay.filter((effect) => !isImposed(effect));
  let extra: TriggeredAbility | null = null;
  if (arrival.length > 0 && !arrival.every(isArrivalCost) && arrival.some(asksDecision)) {
    extra = { trigger: "onEnterPlay", mode: "optional", arrivalEffect: true, description: arrivalSentence(def), effects: arrival };
    changed = true;
  }

  // 2. Les capacités d'arrivée qui se déclenchaient d'office (`onEnterPlay` sur elle-même).
  const abilities = (def.abilities ?? []).map((ability): TriggeredAbility => {
    const own = ability.trigger === "onEnterPlay" && !ability.triggeredBy && (ability.mode ?? "auto") === "auto";
    if (!own || ability.effects.some(isImposed) || ability.effects.every(isArrivalCost) || !ability.effects.some(asksDecision)) return ability;
    changed = true;
    return { ...ability, mode: "optional", arrivalEffect: true };
  });

  if (!changed) return def;
  return {
    ...def,
    onPlayEffects: extra ? kept : def.onPlayEffects,
    abilities: extra ? [...abilities, extra] : abilities,
  };
}
