import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES, type CardDefinition } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerId } from "@/game/state/types";
import { RULES } from "@/game/rules/constants";
import type { TideStateName } from "@/game/environment/types";
import {
  BIG_CARD_MIN_COST,
  BIG_TURN_DAMAGE,
  HIGH_ANCHOR_THRESHOLD,
  LONG_MATCH_TURNS,
  LOW_ANCHOR_THRESHOLD,
  LOW_COST_CREATURE_MAX,
} from "@/game/quests/catalog";
import type { MatchQuestProgress, MatchQuestSets, QuestObjectiveKey } from "@/game/quests/types";
import { MAX_MATCH_SECONDS, type LifetimeOnlySumKey, type MatchRecordKey, type MatchStats } from "@/game/quests/matchStats";

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
  /**
   * Jour UTC (`YYYY-MM-DD`) de la partie — valeur de l'ensemble `play_days`.
   * Fourni par l'appelant plutôt que lu ici : ce module reste pur, et c'est
   * le serveur qui sait quand la partie s'est terminée.
   */
  dayKey?: string;
  /**
   * Longueur de la série de jours consécutifs joués APRÈS cette partie,
   * telle que le compte la porte (`player_progression.play_streak`).
   * Absente : `play_streak` n'avance pas, plutôt qu'être crédité à tort.
   */
  playStreak?: number;
  /**
   * `true` si le deck joué a été créé récemment (`NEW_DECK_WINDOW_HOURS`).
   * Décidé par le serveur, qui a la date de création du deck.
   */
  deckIsNew?: boolean;
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

export function computeMatchQuestContribution(input: MatchQuestProgressInput): MatchQuestContribution {
  const { progress, sets } = analyserPartie(input);
  return {
    // Seules les contributions non nulles sont transmises à la base.
    progress: Object.fromEntries(Object.entries(progress).filter(([, value]) => value > 0)) as MatchQuestProgress,
    sets,
  };
}

/**
 * Contribution d'une partie terminée aux STATISTIQUES À VIE d'un joueur
 * (`game/quests/matchStats.ts`) : les cumuls des quêtes, ceux que seules
 * les statistiques lisent, et les records. Même passe sur le journal que
 * les quêtes — les deux ne peuvent pas diverger. Zéros omis.
 */
export function computeMatchStats(input: MatchQuestProgressInput): MatchStats {
  const { progress, extra, records } = analyserPartie(input);
  const stats: Record<string, number> = { ...extra, ...records };
  for (const [key, value] of Object.entries(progress) as Array<[QuestObjectiveKey, number]>) {
    if (QUEST_KEYS_NOT_LIFETIME.has(key)) continue;
    stats[key] = value;
  }
  return Object.fromEntries(Object.entries(stats).filter(([, value]) => value > 0)) as MatchStats;
}

/** Objectifs de quête qui ne sont pas des cumuls de partie (cf. `QuestLifetimeKey`). */
const QUEST_KEYS_NOT_LIFETIME: ReadonlySet<QuestObjectiveKey> = new Set<QuestObjectiveKey>([
  "play_days",
  "play_streak",
  "complete_daily_quests",
  "distinct_decks_played",
  "distinct_decks_won",
]);

/** Événements qui OUVRENT une action de joueur, dans un journal non signé (`actionIndex` absent). */
const ACTION_MARKERS: ReadonlySet<GameEvent["type"]> = new Set<GameEvent["type"]>([
  "PLAY_CARD",
  "ATTACK",
  "OBJECT_BROKEN",
  "SHIP_ABILITY_ACTIVATED",
  "SHIP_ABILITY_FIRED",
  "TURN_STARTED",
  "END_TURN",
  "PHASE_CHANGED",
]);

/** Seuils (en tours du joueur) des victoires rapides. */
const FAST_WIN_TURNS: ReadonlyArray<[number, LifetimeOnlySumKey]> = [
  [5, "win_within_5_turns"],
  [7, "win_within_7_turns"],
  [10, "win_within_10_turns"],
];

interface AnalysePartie {
  progress: Record<QuestObjectiveKey, number>;
  sets: MatchQuestSets;
  extra: Record<LifetimeOnlySumKey, number>;
  records: Record<MatchRecordKey, number>;
}

