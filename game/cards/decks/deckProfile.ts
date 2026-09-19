import { CORE_SET, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, CardId } from "@/game/cards/types";
import type { TriggerType } from "@/game/triggers/types";
import type { DeckDifficulty } from "@/game/cards/decks/catalog";
import { deckStyleLabel, type DeckStyleId } from "@/game/cards/decks/deckStyles";

/**
 * PROFIL D'UN DECK, lu dans ses cartes.
 *
 * Les listes du jeu (`catalog.ts`) portent un `style`, une `difficulty` et
 * des `mechanics` écrits à la main, et c'est ce qui permet à leur fiche de
 * dire quelque chose. Un deck monté par le joueur n'en avait aucun : sa
 * fiche se réduisait à son nom, son Navire et « Deck personnel ». Ce module
 * rend les trois en les DÉDUISANT de la composition — rien à saisir, et les
 * decks déjà montés en profitent sans rien faire.
 *
 * NE S'APPLIQUE QU'AUX DECKS PERSONNELS. Une liste du catalogue garde ses
 * métadonnées écrites : elles disent une INTENTION de design que l'
 * arithmétique ne retrouvera jamais — « Bec dans la Brume » et
 * « Grenouilles au Canon » ont le même coût moyen (1,90) et ne jouent pas
 * du tout au même jeu.
 *
 * Trois règles que ce module s'impose :
 *
 *   1. Il ne dit que ce que le joueur peut VÉRIFIER sur ses cartes : des
 *      mots-clés imprimés, des types, une courbe de coût. Jamais
 *      `CardDefinition.archetype` — « aucun archétype ne doit être nommé
 *      côté joueur » (décision du 2026-09-14, cf. `archetypes.ts`), et la
 *      famille se reconnaît aux noms et aux illustrations.
 *   2. Il n'invente pas de vocabulaire : chaque libellé rendu ici existe
 *      déjà dans les métadonnées écrites du catalogue. Un deck personnel et
 *      un deck de test doivent se lire dans la même langue.
 *   3. Il ne juge rien d'ÉQUILIBRAGE. Le rôle est une lecture de la courbe,
 *      la difficulté une mesure de ce que le deck demande de suivre — pas
 *      une note de puissance.
 *
 * Fonction PURE d'une liste d'identifiants : mêmes cartes, même profil.
 */

/** Ce qu'une fiche de deck sait afficher, qu'il soit du catalogue ou monté par le joueur. */
export interface DeckProfile {
  /** « Agressif », « Contrôle »… — la phrase que le joueur lit d'abord. */
  style: string;
  /**
   * Le même type, en valeur d'ÉNUMÉRATION (`DECK_STYLES`) : c'est lui qui
   * se filtre, se range en base et se propose dans un menu. Le libellé
   * ci-dessus n'est que sa traduction à l'écran.
   */
  styleId: DeckStyleId;
  difficulty: DeckDifficulty;
  /** 1 à 3 entrées courtes, de la plus caractéristique à la moins. */
  mechanics: string[];
}

/**
 * Le catalogue collectionnable, jetons exclus : c'est la RÉFÉRENCE contre
 * laquelle un deck se mesure. Rien n'est caractéristique dans l'absolu —
 * un quart des cartes du jeu portent une durée, donc un deck qui en a un
 * quart ne fait que ressembler au jeu.
 */
const POOL: readonly CardDefinition[] = CORE_SET.filter((card) => !card.token);

/**
 * Bornes de courbe, en coût MOYEN par carte, ajustées sur ce que les listes
 * existantes donnent réellement : les dix du catalogue v4 s'étalent de 1,88
 * à 3,00 pour une moyenne de catalogue à 2,87. Des bornes « naturelles »
 * (2, 3, 4…) rangeraient presque toutes les listes dans la même case.
 *
 * Chaque palier désigne une valeur de l'ÉNUMÉRATION (`DECK_STYLES`), pas
 * une phrase : le type déduit et le type choisi par le joueur doivent se
 * ranger dans la même case. « Combo » ne figure pas ici et n'y figurera
 * pas — une courbe ne voit pas un combo, seul le joueur sait qu'il en monte
 * un, et c'est précisément pourquoi il peut corriger ce qui est déduit.
 */
const STYLE_BY_CURVE: ReadonlyArray<{ upTo: number; style: DeckStyleId }> = [
  { upTo: 2.15, style: "agressif" },
  { upTo: 2.45, style: "tempo" },
  { upTo: 2.8, style: "midrange" },
  { upTo: 3.1, style: "controle" },
  { upTo: Infinity, style: "defensif" },
];

/**
 * Une mécanique est retenue quand le deck en porte NETTEMENT plus que le
 * pool : au moins `floor` de ses cartes, et au moins 1,8 fois la part du
 * catalogue. Les deux conditions servent — le facteur seul ferait ressortir
 * une carte isolée d'une mécanique rare, le plancher seul laisserait passer
 * ce que tout le monde a.
 */
interface MechanicRule {
  label: string;
  floor: number;
  matches: (def: CardDefinition) => boolean;
}

