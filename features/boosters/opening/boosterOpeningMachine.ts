/**
 * Machine d'états de la scène d'ouverture — PURE (aucun timer, aucun DOM).
 * Le contrôleur décide QUAND envoyer les événements ; ce réducteur décide
 * seulement ce qu'ils ont le droit de changer.
 *
 *   idle ─assetsReady→ enter ─packSettled→ ready ─openRequested→ opening
 *        ─packTorn→ cardsSpawning ─cardsPlaced→ cardsReady ⇄ revealing → completed
 *
 * `ready` : le sachet est arrivé au centre et ATTEND le geste du joueur. Le
 * paquet ne s'ouvrait autrefois tout seul — l'ouvrir est pourtant le moment
 * qu'on vient chercher.
 */

export type BoosterOpeningPhase =
  | "idle"
  | "enter"
  | "ready"
  | "opening"
  | "cardsSpawning"
  | "cardsReady"
  | "revealing"
  | "completed";

/**
 * `charging` = pause d'anticipation (raretés hautes) ; `flipping` =
 * retournement en cours. Vu de l'extérieur, une carte est « hidden » tant
 * qu'elle n'est pas `revealed`.
 */
export type BoosterCardRevealState = "hidden" | "charging" | "flipping" | "revealed";

export interface BoosterOpeningState {
  phase: BoosterOpeningPhase;
  cards: BoosterCardRevealState[];
}

export type BoosterOpeningEvent =
  | { type: "assetsReady" }
  | { type: "packSettled" }
  | { type: "openRequested" }
  | { type: "packTorn" }
  | { type: "cardsPlaced" }
  /** `withPause` : la carte passe d'abord par `charging`. */
  | { type: "revealRequested"; index: number; withPause: boolean }
  | { type: "flipStarted"; index: number }
  | { type: "cardRevealed"; index: number };

export function createBoosterOpeningState(cardCount: number): BoosterOpeningState {
  return { phase: "idle", cards: Array.from({ length: cardCount }, () => "hidden") };
}

/** Phase d'interaction déduite de l'état des cartes. */
function interactionPhase(cards: readonly BoosterCardRevealState[]): BoosterOpeningPhase {
  if (cards.every((card) => card === "revealed")) return "completed";
  if (cards.some((card) => card === "charging" || card === "flipping")) return "revealing";
  return "cardsReady";
}

function withCard(
  state: BoosterOpeningState,
  index: number,
  from: BoosterCardRevealState,
  to: BoosterCardRevealState,
): BoosterOpeningState {
  if (state.cards[index] !== from) return state;
  const cards = state.cards.slice();
  cards[index] = to;
  return { phase: interactionPhase(cards), cards };
}

const INTERACTIVE_PHASES: readonly BoosterOpeningPhase[] = ["cardsReady", "revealing"];

export function boosterOpeningReducer(state: BoosterOpeningState, event: BoosterOpeningEvent): BoosterOpeningState {
  switch (event.type) {
    case "assetsReady":
      return state.phase === "idle" ? { ...state, phase: "enter" } : state;
    case "packSettled":
      return state.phase === "enter" ? { ...state, phase: "ready" } : state;
    case "openRequested":
      return state.phase === "ready" ? { ...state, phase: "opening" } : state;
    case "packTorn":
      return state.phase === "opening" ? { ...state, phase: "cardsSpawning" } : state;
    case "cardsPlaced":
      return state.phase === "cardsSpawning" ? { ...state, phase: interactionPhase(state.cards) } : state;
    case "revealRequested":
      if (!INTERACTIVE_PHASES.includes(state.phase)) return state;
      return withCard(state, event.index, "hidden", event.withPause ? "charging" : "flipping");
    case "flipStarted":
      return withCard(state, event.index, "charging", "flipping");
    case "cardRevealed":
      return withCard(state, event.index, "flipping", "revealed");
    default:
      return state;
  }
}

export function isCardInteractive(state: BoosterOpeningState, index: number): boolean {
  return INTERACTIVE_PHASES.includes(state.phase) && state.cards[index] === "hidden";
}
