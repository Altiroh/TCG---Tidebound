import { CORE_SET, getCardDefinition, getMaxCopies, isAbyssalVariant, UNIT_CARD_TYPES, type CardDefinition } from "@/game";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import type { CardRarity } from "@/game/boosters/types";
import { GAME_TERMS } from "@/features/match/cardDisplay";

/**
 * Dérivations pour la fiche détaillée d'une carte.
 *
 * Règle de ce fichier : ne rendre QUE des données qui existent réellement.
 * Le modèle Tidebound n'a ni numéro de collection, ni texte d'ambiance
 * séparé, ni artiste, ni quantité possédée (`CollectionScreen` ne reçoit
 * que des identifiants) — rien de tout cela n'est donc fabriqué ici. Une
 * information absente fait disparaître sa ligne, elle n'est jamais
 * remplacée par un texte de remplissage.
 */

export interface CardDetailStat {
  key: "cost" | "attack" | "health";
  label: string;
  value: number;
}

export interface CardDetailModel {
  def: CardDefinition;
  /** `null` pour une carte hors table de rareté (jeton, carte de test). */
  rarity: CardRarity | null;
  isAbyssal: boolean;
  /** Sous-type affichable autre qu'« abyssal » (ex: « poisson »). */
  otherSubtype: string | null;
  stats: CardDetailStat[];
  keywords: string[];
  maxCopies: number;
  /**
   * Contrepartie Standard ↔ Abyssale, quand elle existe VRAIMENT dans le
   * catalogue. La convention d'identifiant (`<base>-abyssal`) ne suffit
   * pas : plusieurs variantes Abyssales n'ont pas de version Standard
   * (« Revenante de la Fosse »), d'où une vraie recherche dans `CORE_SET`
   * plutôt qu'un identifiant construit et supposé valide.
   */
  counterpart: { id: string; name: string; kind: "standard" | "abyssal" } | null;
}

const ABYSSAL_SUFFIX = "-abyssal";

function findCounterpart(def: CardDefinition): CardDetailModel["counterpart"] {
  const targetId = def.id.endsWith(ABYSSAL_SUFFIX)
    ? def.id.slice(0, -ABYSSAL_SUFFIX.length)
    : `${def.id}${ABYSSAL_SUFFIX}`;
  const found = CORE_SET.find((candidate) => candidate.id === targetId);
  if (!found) return null;
  return { id: found.id, name: found.name, kind: found.id.endsWith(ABYSSAL_SUFFIX) ? "abyssal" : "standard" };
}

export function buildCardDetailModel(cardId: string): CardDetailModel {
  const def = getCardDefinition(cardId);
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);

  // Mêmes règles d'affichage que `CardInfoPanel` : une Structure n'a pas de
  // Puissance, un Objet n'a souvent ni l'une ni l'autre.
  const stats: CardDetailStat[] = [{ key: "cost", label: "Coût", value: def.cost }];
  if (isUnit || def.attack !== undefined) stats.push({ key: "attack", label: "Puissance", value: def.attack ?? 0 });
  if (def.health !== undefined) stats.push({ key: "health", label: "Résistance", value: def.health });

  return {
    def,
    rarity: rarityForCardId(def.id),
    isAbyssal: isAbyssalVariant(def),
    otherSubtype: def.subtype ?? null,
    stats,
    keywords: def.keywords ?? [],
    maxCopies: getMaxCopies(def),
    counterpart: findCounterpart(def),
  };
}

/** Un fragment de texte d'effet : `emphasis` dit comment le rendre, jamais quoi afficher. */
export interface EffectSegment {
  text: string;
  emphasis: "none" | "value" | "term";
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Un seul passage de découpe, deux alternatives :
 *   1. une valeur chiffrée collée à une grandeur (« +2 Puissance ») ;
 *   2. un terme de jeu isolé (`GAME_TERMS`).
 * L'alternative 1 passe en premier pour que « +2 Puissance » sorte d'un
 * bloc plutôt qu'en « +2 » suivi d'un terme surligné séparément.
 * `\p{L}` (avec le drapeau `u`) tient compte des accents, là où `\b` sur
 * « Résistance » ou « Marée » coupe au mauvais endroit.
 */
const VALUE_PATTERN = `[+-]\\d+(?:\\s+(?:${GAME_TERMS.map(escapeForRegExp).join("|")}))?`;
const TERM_PATTERN = GAME_TERMS.map(escapeForRegExp).join("|");
const EFFECT_PATTERN = new RegExp(`(${VALUE_PATTERN})|((?<!\\p{L})(?:${TERM_PATTERN})(?!\\p{L}))`, "gu");

/**
 * Découpe le texte d'une carte en fragments pour mise en valeur.
 *
 * Le texte original n'est jamais modifié, réécrit ni réordonné : la
 * concaténation des fragments rendus redonne exactement `text`. C'est la
 * seule garantie qui compte ici — une fiche de carte qui altère le texte
 * de règles est un bug de jeu, pas un détail de présentation.
 */
export function segmentEffectText(text: string): EffectSegment[] {
  const segments: EffectSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(EFFECT_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ text: text.slice(cursor, start), emphasis: "none" });
    segments.push({ text: match[0], emphasis: match[1] ? "value" : "term" });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), emphasis: "none" });
  return segments;
}
