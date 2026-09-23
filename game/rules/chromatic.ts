import { getCardDefinition } from "@/game/cards/sets/core";
import { CHROMATIC_COLORS, UNIT_CARD_TYPES, type CardInstance, type ChromaticColor } from "@/game/cards/types";
import type { PlayerState } from "@/game/state/types";

/**
 * SENTINELLES CHROMATIQUES — la règle de famille (Lot 15, Notion
 * « Éclats en Selle » § Règle centrale — Signaux Chromatiques).
 *
 * Des marins ont trouvé des pierres qui réagissent à leur porteur. Chaque
 * pierre donne une COULEUR, et chaque couleur émet un SIGNAL dont profitent
 * les Sentinelles des AUTRES couleurs : avec Rouge + Jaune + Bleu en jeu,
 * Rouge reçoit Jaune et Bleu, Jaune reçoit Rouge et Bleu, Bleu reçoit Rouge
 * et Jaune. Une Sentinelle ne reçoit pas naturellement son propre Signal, et
 * deux Signaux de même couleur ne se cumulent pas.
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

/** Signaux actifs sur ce plateau — un par couleur, quel que soit le nombre d'émetteurs. */
export function activeSignals(board: readonly CardInstance[]): Set<ChromaticColor> {
  const active = new Set<ChromaticColor>();
  for (const unit of board) for (const color of emittedSignalsOf(unit)) active.add(color);
  return active;
}

/**
 * Cette Sentinelle bénéficie-t-elle du Signal de cette couleur ?
 *
 * Il faut qu'une AUTRE carte l'émette, et qu'elle-même ne soit pas de cette
 * couleur — « vos Sentinelles d'une autre couleur ». Bénéficier de son
 * propre Signal est l'exception, et elle se déclare (Géant, Synchronisation).
 */
export function benefitsFromSignal(unit: CardInstance, color: ChromaticColor, board: readonly CardInstance[]): boolean {
  if (!isSentinel(unit)) return false;
  if (benefitsFromOwnSignals(unit)) return activeSignals(board).has(color);
  if (chromaticColorsOf(unit, board).includes(color)) return false;
  return board.some((other) => other.instanceId !== unit.instanceId && emittedSignalsOf(other).includes(color));
}

/** Première carte, autre que `unit`, qui émet ce Signal — la source que la fiche de carte cite. */
export function signalEmitter(unit: CardInstance, color: ChromaticColor, board: readonly CardInstance[]): CardInstance | undefined {
  return board.find((other) => other.instanceId !== unit.instanceId && emittedSignalsOf(other).includes(color)) ?? (emittedSignalsOf(unit).includes(color) ? unit : undefined);
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
 * Ce Signal a-t-il déjà servi ce tour-ci pour ce joueur ? « La première fois
 * à chaque tour… » se lit sur le JOUEUR : deux émetteurs de la même couleur
 * ne donnent qu'un Signal, donc qu'un usage.
 */
export function signalAvailable(player: PlayerState, color: ChromaticColor, turnNumber: number): boolean {
  return player.chromaticSignalTurns?.[color] !== turnNumber;
}

/** Marque ce Signal comme utilisé ce tour-ci. */
export function markSignalUsed(player: PlayerState, color: ChromaticColor, turnNumber: number): PlayerState {
  return { ...player, chromaticSignalTurns: { ...(player.chromaticSignalTurns ?? {}), [color]: turnNumber } };
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
