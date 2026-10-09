import { hasSubtype } from "@/game/cards/subtypes";
import { slotsUsed } from "@/game/rules/ongoing";
import { getCardDefinition } from "@/game/cards/sets/core";
import { eligibleGraveyardCards } from "@/game/effects/graveyardChoices";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameState, PlayerState } from "@/game/state/types";

/**
 * LE CIMETIÈRE ET LA PIOCHE, VUS PAR LE BOT.
 *
 * L'évaluation (`evaluateState.ts`) ne regardait ni l'un ni l'autre. Pour le
 * bot, un Cimetière plein ne valait rien, et une pioche qui s'épuise non
 * plus : il ne pouvait ni construire un plan de Cimetière (La Veillée, les
 * Épavistes) ni voir venir le Jugement de l'Océan. Le banc d'essai sous-
 * estimait donc précisément les decks dont la consigne « Test Verrier » veut
 * que le Cimetière devienne une menace (relevé du 30/09/2026 : Le Puits aux
 * Souvenirs posé une fois sur quatre, faute d'y voir le moindre intérêt).
 *
 * Tout est lu dans les DONNÉES des cartes — aucune carte n'est nommée ici :
 *   - une carte qui REPÊCHE au Cimetière (`moveGraveyardCardToHand`, ou une
 *     invocation de la carte du Cimetière désignée) donne de la valeur aux
 *     cibles qu'elle y trouverait, avec le filtre même du moteur ;
 *   - un montant COMPTÉ sur un Cimetière (`graveyardCount`) vaut ce qu'il
 *     compte déjà ;
 *   - le Jugement de l'Océan pèse d'autant plus qu'une pioche est proche de
 *     l'épuisement : vider sa pioche en tête devient un plan, la vider en
 *     retard une menace.
 *
 * Seules comptent les cartes que le joueur TIENT (main et plateau) : une
 * carte encore dans la pioche ne garantit rien, et le joueur n'en sait pas
 * l'ordre.
 */

/** Ce que rapporte une carte repêchable, rapporté à une carte en main (0,9 + coût), avant d'avoir payé le repêcheur. */
const RECURSION_SHARE = 0.5;
const CARD_IN_HAND = 0.9;
const CARD_IN_HAND_PER_COST = 0.05;
/** Valeur d'une « unité » d'un montant compté sur un Cimetière (1 dégât, 1 point de caractéristique…). */
const GRAVEYARD_COUNT_UNIT = 1.5;

interface GraveyardReaders {
  /** Effets qui désignent une carte du Cimetière du contrôleur. */
  recursion: EffectDefinition[];
  /** Montants comptés sur un Cimetière. */
  counts: Array<{ of: "self" | "opponent"; subtype?: string; cardTypes?: string[]; perCards: number; max?: number }>;
}

const NO_READERS: GraveyardReaders = { recursion: [], counts: [] };
const readersCache = new Map<string, GraveyardReaders>();

/**
 * Lecteurs de Cimetière d'une définition, trouvés en parcourant TOUTES ses
 * listes d'effets (à l'arrivée, capacités, Bris, Sabordage, options…) :
 * une nouvelle zone d'effets n'a pas à être déclarée ici pour être vue.
 */
function readersOf(cardId: string): GraveyardReaders {
  const cached = readersCache.get(cardId);
  if (cached) return cached;

  let def: unknown;
  try {
    def = getCardDefinition(cardId);
  } catch {
    // Carte masquée d'une vue projetée : on n'en sait rien.
    return NO_READERS;
  }

  const readers: GraveyardReaders = { recursion: [], counts: [] };
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === "moveGraveyardCardToHand" || (record.type === "summon" && record.cardIdFrom === "chosenGraveyardCard")) {
      readers.recursion.push(record as unknown as EffectDefinition);
    }
    if (record.kind === "graveyardCount") {
      readers.counts.push({
        of: record.of === "opponent" ? "opponent" : "self",
        subtype: typeof record.subtype === "string" ? record.subtype : undefined,
        cardTypes: Array.isArray(record.cardTypes) ? (record.cardTypes as string[]) : undefined,
        perCards: typeof record.perCards === "number" && record.perCards > 0 ? record.perCards : 1,
        max: typeof record.max === "number" ? record.max : undefined,
      });
    }
    for (const [key, value] of Object.entries(record)) {
      if (key !== "text" && key !== "name") walk(value);
    }
  };
  walk(def);

  const result = readers.recursion.length === 0 && readers.counts.length === 0 ? NO_READERS : readers;
  readersCache.set(cardId, result);
  return result;
}

