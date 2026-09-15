import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import type { GameState, PlayerId } from "@/game/state/types";
import {
  BIG_TURN_DAMAGE,
  HIGH_ANCHOR_THRESHOLD,
  LONG_MATCH_TURNS,
  LOW_ANCHOR_THRESHOLD,
  LOW_COST_CREATURE_MAX,
} from "@/game/quests/catalog";
import type { MatchQuestProgress, MatchQuestSets, QuestObjectiveKey } from "@/game/quests/types";

/** Créatures distinctes devant infliger des dégâts pour « Ça pique ». */
const DAMAGING_CREATURES_THRESHOLD = 5;
/** Cartes d'un même type posées dans une partie pour les objectifs « dans une même partie ». */
const CARDS_IN_MATCH_THRESHOLD = 5;
/** Objets Brisés dans une même partie pour « On casse et on repart ». */
const BROKEN_IN_MATCH_THRESHOLD = 2;

export interface MatchQuestProgressInput {
  /** État FINAL, complet (jamais une vue projetée), tel que persisté par le serveur. */
  state: GameState;
  playerId: PlayerId;
  /** `true` pour une partie contre bot : les objectifs PvP n'y avancent jamais. */
  vsBot: boolean;
  won: boolean;
  /**
   * Deck utilisé par ce joueur — alimente les objectifs de la catégorie
   * DECKS (« jouer avec 2 decks différents »). Absent : ces objectifs
   * n'avancent pas, plutôt que d'être crédités à tort.
   */
  deckId?: string;
  /** `true` si cette partie était un ESSAI de préconstruit contre le bot. */
  preconTrial?: boolean;
}

export interface MatchQuestContribution {
  /** Contributions cumulables (`sum`). */
  progress: MatchQuestProgress;
  /** Valeurs distinctes apportées (`set`). */
  sets: MatchQuestSets;
}

/**
 * Contribution d'une partie terminée aux objectifs de quête d'UN joueur.
 *
 * Tout est dérivé du journal d'événements et de l'état final : le client
 * n'envoie jamais de compteur. Le filtrage par `bot_progress_allowed` n'est
 * PAS fait ici mais à l'écriture (`record_match_quest_progress`), qui
 * connaît chaque quête ; ce calcul se contente de ne rien produire pour les
 * objectifs PvP d'une partie contre bot, par cohérence.
 *
 * ATTRIBUTION DES CONSÉQUENCES. Plusieurs objectifs (« Infliger 40 dégâts »,
 * « Modifier la Marée 5 fois ») portent sur des événements que le moteur
 * n'attribue à personne : `DAMAGE` n'a pas de source, `TIDE_ADVANCED` non
 * plus. On suit donc un ACTEUR COURANT — le joueur dont la dernière action
 * explicite (pose, attaque, Bris, Sabordage) est en cours de résolution —
 * remis à zéro à chaque changement de tour ou de phase. Conséquence voulue :
 * ce qui vient de l'environnement (dégâts de Marée au tick de début de tour,
 * progression naturelle de la Marée) n'est crédité à personne, puisque
 * personne ne l'a provoqué. Les dégâts SUBIS, eux, comptent quelle qu'en
 * soit l'origine : « Ça encaisse » ne demande pas qui a frappé.
 */
export function computeMatchQuestProgress(input: MatchQuestProgressInput): MatchQuestProgress {
  return computeMatchQuestContribution(input).progress;
}

