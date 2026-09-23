import { getCardDefinition } from "@/game/cards/sets/core";
import { CHROMATIC_COLORS, UNIT_CARD_TYPES, type CardInstance, type ChromaticColor } from "@/game/cards/types";
import type { PlayerState } from "@/game/state/types";

/**
 * SENTINELLES CHROMATIQUES — la règle de famille (Lot 15, Notion
 * « Éclats en Selle » § Règle centrale — Signaux Chromatiques).
 *
 * Des marins ont trouvé des pierres qui réagissent à leur porteur. Chaque
 * pierre donne une COULEUR, et chaque Sentinelle émet le SIGNAL de sa
 * couleur au profit de toutes les AUTRES Sentinelles — même couleur
 * comprise. Les Signaux se CUMULENT : chaque émetteur compte (arbitrage du
 * 23/09/2026 : « un Rouge donne +1 Puissance à un autre Rouge, et c'est
 * réciproque »). Deux Rouges se donnent donc +1 l'un à l'autre, et une
 * Jaune à côté d'eux reçoit +2.
 *
 * Seule limite : une Sentinelle ne reçoit pas son PROPRE Signal, sauf texte
 * contraire (Le Géant Chromatique, Synchronisation !).
 *
 * Ce module ne fait que LIRE : qui porte quelle couleur, qui émet quoi, qui
 * en bénéficie. Ce que fait chaque Signal est appliqué là où le moteur le
 * rencontre — les statistiques pour Rouge et Jaune (`game/cards/stats.ts`),
 * le combat pour Bleu (`game/actions/attack.ts`), le passage de fin
 * d'action pour Vert et Violet (`game/rules/chromaticSignals.ts`).
 *
 * Les textes des cartes disent ce que fait le Signal de leur couleur ; ce
 * n'est pas une capacité de CETTE carte mais la règle de la couleur, écrite
 * une fois. C'est ce qui permet à un Héraut de Nacre ou à un Géant de
 * l'Assemblage d'émettre un Signal qu'aucune ligne de sa définition ne porte.
 */

/** Famille des Sentinelles (`CardDefinition.archetype`). */
export const SENTINELLE_CHROMATIQUE = "sentinelle-chromatique" as const;

/** Sous-type des jetons Éclat Chromatique. */
export const ECLAT_CHROMATIQUE = "eclat-chromatique";

/** Identifiant du jeton Éclat Chromatique de cette couleur (`game/cards/sets/tokens.ts`). */
export function chromaticShardCardId(color: ChromaticColor): string {
  return `${ECLAT_CHROMATIQUE}-${color}`;
}

/** Libellés d'affichage — journal, invites, fiche de carte. */
export const CHROMATIC_COLOR_LABELS: Record<ChromaticColor, string> = {
  rouge: "Rouge",
  jaune: "Jaune",
  bleu: "Bleu",
  vert: "Vert",
  violet: "Violet",
};

function uniques(colors: Iterable<ChromaticColor>): ChromaticColor[] {
  const set = new Set(colors);
  // Ordre canonique : deux lectures d'un même plateau rendent la même liste.
  return CHROMATIC_COLORS.filter((color) => set.has(color));
}

/** Une SENTINELLE : une unité de la famille. Les Bracelets, Postes et autres soutiens n'en sont pas. */
export function isSentinel(unit: CardInstance): boolean {
  const def = getCardDefinition(unit.cardId);
  return def.archetype === SENTINELLE_CHROMATIQUE && UNIT_CARD_TYPES.includes(def.type);
}

/**
 * Couleurs de CETTE carte, en ce moment : imprimées, gagnées sur
 * l'instance, prêtées par un modificateur, et partagées par l'Équipement qui
 * la porte (Bracelet Chromatique).
 */
export function chromaticColorsOf(unit: CardInstance, board: readonly CardInstance[]): ChromaticColor[] {
  const def = getCardDefinition(unit.cardId);
  const colors: ChromaticColor[] = [...(def.chromatic?.colors ?? []), ...(unit.chromatic?.colors ?? [])];
  for (const modifier of unit.modifiers) colors.push(...(modifier.chromatic?.colors ?? []));
  for (const equipment of board) {
    if (equipment.attachedToInstanceId !== unit.instanceId) continue;
    if (!getCardDefinition(equipment.cardId).equipSharesChromaticColors) continue;
    colors.push(...(equipment.chromatic?.colors ?? []));
    for (const modifier of equipment.modifiers) colors.push(...(modifier.chromatic?.colors ?? []));
  }
  return uniques(colors);
}

/**
 * Signaux que cette carte ÉMET. Seules les Sentinelles émettent : un Éclat
 * a une couleur, pas de Signal, et la carte qui revendique une couleur (La
 * Première Pierre) « n'émet aucun Signal ».
 */
export function emittedSignalsOf(unit: CardInstance): ChromaticColor[] {
  if (!isSentinel(unit)) return [];
  const def = getCardDefinition(unit.cardId);
  const signals: ChromaticColor[] = def.chromatic?.emitsSignal ? [...(def.chromatic.colors ?? [])] : [];
  signals.push(...(unit.chromatic?.emits ?? []));
  for (const modifier of unit.modifiers) signals.push(...(modifier.chromatic?.emits ?? []));
  return uniques(signals);
}

/** « Elle bénéficie également de son propre Signal » : Le Géant Chromatique par nature, Synchronisation ! pour un tour. */
function benefitsFromOwnSignals(unit: CardInstance): boolean {
  return Boolean(getCardDefinition(unit.cardId).chromatic?.benefitsFromOwnSignals) || unit.modifiers.some((m) => m.chromatic?.benefitsOwnSignals);
}