const MECHANIC_RULES: readonly MechanicRule[] = [
  // Ce que les cartes DISENT : leurs mots-clés imprimés.
  { label: "Garde", floor: 0.1, matches: (def) => hasKeyword(def, "garde") },
  // Libellé écrit ici plutôt que lu dans la couche d'affichage : le moteur
  // ne remonte jamais vers `features/` (CLAUDE.md). « Pied marin » est du
  // vocabulaire verrouillé, pas une traduction d'interface.
  { label: "Pied marin", floor: 0.1, matches: (def) => hasKeyword(def, "pied-marin") },

  // Ce qu'elles FONT, lu sur la structure de la définition.
  { label: "Sabordage", floor: 0.12, matches: (def) => hasTrigger(def, "onSaborde") },
  { label: "Défausse volontaire", floor: 0.12, matches: (def) => hasTrigger(def, "onDiscarded") },
  { label: "Manipulation de Marée", floor: 0.25, matches: (def) => Boolean(def.visibleDuringTide?.length) },
  { label: "Durée et Intensité de Marée", floor: 0.4, matches: (def) => typeof def.durationTurns === "number" },

  // Ce qu'elles SONT : la composition par type et par courbe.
  { label: "Structures de soutien", floor: 0.32, matches: (def) => def.type === "structure" },
  { label: "Objets à faible coût", floor: 0.2, matches: (def) => def.type === "objet" && def.cost <= 2 },
  { label: "Petits corps équipés", floor: 0.18, matches: (def) => def.type === "equipement" },
  { label: "Petits corps rapides", floor: 0.45, matches: (def) => isUnit(def) && def.cost <= 2 },
  { label: "Gros permanents tardifs", floor: 0.2, matches: (def) => def.cost >= 5 },
];

/** Part du POOL qui vérifie chaque règle — la référence, calculée une fois. */
const POOL_SHARES: readonly number[] = MECHANIC_RULES.map(
  (rule) => POOL.filter(rule.matches).length / Math.max(1, POOL.length)
);

function isUnit(def: CardDefinition): boolean {
  return def.type === "marin" || def.type === "creature";
}

function hasKeyword(def: CardDefinition, keyword: string): boolean {
  return Boolean(def.keywords?.includes(keyword)) || Boolean(def.conditionalKeywords?.some((entry) => entry.keyword === keyword));
}

function hasTrigger(def: CardDefinition, trigger: TriggerType): boolean {
  return Boolean(def.abilities?.some((ability) => ability.trigger === trigger));
}

/**
 * Ce que le deck demande de SUIVRE : une capacité déclenchée qu'il faut
 * guetter, une durée qui s'égrène, une carte qui n'apparaît que sous
 * certaines Marées. Trois choses qui se comptent, et qui font la différence
 * entre une liste qu'on pose et une liste qu'on pilote.
 */
function demandsTracking(def: CardDefinition): boolean {
  return Boolean(def.abilities?.length) || typeof def.durationTurns === "number" || Boolean(def.visibleDuringTide?.length);
}

const POOL_TRACKING = POOL.filter(demandsTracking).length / Math.max(1, POOL.length);

/** Repli silencieux : une carte inconnue (deck plus vieux que le catalogue) ne fait pas planter une fiche. */
function safeDefinition(cardId: CardId): CardDefinition | null {
  try {
    return getCardDefinition(cardId);
  } catch {
    return null;
  }
}

/**
 * Le profil d'une liste de cartes — `null` si elle est vide ou si aucune de
 * ses cartes n'est au catalogue, auquel cas la fiche s'en tient au nom et
 * au Navire plutôt que d'afficher un profil calculé sur rien.
 */
export function deckProfile(cardIds: readonly CardId[]): DeckProfile | null {
  const defs = cardIds.map(safeDefinition).filter((def): def is CardDefinition => def !== null);
  if (defs.length === 0) return null;

  const averageCost = defs.reduce((sum, def) => sum + def.cost, 0) / defs.length;
  const styleId = STYLE_BY_CURVE.find((entry) => averageCost <= entry.upTo)!.style;

  const mechanics = MECHANIC_RULES.map((rule, index) => {
    const share = defs.filter(rule.matches).length / defs.length;
    const baseline = POOL_SHARES[index] ?? 0;
    return { label: rule.label, share, floor: rule.floor, ratio: baseline > 0 ? share / baseline : share > 0 ? Infinity : 0 };
  })
    .filter((entry) => entry.share >= entry.floor && entry.ratio >= 1.8)
    // Le plus caractéristique d'abord : l'écart au pool, pas la part brute.
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .map((entry) => entry.label);

  // Une liste sans mécanique saillante n'est pas une liste sans identité :
  // c'est une courbe, et la courbe se dit.
  if (mechanics.length === 0) mechanics.push(averageCost <= 2.6 ? "Faible courbe" : "Courbe équilibrée");

  return { style: deckStyleLabel(styleId), styleId, difficulty: difficultyOf(defs), mechanics };
}

/**
 * La difficulté, de 1 à 5 : l'écart entre ce que CE deck demande de suivre
 * et ce qu'en demande le jeu en moyenne. Un deck entièrement fait de cartes
 * à surveiller vaut 5, un deck qui n'en a aucune vaut 1, et le jeu moyen
 * tombe au milieu. Aucune appréciation de puissance — un deck « difficile »
 * ici est un deck qui occupe.
 */
function difficultyOf(defs: readonly CardDefinition[]): DeckDifficulty {
  const share = defs.filter(demandsTracking).length / defs.length;
  const middle = POOL_TRACKING || 0.5;
  const score = share <= middle ? 1 + (share / middle) * 2 : 3 + ((share - middle) / Math.max(0.0001, 1 - middle)) * 2;
  return Math.min(5, Math.max(1, Math.round(score))) as DeckDifficulty;
}
