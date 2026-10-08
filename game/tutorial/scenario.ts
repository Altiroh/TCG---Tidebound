import { getShipDefinition } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import { startingReasonCap } from "@/game/state/reason";
import type { CardInstance } from "@/game/cards/types";
import type { GameState, PlayerState } from "@/game/state/types";

/**
 * Tutoriel — PARTIE SCÉNARISÉE (06/10/2026).
 *
 * Le tutoriel ne commence plus au premier tour d'une partie vierge : il
 * ouvre une partie DÉJÀ EN COURS, au troisième tour du joueur, avec ce
 * qu'il faut sur la table pour que chaque leçon trouve son exemple :
 *
 *   - en main : une unité ordinaire, une unité à Pied marin, un Objet
 *     dont le Bris ne demande aucune cible, et une Lande qui retire la
 *     Garde (08/10/2026 : la carte de terrain du Pont) ;
 *   - sur le plateau du joueur : une Structure à « Sabordage : » ;
 *   - en face : une unité à Garde et une unité offensive, pour que le
 *     combat du tour suivant ait un sens (abattre la Garde, se protéger) ;
 *   - la Marée en Calme, à un tour de changer : elle bascule pendant le
 *     tour adverse, sous les yeux du joueur.
 *
 * Le reste (pioche, Navires, mains complétées) vient des préconstruits :
 * une fois les leçons passées, la partie se joue normalement jusqu'au bout.
 *
 * Fonction PURE : même état d'entrée, même partie scénarisée.
 */

/** Cartes que les étapes nomment (`game/tutorial/steps.ts`). */
export const TUTORIAL_CARDS = {
  /** Unité ordinaire à poser : Gabière du Grand Large (`charpentier-de-bord`), 2 Raison, 2/3, sans texte. */
  unit: "charpentier-de-bord",
  /** Pied marin : Sterne des Embruns, 1 Raison. */
  piedMarin: "sterne-des-embruns",
  /** Objet à Briser, sans cible : Thermos du Dernier Quart (récupérez 2 Raison). */
  object: "thermos-du-dernier-quart",
  /** Structure à Saborder : Caisse des Dernières Planches (1 Ancrage, 1 carte). */
  structure: "caisse-des-dernieres-planches",
  /** Garde adverse : Mouette du Brise-Lames, 1/4. */
  garde: "mouette-du-brise-lames",
  /** Unité adverse offensive, fragile : Murène Aveugle, 3/1. */
  threat: "murene-aveugle",
  /** Lande : Pluie corrosive, 3 Raison — « Les permanents perdent Garde », pour les deux camps. */
  lande: "pluie-corrosive",
} as const;

/** Tour de table où la partie scénarisée reprend : le troisième tour du joueur qui commence. */
export const TUTORIAL_START_TURN = 5;

/** Ancrage déjà perdu de part et d'autre : une partie engagée, pas une table vide. */
const ANCHOR_ALREADY_LOST = { player: 4, opponent: 6 } as const;

function scenarioCard(cardId: string, ownerId: string, index: number, overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    instanceId: `tuto_${ownerId}_${cardId}_${index}`,
    cardId,
    ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
    ...overrides,
  };
}

/** Raison et plafond du `ownTurnIndex`-ième tour du joueur, comme la courbe réelle les donnerait. */
function reasonAt(player: PlayerState, ownTurnIndex: number): Pick<PlayerState, "reason" | "reasonCap"> {
  const cap = startingReasonCap(getShipDefinition(player.shipId).reasonMax, ownTurnIndex);
  const ceiling = cap ?? player.reasonMax;
  return { reason: ceiling, reasonCap: cap };
}

/**
 * Pose le scénario sur une partie fraîchement créée (`createGameState`) :
 * `players[0]` est le joueur guidé, `players[1]` le bot.
 */
export function applyTutorialScenario(state: GameState): GameState {
  const [me, them] = state.players;
  const myShip = getShipDefinition(me.shipId);
  const theirShip = getShipDefinition(them.shipId);

  // La main d'ouverture garde deux cartes du préconstruit, pour que la suite
  // de la partie ait de quoi vivre ; les trois cartes des leçons passent devant.
  const lessonHand = [TUTORIAL_CARDS.unit, TUTORIAL_CARDS.piedMarin, TUTORIAL_CARDS.object, TUTORIAL_CARDS.lande].map((id, i) => scenarioCard(id, me.id, i));
  const player: PlayerState = {
    ...me,
    ...reasonAt(me, Math.ceil(TUTORIAL_START_TURN / 2)),
    anchor: myShip.startingAnchor - ANCHOR_ALREADY_LOST.player,
    hand: [...lessonHand, ...me.hand.slice(0, 2)],
    deck: [...me.hand.slice(2), ...me.deck],
    board: [scenarioCard(TUTORIAL_CARDS.structure, me.id, 0, { turnsRemaining: 2 })],
  };

  const opponent: PlayerState = {
    ...them,
    ...reasonAt(them, Math.floor(TUTORIAL_START_TURN / 2)),
    anchor: theirShip.startingAnchor - ANCHOR_ALREADY_LOST.opponent,
    board: [scenarioCard(TUTORIAL_CARDS.garde, them.id, 0), scenarioCard(TUTORIAL_CARDS.threat, them.id, 0)],
  };

  return {
    ...state,
    players: [player, opponent],
    turnNumber: TUTORIAL_START_TURN,
    activePlayerId: me.id,
    priorityPlayerId: me.id,
    phase: "mainPhase",
    environment: {
      ...state.environment,
      tideState: "calme",
      tideOrientation: "montante",
      // Un tour : elle change pendant le tour adverse, que le joueur observe.
      tideRemainingTurns: Math.min(1, RULES.TIDE_STATE_DURATION.calme),
    },
  };
}