/**
 * Les émetteurs du Signal de cette couleur dont cette Sentinelle profite.
 * CHACUN compte : les Signaux se cumulent. Ce sont les autres cartes du
 * plateau qui émettent cette couleur, et la Sentinelle elle-même seulement
 * si elle bénéficie de son propre Signal (Géant, Synchronisation !).
 */
export function signalSources(unit: CardInstance, color: ChromaticColor, board: readonly CardInstance[]): CardInstance[] {
  if (!isSentinel(unit)) return [];
  const siens = benefitsFromOwnSignals(unit);
  return board.filter((other) => (siens || other.instanceId !== unit.instanceId) && emittedSignalsOf(other).includes(color));
}

/** Clé `oncePerTurnFlags` d'un Signal déclenché : « la première fois à chaque tour » se suit sur l'ÉMETTEUR. */
export function signalKey(color: ChromaticColor): string {
  return `signal:${color}`;
}

/**
 * Les émetteurs dont le Signal déclenché (Bleu, Vert, Violet) n'a pas encore
 * servi ce tour. Chaque émetteur a son « première fois à chaque tour » :
 * deux Tacticiens de l'Écume retirent 2 Puissance, une fois par tour chacun.
 */
export function availableSignalSources(
  unit: CardInstance,
  color: ChromaticColor,
  board: readonly CardInstance[],
  turnNumber: number
): CardInstance[] {
  const key = signalKey(color);
  return signalSources(unit, color, board).filter((source) => (source.oncePerTurnFlags ?? {})[key] !== turnNumber);
}

/**
 * « Une Sentinelle d'une autre couleur » que `reference` : une Sentinelle
 * colorée qui ne partage AUCUNE couleur avec elle. C'est la lecture qui
 * rend « Rouge reçoit Jaune et Bleu » exact : une Sentinelle Rouge et Jaune
 * n'est pas « d'une autre couleur » qu'une Rouge.
 */
export function isOtherColorSentinel(candidate: CardInstance, referenceColors: readonly ChromaticColor[], board: readonly CardInstance[]): boolean {
  if (!isSentinel(candidate)) return false;
  const colors = chromaticColorsOf(candidate, board);
  return colors.length > 0 && colors.every((color) => !referenceColors.includes(color));
}

/**
 * Couleurs que ce joueur CONTRÔLE pour ses effets Chromatiques : celles de
 * tout ce qui est sur son plateau — Sentinelles et Éclats — plus celles
 * qu'il revendique encore (La Première Pierre).
 */
export function controlledChromaticColors(player: PlayerState, turnNumber: number): ChromaticColor[] {
  const colors: ChromaticColor[] = [];
  for (const card of player.board) colors.push(...chromaticColorsOf(card, player.board));
  for (const claim of player.claimedChromaticColors ?? []) {
    if (turnNumber <= claim.expiresAfterTurn) colors.push(claim.color);
  }
  return uniques(colors);
}


/**
 * Affectation d'un Assemblage : chaque Sentinelle désignée doit porter la
 * couleur qu'on lui fait tenir, et les couleurs doivent toutes différer.
 * Retourne un message d'erreur stable, ou `undefined` si l'Assemblage tient.
 */
export function assemblageError(
  board: readonly CardInstance[],
  assemblage: ReadonlyArray<{ instanceId: string; color: ChromaticColor }>,
  required: number
): string | undefined {
  if (assemblage.length !== required) return `L'Assemblage demande exactement ${required} Sentinelles.`;
  if (new Set(assemblage.map((part) => part.instanceId)).size !== assemblage.length) {
    return "Une même Sentinelle ne peut servir deux fois à l'Assemblage.";
  }
  if (new Set(assemblage.map((part) => part.color)).size !== assemblage.length) {
    return "L'Assemblage demande des Sentinelles de couleurs différentes.";
  }
  for (const part of assemblage) {
    const unit = board.find((u) => u.instanceId === part.instanceId);
    if (!unit || !isSentinel(unit)) return "L'Assemblage n'accepte que des Sentinelles que vous contrôlez.";
    if (!chromaticColorsOf(unit, board).includes(part.color)) return "Cette Sentinelle n'est pas de la couleur annoncée.";
  }
  return undefined;
}

/**
 * Une affectation d'Assemblage possible sur ce plateau, s'il en existe une
 * (recherche exhaustive : quatre Sentinelles au plus sur un plateau de
 * quelques Slots). Sert à l'interface pour savoir si le bouton s'allume, et
 * au bot pour jouer le coup — jamais au moteur, qui ne choisit pas à la
 * place du joueur.
 */
export function findAssemblage(
  board: readonly CardInstance[],
  required: number
): Array<{ instanceId: string; color: ChromaticColor }> | undefined {
  const sentinels = board.filter(isSentinel).map((unit) => ({ unit, colors: chromaticColorsOf(unit, board) }));
  const chosen: Array<{ instanceId: string; color: ChromaticColor }> = [];
  const usedColors = new Set<ChromaticColor>();

  const search = (index: number): boolean => {
    if (chosen.length === required) return true;
    if (index >= sentinels.length) return false;
    const { unit, colors } = sentinels[index]!;
    for (const color of colors) {
      if (usedColors.has(color)) continue;
      chosen.push({ instanceId: unit.instanceId, color });
      usedColors.add(color);
      if (search(index + 1)) return true;
      chosen.pop();
      usedColors.delete(color);
    }
    return search(index + 1);
  };

  return search(0) ? [...chosen] : undefined;
}