function cardInHandValue(cardId: string): number {
  try {
    return CARD_IN_HAND + Math.min(getCardDefinition(cardId).cost, 8) * CARD_IN_HAND_PER_COST;
  } catch {
    return CARD_IN_HAND;
  }
}

function countIn(graveyard: PlayerState["graveyard"], subtype: string | undefined, cardTypes: string[] | undefined): number {
  if (!subtype && !cardTypes) return graveyard.length;
  return graveyard.filter((card) => {
    try {
      const def = getCardDefinition(card.cardId);
      return (!subtype || hasSubtype(def, subtype)) && (!cardTypes || cardTypes.includes(def.type));
    } catch {
      return false;
    }
  }).length;
}

/**
 * Valeur du Cimetière de `player` pour les cartes qu'il tient : cibles de
 * repêchage disponibles, et montants déjà comptés.
 */
export function graveyardValue(state: GameState, player: PlayerState): number {
  const opponent = state.players.find((p) => p.id !== player.id);
  let value = 0;

  // Chaque cible ne se repêche qu'une fois : les repêcheurs se partagent les
  // meilleures, dans l'ordre.
  const taken = new Set<string>();
  for (const card of [...player.hand, ...player.board]) {
    const readers = readersOf(card.cardId);
    for (const effect of readers.recursion) {
      let best: { id: string; value: number } | null = null;
      for (const target of eligibleGraveyardCards(state, player.id, effect)) {
        if (taken.has(target.instanceId)) continue;
        const targetValue = cardInHandValue(target.cardId);
        if (!best || targetValue > best.value) best = { id: target.instanceId, value: targetValue };
      }
      if (best) {
        taken.add(best.id);
        value += best.value * RECURSION_SHARE;
      }
    }
    for (const count of readers.counts) {
      const graveyard = count.of === "opponent" ? (opponent?.graveyard ?? []) : player.graveyard;
      const units = Math.floor(countIn(graveyard, count.subtype, count.cardTypes) / count.perCards);
      value += Math.min(units, count.max ?? Infinity) * GRAVEYARD_COUNT_UNIT;
    }
  }

  return value;
}

/**
 * LE JUGEMENT DE L'OCÉAN QUI APPROCHE.
 *
 * Piocher dans une pioche vide ne fait pas perdre : la partie se tranche à
 * la Résilience (Ancrage + Raison), puis à l'Ancrage, puis au nombre de
 * permanents (`rules/oceanJudgment.ts`). Le bot n'en savait rien — pour lui,
 * la partie durait toujours.
 *
 * `JUDGMENT_HORIZON` pioches avant l'échéance, l'avance au Jugement commence
 * à peser, et de plus en plus fort à mesure qu'elle devient certaine. Le
 * terme est borné : il fait préférer la position qui gagne le Jugement, sans
 * jamais valoir une victoire acquise.
 */
const JUDGMENT_HORIZON = 5;
const JUDGMENT_STAKE = 30;
/** Écart de Résilience à partir duquel l'issue du Jugement ne fait plus de doute. */
const JUDGMENT_DECISIVE_LEAD = 4;

function judgmentLead(me: PlayerState, opponent: PlayerState): number {
  const lead = me.anchor + me.reason - (opponent.anchor + opponent.reason);
  if (lead !== 0) return lead;
  // Départages : l'Ancrage, puis les permanents — une demi-unité suffit à dire qui passe devant.
  if (me.anchor !== opponent.anchor) return me.anchor > opponent.anchor ? 0.5 : -0.5;
  if (slotsUsed(me.board) !== slotsUsed(opponent.board)) return slotsUsed(me.board) > slotsUsed(opponent.board) ? 0.5 : -0.5;
  return 0;
}

export function oceanJudgmentPressure(me: PlayerState, opponent: PlayerState): number {
  // Une pioche par tour et par joueur : le Jugement tombe avec la première pioche vide.
  const drawsLeft = Math.min(me.deck.length, opponent.deck.length);
  if (drawsLeft >= JUDGMENT_HORIZON) return 0;

  const urgency = (JUDGMENT_HORIZON - drawsLeft) / JUDGMENT_HORIZON;
  const lead = Math.max(-1, Math.min(1, judgmentLead(me, opponent) / JUDGMENT_DECISIVE_LEAD));
  return JUDGMENT_STAKE * urgency * urgency * lead;
}