export function computeMatchQuestContribution({
  state,
  playerId,
  vsBot,
  won,
  deckId,
  preconTrial = false,
}: MatchQuestProgressInput): MatchQuestContribution {
  const progress: Record<QuestObjectiveKey, number> = {
    play_cards: 0,
    play_creatures: 0,
    play_low_cost_creatures: 0,
    play_marins: 0,
    play_structures: 0,
    play_objects: 0,
    play_or_break_objects: 0,
    break_objects: 0,
    draw_extra_cards: 0,
    creatures_in_match: 0,
    objects_in_match: 0,
    broken_objects_in_match: 0,
    play_matches: 1,
    win_matches: 0,
    win_pvp_matches: 0,
    long_matches: 0,
    distinct_decks_played: 0,
    distinct_decks_won: 0,
    precon_trials: preconTrial ? 1 : 0,
    deal_damage: 0,
    take_damage: 0,
    pvp_ship_damage: 0,
    scuttle_structures: 0,
    finish_high_anchor: 0,
    finish_low_anchor: 0,
    damage_in_one_turn: 0,
    damaging_creatures_in_match: 0,
    modify_tide: 0,
    tide_rise: 0,
    tide_fall: 0,
    reach_abysses: 0,
    tide_both_ways_in_match: 0,
  };

  const defByInstance = new Map<string, CardDefinition>();
  const ownerByInstance = new Map<string, PlayerId>();
  const safeDef = (cardId: string): CardDefinition | undefined => {
    try {
      return getCardDefinition(cardId);
    } catch {
      return undefined;
    }
  };

  for (const player of state.players) {
    for (const card of [...player.deck, ...player.hand, ...player.board, ...player.graveyard]) {
      const def = safeDef(card.cardId);
      if (def) defByInstance.set(card.instanceId, def);
      ownerByInstance.set(card.instanceId, player.id);
    }
  }

  const opponentId = state.players.find((p) => p.id !== playerId)?.id;
  /** Joueur dont l'action est en cours de résolution — `null` hors action. */
  let actor: PlayerId | null = null;
  /** Une attaque directe (sans défenseur) est en cours : le prochain DAMAGE au Navire adverse est le sien. */
  let awaitingDirectDamage = false;
  /** Attaquant de l'attaque en cours, pour « Ça pique ». */
  let currentAttacker: string | null = null;
  let ownTurns = 0;
  let draws = 0;
  /** Dégâts infligés pendant le tour en cours, pour « Gros calibre ». */
  let damageThisTurn = 0;
  let bestTurnDamage = 0;
  /** Créatures distinctes du joueur ayant infligé des dégâts. */
  const damagingCreatures = new Set<string>();
  let tideRose = false;
  let tideFell = false;

  const closeTurn = () => {
    bestTurnDamage = Math.max(bestTurnDamage, damageThisTurn);
    damageThisTurn = 0;
    actor = null;
    awaitingDirectDamage = false;
    currentAttacker = null;
  };

  for (const event of state.eventLog) {
    switch (event.type) {
      case "TURN_STARTED":
        if (event.playerId === playerId) ownTurns += 1;
        closeTurn();
        break;
      case "END_TURN":
      case "PHASE_CHANGED":
        closeTurn();
        break;

      case "DRAW_CARD":
        if (event.playerId === playerId) draws += 1;
        break;

      case "PLAY_CARD": {
        actor = event.playerId;
        awaitingDirectDamage = false;
        currentAttacker = null;
        if (event.playerId !== playerId) break;
        progress.play_cards += 1;
        const def = safeDef(event.cardId);
        if (!def) break;
        if (def.type === "creature") {
          progress.play_creatures += 1;
          if (def.cost <= LOW_COST_CREATURE_MAX) progress.play_low_cost_creatures += 1;
        } else if (def.type === "marin") progress.play_marins += 1;
        else if (def.type === "structure") progress.play_structures += 1;
        else if (def.type === "objet") progress.play_objects += 1;
        break;
      }

      case "OBJECT_BROKEN":
        actor = event.playerId;
        awaitingDirectDamage = false;
        currentAttacker = null;
        // `OBJECT_BROKEN` porte le fait de jeu « Briser », main comprise —
        // bien plus fiable que de deviner un Bris depuis un CARD_MOVED.
        if (event.playerId === playerId) progress.break_objects += 1;
        break;

      case "SABORDED":
        actor = event.playerId;
        awaitingDirectDamage = false;
        currentAttacker = null;
        if (event.playerId === playerId && defByInstance.get(event.instanceId)?.type === "structure") {
          progress.scuttle_structures += 1;
        }
        break;

      case "ATTACK": {
        actor = event.playerId;
        awaitingDirectDamage = event.playerId === playerId && !event.defenderInstanceId;
        currentAttacker = event.playerId === playerId ? event.attackerInstanceId : null;
        if (event.playerId !== playerId) break;
        break;
      }

      case "DAMAGE": {
        const targetsOwnUnit = event.targetInstanceId !== undefined && ownerByInstance.get(event.targetInstanceId) === playerId;
        const targetsOwnShip = event.targetPlayerId === playerId;
        // Dégâts SUBIS : comptés quelle que soit l'origine (Marée comprise).
        if (targetsOwnUnit || targetsOwnShip) progress.take_damage += event.amount;

        if (actor !== playerId) break;
        const targetsOpponentUnit = event.targetInstanceId !== undefined && ownerByInstance.get(event.targetInstanceId) === opponentId;
        const targetsOpponentShip = event.targetPlayerId !== undefined && event.targetPlayerId === opponentId;
        if (targetsOpponentUnit || targetsOpponentShip) {
          progress.deal_damage += event.amount;
          damageThisTurn += event.amount;
          // « Ça pique » : la Créature à l'origine de l'attaque en cours.
          if (currentAttacker && defByInstance.get(currentAttacker)?.type === "creature") damagingCreatures.add(currentAttacker);
        }
        if (awaitingDirectDamage && targetsOpponentShip) {
          progress.pvp_ship_damage += event.amount;
          awaitingDirectDamage = false;
        }
        break;
      }

      case "TIDE_ADVANCED":
        // Une progression NATURELLE arrive hors action (`actor` nul) : seule
        // une transition forcée par une carte du joueur compte comme une
        // modification de Marée.
        if (actor === playerId) {
          progress.modify_tide += 1;
          if (event.tideOrientation === "montante") {
            progress.tide_rise += 1;
            tideRose = true;
          } else {
            progress.tide_fall += 1;
            tideFell = true;
          }
        }
        if (event.stateChanged && event.tideState === "abysses") progress.reach_abysses += 1;
        break;

      case "TIDE_MODIFIED":
      case "TIDE_ORIENTATION_CHANGED":
        // Ces deux-là ne sont émis QUE par un effet de carte.
        if (actor === playerId) {
          progress.modify_tide += 1;
          if (event.type === "TIDE_ORIENTATION_CHANGED") {
            if (event.orientation === "montante") tideRose = true;
            else tideFell = true;
          }
        }
        break;

      default:
        break;
    }
  }
  closeTurn();

  // « Cartes supplémentaires » = au-delà de la pioche automatique de début
  // de tour. La main de départ n'émet pas de DRAW_CARD, elle ne fausse donc
  // pas le compte.
  progress.draw_extra_cards = Math.max(0, draws - ownTurns);
  progress.play_or_break_objects = progress.play_objects + progress.break_objects;

  // --- Seuils PAR PARTIE : la partie rapporte 1 si elle les atteint ------
  if (progress.play_creatures >= CARDS_IN_MATCH_THRESHOLD) progress.creatures_in_match = 1;
  if (progress.play_objects >= CARDS_IN_MATCH_THRESHOLD) progress.objects_in_match = 1;
  if (progress.break_objects >= BROKEN_IN_MATCH_THRESHOLD) progress.broken_objects_in_match = 1;
  if (bestTurnDamage >= BIG_TURN_DAMAGE) progress.damage_in_one_turn = 1;
  if (damagingCreatures.size >= DAMAGING_CREATURES_THRESHOLD) progress.damaging_creatures_in_match = 1;
  if (tideRose && tideFell) progress.tide_both_ways_in_match = 1;
  if (state.turnNumber >= LONG_MATCH_TURNS) progress.long_matches = 1;

  const anchor = state.players.find((p) => p.id === playerId)?.anchor ?? 0;
  if (anchor >= HIGH_ANCHOR_THRESHOLD) progress.finish_high_anchor = 1;
  // « À un fil » : terminer bas, mais debout — à 0 Ancrage la partie est perdue.
  if (anchor > 0 && anchor <= LOW_ANCHOR_THRESHOLD) progress.finish_low_anchor = 1;

  if (won) progress.win_matches = 1;
  if (vsBot) {
    progress.pvp_ship_damage = 0;
  } else if (won) {
    progress.win_pvp_matches = 1;
  }

  // --- Ensembles : decks distincts ---------------------------------------
  const sets: MatchQuestSets = {};
  if (deckId) {
    sets.distinct_decks_played = [deckId];
    if (won) sets.distinct_decks_won = [deckId];
  }

  return {
    // Seules les contributions non nulles sont transmises à la base.
    progress: Object.fromEntries(Object.entries(progress).filter(([, value]) => value > 0)) as MatchQuestProgress,
    sets,
  };
}