function analyserPartie({
  state,
  playerId,
  vsBot,
  won,
  deckId,
  preconTrial = false,
  dayKey,
  playStreak,
  deckIsNew = false,
}: MatchQuestProgressInput): AnalysePartie {
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
    play_days: 0,
    // Série : VALEUR ABSOLUE, pas un incrément — l'objectif est `max`.
    play_streak: playStreak ?? 0,
    // Écrit par la base, jamais par le journal de partie : une quête
    // journalière ne peut pas savoir ici qu'elle vient de se terminer.
    complete_daily_quests: 0,
    distinct_decks_played: 0,
    distinct_decks_won: 0,
    play_new_deck: deckIsNew ? 1 : 0,
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
    exact_lethal: 0,
    ship_ability_uses: 0,
    deraison_turns: 0,
    destroy_enemy_permanents: 0,
    scuttle_permanents: 0,
    play_big_cards: 0,
    play_in_abysses: 0,
    turns_in_tempete: 0,
    activate_reactions: 0,
    summon_units: 0,
    reveal_traps: 0,
    heal_anchor: 0,
    play_anomalies: 0,
    win_after_low_anchor: 0,
    win_without_deraison: 0,
  };

  // --- Statistiques à vie (`game/quests/matchStats.ts`) ------------------
  const extra: Record<LifetimeOnlySumKey, number> = {
    play_equipments: 0,
    break_objects_from_hand: 0,
    draw_cards: 0,
    discard_cards: 0,
    gain_reason_from_cards: 0,
    attacks: 0,
    direct_attacks: 0,
    destroy_enemy_units: 0,
    destroy_enemy_structures: 0,
    lose_units: 0,
    deal_ship_damage: 0,
    take_ship_damage: 0,
    ship_ability_damage: 0,
    intercept_attacks: 0,
    spring_traps: 0,
    break_in_reaction: 0,
    react_to_attack: 0,
    react_to_play: 0,
    react_to_break: 0,
    reveal_enemy_hand_cards: 0,
    reach_tempete: 0,
    tide_state_changes: 0,
    deraison_debt: 0,
    lethal_by_ship_ability: 0,
    lethal_by_attack: 0,
    lethal_by_effect: 0,
    lethal_by_tide: 0,
    lethal_by_deraison: 0,
    play_seconds: 0,
    own_turns: 0,
    play_pvp_matches: 0,
    play_bot_matches: 0,
    play_first: 0,
    spend_reason: 0,
    draw_matches: 0,
    win_first: 0,
    lose_matches: 0,
    lose_to_own_deraison: 0,
    win_bot_matches: 0,
    win_by_concede: 0,
    win_by_timeout: 0,
    win_by_ocean_judgment: 0,
    win_at_one_anchor: 0,
    win_without_losing_unit: 0,
    win_without_ship_damage: 0,
    win_while_deraison: 0,
    win_within_5_turns: 0,
    win_within_7_turns: 0,
    win_within_10_turns: 0,
  };
  const records: Record<MatchRecordKey, number> = {
    max_destroyed_at_once: 0,
    max_enemy_units_destroyed_in_turn: 0,
    max_damage_in_turn: 0,
    max_single_hit: 0,
    max_cards_played_in_turn: 0,
    max_deraison_debt: 0,
    max_win_anchor: 0,
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
  /** Joueur du premier tour de la partie (le premier `TURN_STARTED` du journal). */
  let firstPlayer: PlayerId | null = null;
  /** La partie s'est terminée sans vainqueur. */
  let drawn = false;
  /** Dégâts infligés pendant le tour en cours, pour « Gros calibre ». */
  let damageThisTurn = 0;
  let bestTurnDamage = 0;
  /** Créatures distinctes du joueur ayant infligé des dégâts. */
  const damagingCreatures = new Set<string>();
  let tideRose = false;
  let tideFell = false;
  /** Marée telle que le journal la raconte : état, sens de la prochaine transition, tours restants. */
  let tideState: TideStateName = "calme";
  let tideOrientation: "montante" | "descendante" = "montante";
  let tideRemaining: number = RULES.TIDE_STATE_DURATION.calme;
  /**
   * Une montée (ou descente) HÂTÉE vient d'être comptée pour l'action en
   * cours : si le raccourcissement a mené la Marée à sa transition, le
   * `TIDE_ADVANCED` qui suit est le même geste, pas un second.
   */
  let hastenedThisAction = false;
  /** Le joueur est tombé à `LOW_ANCHOR_THRESHOLD` Ancrage ou moins, sans couler. */
  let wasLow = false;

  /*
   * « EN MÊME TEMPS » ET ATTRIBUTION FINE (statistiques à vie).
   *
   * Un GROUPE est une action de joueur et tout ce qu'elle entraîne
   * immédiatement : effets, morts, déclencheurs, reprises d'une attaque ou
   * d'une destruction suspendues. C'est exactement un appel à `dispatch`,
   * que le moteur signe (`BaseGameEvent.actionIndex`). Cinq unités
   * détruites « en même temps », ce sont cinq destructions du même groupe
   * — pas du même tour : deux sorts successifs font deux groupes.
   *
   * Le joueur qui a soumis l'action (`actionBy`) devient l'acteur dès le
   * premier événement du groupe. C'est ce qui attribue enfin ce que les
   * marqueurs ne disent pas : une capacité activée (aucun événement ne
   * l'annonce) et une réaction (ses effets PRÉCÈDENT son
   * `REACTION_ACTIVATED`). Exception : un groupe qui s'ouvre sur
   * `REACTION_PASSED` ne change pas d'acteur — passer ne fait rien, et ce
   * qui suit (l'attaque ou la destruction qui reprend) appartient à celui
   * qui l'avait lancée.
   *
   * Journal ancien, non signé : un groupe s'ouvre à chaque marqueur
   * d'action (`ACTION_MARKERS`), et l'acteur reste celui des marqueurs.
   */
  let groupKey: number | string | undefined;
  let legacyGroup = 0;
  /** Unités adverses détruites par le joueur dans le groupe en cours. */
  let destroyedInGroup = 0;
  /** Le joueur résout en ce moment une capacité de Navire. */
  let shipResolution = false;
  /** Une attaque du joueur est en cours de résolution (coup fatal « à l'attaque »). */
  let attackResolution = false;
  /** Dernier geste ouvrant une action (hors réactions), pour « répondre à… ». */
  let lastRoot: { type: GameEvent["type"]; playerId: PlayerId } | null = null;
  /** Attaque suspendue par une fenêtre : sa reprise réémet `ATTACK`, qui ne compte pas deux fois. */
  let lastAttackKey: string | null = null;
  let windowSinceAttack = false;
  /** Un joueur vient de régler sa Déraison : le `DAMAGE` qui suit est le sien. */
  let deraisonJustSettled: PlayerId | null = null;
  let lethalKey: LifetimeOnlySumKey | null = null;
  /**
   * Le coup qui a coulé VOTRE Navire (le premier à le mettre à 0 ou moins)
   * suivait-il le règlement de votre propre Déraison ? Même lecture que le
   * coup fatal adverse, dans l'autre sens — créditée seulement en défaite.
   */
  let ownSinking: "deraison" | "autre" | null = null;
  const scuttledIds = new Set<string>();
  // Compteurs par TOUR (et non par phase, contrairement à `damageThisTurn`).
  let turnDamage = 0;
  let turnCardsPlayed = 0;
  let turnEnemyUnitsDestroyed = 0;
  const closeRecordTurn = () => {
    records.max_damage_in_turn = Math.max(records.max_damage_in_turn, turnDamage);
    records.max_cards_played_in_turn = Math.max(records.max_cards_played_in_turn, turnCardsPlayed);
    records.max_enemy_units_destroyed_in_turn = Math.max(records.max_enemy_units_destroyed_in_turn, turnEnemyUnitsDestroyed);
    turnDamage = 0;
    turnCardsPlayed = 0;
    turnEnemyUnitsDestroyed = 0;
  };

  const closeTurn = () => {
    bestTurnDamage = Math.max(bestTurnDamage, damageThisTurn);
    damageThisTurn = 0;
    actor = null;
    awaitingDirectDamage = false;
    currentAttacker = null;
  };

  for (const event of state.eventLog) {
    // --- Groupe d'action --------------------------------------------------
    if (event.actionIndex === undefined && ACTION_MARKERS.has(event.type)) legacyGroup += 1;
    const key = event.actionIndex ?? `ancien:${legacyGroup}`;
    if (key !== groupKey) {
      groupKey = key;
      destroyedInGroup = 0;
      if (event.actionIndex !== undefined && event.type !== "REACTION_PASSED") {
        actor = event.actionBy ?? actor;
        hastenedThisAction = false;
        awaitingDirectDamage = false;
        currentAttacker = null;
        shipResolution = false;
        attackResolution = false;
      }
    }
    if (ACTION_MARKERS.has(event.type)) {
      // Un nouveau geste clôt la capacité de Navire ou l'attaque en cours ;
      // le cas de chacun le rouvre plus bas s'il y a lieu.
      shipResolution = false;
      attackResolution = false;
      lastRoot = event.playerId ? { type: event.type, playerId: event.playerId } : null;
    }
    const settledJustBefore = deraisonJustSettled;
    deraisonJustSettled = null;

    switch (event.type) {
      case "TURN_STARTED":
        if (firstPlayer === null && event.playerId) firstPlayer = event.playerId;
        closeRecordTurn();
        if (event.playerId === playerId) {
          ownTurns += 1;
          // L'annonce de Marée précède `TURN_STARTED` : l'état lu ici est
          // bien celui dans lequel le tour commence.
          if (tideState === "tempete") progress.turns_in_tempete += 1;
        }
        closeTurn();
        break;
      case "END_TURN":
      case "PHASE_CHANGED":
        closeTurn();
        break;

      case "DRAW_CARD":
        if (event.playerId === playerId) draws += 1;
        break;

      case "CARD_MOVED":
        // Défausse : seul un déplacement main → Cimetière qui porte
        // `discardByEffect` en est une (un Bris depuis la main n'en porte pas).
        if (
          event.discardByEffect !== undefined &&
          event.fromZone === "hand" &&
          (event.ownerId ?? ownerByInstance.get(event.instanceId)) === playerId
        ) {
          extra.discard_cards += 1;
        }
        break;

      case "REASON_CHANGED":
        if (event.playerId === playerId && event.source === "card" && event.delta > 0) extra.gain_reason_from_cards += event.delta;
        break;

      case "HAND_CARD_REVEALED":
        if (opponentId !== undefined && event.ownerId === opponentId) extra.reveal_enemy_hand_cards += 1;
        break;

      case "ATTACK_INTERCEPTED":
        if (ownerByInstance.get(event.attackerInstanceId) === opponentId) extra.intercept_attacks += 1;
        break;

      case "REACTION_WINDOW_OPENED":
        windowSinceAttack = true;
        break;

      case "GAME_ENDED":
        if (!event.winnerId) drawn = true;
        if (won && event.winnerId === playerId) {
          if (event.reason === "concede") extra.win_by_concede = 1;
          else if (event.reason === "timeout") extra.win_by_timeout = 1;
          else if (event.reason === "oceanJudgment") extra.win_by_ocean_judgment = 1;
        }
        break;

      case "PLAY_CARD": {
        actor = event.playerId;
        hastenedThisAction = false;
        awaitingDirectDamage = false;
        currentAttacker = null;
        if (event.playerId !== playerId) break;
        progress.play_cards += 1;
        turnCardsPlayed += 1;
        if (tideState === "abysses") progress.play_in_abysses += 1;
        const def = safeDef(event.cardId);
        if (!def) break;
        if (def.cost > 0) extra.spend_reason += def.cost;
        if (def.cost >= BIG_CARD_MIN_COST) progress.play_big_cards += 1;
        if (def.type === "anomalie") progress.play_anomalies += 1;
        if (def.type === "creature") {
          progress.play_creatures += 1;
          if (def.cost <= LOW_COST_CREATURE_MAX) progress.play_low_cost_creatures += 1;
        } else if (def.type === "marin") progress.play_marins += 1;
        else if (def.type === "structure") progress.play_structures += 1;
        else if (def.type === "objet") progress.play_objects += 1;
        else if (def.type === "equipement") extra.play_equipments += 1;
        break;
      }

      case "OBJECT_BROKEN":
        actor = event.playerId;
        hastenedThisAction = false;
        awaitingDirectDamage = false;
        currentAttacker = null;
        // `OBJECT_BROKEN` porte le fait de jeu « Briser », main comprise —
        // bien plus fiable que de deviner un Bris depuis un CARD_MOVED.
        if (event.playerId === playerId) {
          progress.break_objects += 1;
          if (event.fromHand) extra.break_objects_from_hand += 1;
        }
        break;

      case "SABORDED":
        actor = event.playerId;
        hastenedThisAction = false;
        awaitingDirectDamage = false;
        currentAttacker = null;
        scuttledIds.add(event.instanceId);
        if (event.playerId === playerId) {
          progress.scuttle_permanents += 1;
          if (defByInstance.get(event.instanceId)?.type === "structure") progress.scuttle_structures += 1;
        }
        break;

      // Une capacité de Navire est une action du joueur au même titre
      // qu'une pose : ce qu'elle provoque lui revient. Sans ce cas, les
      // changements de Marée de « Changer de cap » (la grande majorité des
      // modifications de Marée mesurées au banc, audit du 24/09) et les
      // dégâts du Canon n'étaient crédités à personne.
      case "SHIP_ABILITY_ACTIVATED":
      case "SHIP_ABILITY_FIRED":
        actor = event.playerId;
        awaitingDirectDamage = false;
        currentAttacker = null;
        hastenedThisAction = false;
        // Le tir d'une capacité ARMÉE est la suite du même geste : seule
        // l'activation compte comme un usage.
        if (event.type === "SHIP_ABILITY_ACTIVATED" && event.playerId === playerId) progress.ship_ability_uses += 1;
        shipResolution = event.playerId === playerId;
        break;

      case "REACTION_ACTIVATED": {
        if (event.playerId !== playerId) break;
        progress.activate_reactions += 1;
        const source = defByInstance.get(event.sourceInstanceId);
        // Un PIÈGE, c'est la réaction cachée d'une Structure ; un Objet qui
        // réagit se Brise pour le faire (Harpon à Ressort, Bouclier d'Écume).
        if (source?.type === "structure" && (source.abilities ?? []).some((ability) => ability.hiddenReaction)) extra.spring_traps += 1;
        if (source?.type === "objet") extra.break_in_reaction += 1;
        // « En réponse à » : le dernier geste ouvrant une action, s'il est adverse.
        if (lastRoot && lastRoot.playerId !== playerId) {
          if (lastRoot.type === "ATTACK") extra.react_to_attack += 1;
          else if (lastRoot.type === "PLAY_CARD") extra.react_to_play += 1;
          else if (lastRoot.type === "OBJECT_BROKEN") extra.react_to_break += 1;
        }
        break;
      }

      case "STRUCTURE_REVEALED":
        if (ownerByInstance.get(event.instanceId) === playerId) progress.reveal_traps += 1;
        break;

      case "SUMMON":
        if (event.playerId === playerId) progress.summon_units += 1;
        break;

      case "HEAL":
        if (event.targetPlayerId === playerId) progress.heal_anchor += event.amount;
        break;

      case "DERAISON_SETTLED":
        deraisonJustSettled = event.playerId;
        if (event.playerId === playerId && event.debt > 0) {
          progress.deraison_turns += 1;
          extra.deraison_debt += event.debt;
          records.max_deraison_debt = Math.max(records.max_deraison_debt, event.debt);
        }
        break;

      case "DESTROY": {
        const owner = ownerByInstance.get(event.instanceId);
        const type = defByInstance.get(event.instanceId)?.type;
        const isUnit = type !== undefined && UNIT_CARD_TYPES.includes(type);
        // Un Sabordage émet `SABORDED` puis `DESTROY` : c'est un coût
        // consenti, pas une unité perdue.
        if (owner === playerId && isUnit && !scuttledIds.has(event.instanceId)) extra.lose_units += 1;
        // Un permanent adverse qui tombe pendant VOTRE action : votre
        // attaque, votre effet, votre capacité. La Marée ne compte pour
        // personne, comme pour les dégâts.
        if (actor !== playerId || owner !== opponentId) break;
        progress.destroy_enemy_permanents += 1;
        if (type === "structure") extra.destroy_enemy_structures += 1;
        if (isUnit) {
          extra.destroy_enemy_units += 1;
          turnEnemyUnitsDestroyed += 1;
          destroyedInGroup += 1;
          records.max_destroyed_at_once = Math.max(records.max_destroyed_at_once, destroyedInGroup);
        }
        break;
      }

      case "ATTACK": {
        actor = event.playerId;
        awaitingDirectDamage = event.playerId === playerId && !event.defenderInstanceId;
        currentAttacker = event.playerId === playerId ? event.attackerInstanceId : null;
        attackResolution = event.playerId === playerId;
        // Reprise d'une attaque suspendue par un piège : même attaquant, même
        // tour, une fenêtre entre les deux. Ce n'est pas une seconde attaque.
        const attackKey = `${event.turnNumber}:${event.attackerInstanceId}`;
        const resumed = attackKey === lastAttackKey && windowSinceAttack;
        lastAttackKey = attackKey;
        windowSinceAttack = false;
        if (event.playerId !== playerId || resumed) break;
        extra.attacks += 1;
        if (!event.defenderInstanceId) extra.direct_attacks += 1;
        break;
      }

      case "DAMAGE": {
        const targetsOwnUnit = event.targetInstanceId !== undefined && ownerByInstance.get(event.targetInstanceId) === playerId;
        const targetsOwnShip = event.targetPlayerId === playerId;
        if (targetsOwnShip && event.targetAnchorAfter !== undefined && event.targetAnchorAfter > 0 && event.targetAnchorAfter <= LOW_ANCHOR_THRESHOLD) {
          wasLow = true;
        }
        // Dégâts SUBIS : comptés quelle que soit l'origine (Marée comprise).
        if (targetsOwnUnit || targetsOwnShip) progress.take_damage += event.amount;
        if (targetsOwnShip) extra.take_ship_damage += event.amount;
        if (ownSinking === null && targetsOwnShip && event.targetAnchorAfter !== undefined && event.targetAnchorAfter <= 0) {
          ownSinking = settledJustBefore === playerId ? "deraison" : "autre";
        }

        // COUP FATAL : le premier coup qui met le Navire adverse à 0 ou
        // moins. Qualifié ici, crédité en fin de partie si elle est gagnée.
        const fatal =
          lethalKey === null &&
          opponentId !== undefined &&
          event.targetPlayerId === opponentId &&
          event.targetAnchorAfter !== undefined &&
          event.targetAnchorAfter <= 0;
        if (fatal) {
          if (settledJustBefore === opponentId) lethalKey = "lethal_by_deraison";
          else if (actor === null) lethalKey = "lethal_by_tide";
          else if (actor === playerId) {
            lethalKey = shipResolution ? "lethal_by_ship_ability" : attackResolution || event.combat ? "lethal_by_attack" : "lethal_by_effect";
          }
        }

        if (actor !== playerId) break;
        const targetsOpponentUnit = event.targetInstanceId !== undefined && ownerByInstance.get(event.targetInstanceId) === opponentId;
        const targetsOpponentShip = event.targetPlayerId !== undefined && event.targetPlayerId === opponentId;
        if (targetsOpponentUnit || targetsOpponentShip) {
          progress.deal_damage += event.amount;
          damageThisTurn += event.amount;
          turnDamage += event.amount;
          records.max_single_hit = Math.max(records.max_single_hit, event.amount);
          if (targetsOpponentShip) extra.deal_ship_damage += event.amount;
          if (shipResolution) extra.ship_ability_damage += event.amount;
          // « Ça pique » : la Créature à l'origine de l'attaque en cours.
          if (currentAttacker && defByInstance.get(currentAttacker)?.type === "creature") damagingCreatures.add(currentAttacker);
        }
        // « Au point exact » : l'Ancrage n'est jamais borné, donc 0 pile veut
        // dire que le coup a porté ni plus ni moins que nécessaire. Un
        // dépassement laisse une valeur négative et ne compte pas.
        if (targetsOpponentShip && event.targetAnchorAfter === 0 && event.amount > 0) {
          progress.exact_lethal = 1;
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
        if (actor === playerId && !hastenedThisAction) {
          progress.modify_tide += 1;
          if (event.tideOrientation === "montante") {
            progress.tide_rise += 1;
            tideRose = true;
          } else {
            progress.tide_fall += 1;
            tideFell = true;
          }
        }
        hastenedThisAction = false;
        if (event.stateChanged && event.tideState === "abysses") progress.reach_abysses += 1;
        if (event.stateChanged && event.tideState === "tempete") extra.reach_tempete += 1;
        if (event.stateChanged) extra.tide_state_changes += 1;
        tideState = event.tideState;
        tideOrientation = event.tideOrientation;
        tideRemaining = event.remainingTurns;
        break;

      case "TIDE_MODIFIED":
      case "TIDE_ORIENTATION_CHANGED": {
        // HÂTER la Marée, c'est la faire monter (ou descendre) : raccourcir
        // la durée de l'état pendant qu'elle monte rapproche la montée
        // (arbitrage du 24/09/2026, « Ça monte » était infaisable). La
        // valeur portée est la durée RÉSULTANTE, d'où la comparaison.
        const hastened = event.type === "TIDE_MODIFIED" && event.change === "duration" && event.value < tideRemaining;
        if (event.type === "TIDE_MODIFIED" && event.change === "duration") tideRemaining = event.value;
        if (event.type === "TIDE_ORIENTATION_CHANGED") tideOrientation = event.orientation;
        // Ces deux-là ne sont émis QUE par un effet de carte.
        if (actor === playerId) {
          progress.modify_tide += 1;
          if (hastened) {
            hastenedThisAction = true;
            if (tideOrientation === "montante") {
              progress.tide_rise += 1;
              tideRose = true;
            } else {
              progress.tide_fall += 1;
              tideFell = true;
            }
          }
          // Inverser l'orientation, c'est FAIRE monter (ou descendre) la
          // Marée : c'est le geste de presque toutes les cartes et capacités
          // qui la touchent. Ne compter que les changements d'état forcés
          // rendait « Ça monte » et « Ça redescend » infaisables — zéro
          // progression sur 90 parties de banc (audit du 24/09).
          if (event.type === "TIDE_ORIENTATION_CHANGED") {
            if (event.orientation === "montante") {
              progress.tide_rise += 1;
              tideRose = true;
            } else {
              progress.tide_fall += 1;
              tideFell = true;
            }
          }
        }
        break;
      }

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
  if (won && wasLow) progress.win_after_low_anchor = 1;
  if (won && progress.deraison_turns === 0) progress.win_without_deraison = 1;
  if (vsBot) {
    progress.pvp_ship_damage = 0;
  } else if (won) {
    progress.win_pvp_matches = 1;
  }

  // --- Ensembles : decks distincts ---------------------------------------
  const sets: MatchQuestSets = {};
  // « Marin régulier » : un jour compte une fois, quel que soit le nombre de
  // parties — c'est de la régularité qu'on récompense, pas du volume.
  if (dayKey) sets.play_days = [dayKey];
  if (deckId) {
    sets.distinct_decks_played = [deckId];
    if (won) sets.distinct_decks_won = [deckId];
  }

  // --- Statistiques à vie : temps et volume -------------------------------
  extra.play_seconds = matchSeconds(state);
  extra.own_turns = ownTurns;
  if (vsBot) extra.play_bot_matches = 1;
  else extra.play_pvp_matches = 1;
  const wentFirst = firstPlayer === playerId;
  if (wentFirst) extra.play_first = 1;

  // --- Statistiques à vie : issue de la partie ---------------------------
  closeRecordTurn();
  const self = state.players.find((p) => p.id === playerId);
  if (won) {
    if (lethalKey) extra[lethalKey] = 1;
    if (vsBot) extra.win_bot_matches = 1;
    if (anchor === 1) extra.win_at_one_anchor = 1;
    if (extra.lose_units === 0) extra.win_without_losing_unit = 1;
    if (extra.take_ship_damage === 0) extra.win_without_ship_damage = 1;
    if ((self?.reason ?? 0) < 0) extra.win_while_deraison = 1;
    for (const [turns, key] of FAST_WIN_TURNS) if (ownTurns > 0 && ownTurns <= turns) extra[key] = 1;
    records.max_win_anchor = Math.max(0, anchor);
    if (wentFirst) extra.win_first = 1;
  } else {
    if (drawn) extra.draw_matches = 1;
    extra.lose_matches = 1;
    if (ownSinking === "deraison") extra.lose_to_own_deraison = 1;
  }

  return { progress, sets, extra, records };
}

/**
 * Durée d'une partie, en secondes : de la création de l'état au dernier
 * événement horodaté du journal. Certains événements internes portent un
 * horodatage nul (retour en main) : seul le PLUS TARDIF compte. Bornée à
 * `MAX_MATCH_SECONDS`, et à 0 pour un journal sans horloge (tests, replays).
 */
export function matchSeconds(state: GameState): number {
  if (!(state.createdAt > 0)) return 0;
  let last = 0;
  for (const event of state.eventLog) if (event.timestamp > last) last = event.timestamp;
  if (last <= state.createdAt) return 0;
  return Math.min(MAX_MATCH_SECONDS, Math.round((last - state.createdAt) / 1000));
}
