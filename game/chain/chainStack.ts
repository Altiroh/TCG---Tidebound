import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { findCardInstance as trouverCarte } from "@/game/state/types";
import { isEligibleChosenUnit } from "@/game/effects/chosenTargets";
import type { EffectContext } from "@/game/effects/resolveEffect";
import type { EffectDefinition } from "@/game/effects/types";
import { closeDieRollIfIdle, resolveEffectSequence } from "@/game/effects/resolveSequence";
import type { GameEvent } from "@/game/events/types";
import { deriveReactionTriggerEvents, ouvrirFenetrePour, recomputePendingReaction } from "@/game/reactions/reactionWindow";
import { isDieChainObject } from "@/game/rules/objectPlay";
import { recordGraveyardArrival } from "@/game/state/discard";
import type { ChainLink, GameState, PendingReactionState, PlayerState } from "@/game/state/types";
import {
  processGraveyardEntryTriggers,
  processGraveyardRecoveryTriggers,
  processReturnedToHandTriggers,
  processSummonEnterTriggers,
  processTrigger,
} from "@/game/triggers/triggerBus";
import type { TriggerEvent } from "@/game/triggers/types";

/*
 * LA PILE CHAÎNE (règle du 13/10/2026, Notion « Règles & conventions »).
 *
 * Un Objet joué n'est jamais posé : il monte sur la pile, son coût payé, et
 * attend. Tant qu'il y est, chacun peut lui répondre — le joueur actif
 * d'abord, puis l'adversaire — par un Objet « Chaîne » dont le déclencheur
 * correspond (Sabotage Discret : « lorsqu'un adversaire joue un Objet »),
 * qui monte à son tour. Quand plus personne ne répond, la pile se résout du
 * haut vers le bas (LIFO). Entre deux résolutions, ce que la précédente a
 * produit peut ouvrir une fenêtre ; jamais au milieu d'un effet.
 *
 * Invariant : une pile non vide a TOUJOURS une fenêtre ouverte ou un choix
 * en attente au-dessus d'elle. Les reprises du moteur (attaque, entame de
 * tour, destruction…) attendent donc naturellement qu'elle soit vide.
 *
 * Une capacité activée dans une fenêtre ne monte pas sur la pile : rien ne
 * peut lui répondre, elle se résout aussitôt — ce qui est exactement sa
 * place dans l'ordre LIFO.
 */

/** Effets que résout ce maillon : la capacité Chaîne qui l'a fait jouer, ou l'effet de l'Objet. */
export function linkEffects(def: CardDefinition, link: Pick<ChainLink, "abilityIndex">): EffectDefinition[] {
  if (link.abilityIndex !== undefined) return def.abilities?.[link.abilityIndex]?.effects ?? [];
  return def.onBreakEffects ?? [];
}

/** Déclencheur « un Objet vient d'être joué » de ce maillon (fenêtre de réponse). */
export function objectPlayedTrigger(link: ChainLink): TriggerEvent {
  return { trigger: "onObjectPlayed", playerId: link.playerId, cardId: link.card.cardId, sourceInstanceId: link.card.instanceId };
}

/**
 * Monte un Objet sur la pile : il quitte la main de son joueur (coût déjà
 * payé par l'appelant) et le fait est annoncé — `OBJECT_PLAYED`, puis
 * `CHAIN_LINK_ADDED` avec sa profondeur.
 */
export function pushChainLink(state: GameState, link: ChainLink): { state: GameState; events: GameEvent[] } {
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };
  const stack = [...(state.chainStack ?? []), link];
  const players = state.players.map((p) =>
    p.id === link.playerId ? { ...p, hand: p.hand.filter((c) => c.instanceId !== link.card.instanceId) } : p
  ) as [PlayerState, PlayerState];
  return {
    state: { ...state, players, chainStack: stack },
    events: [
      {
        ...base,
        type: "OBJECT_PLAYED",
        playerId: link.playerId,
        instanceId: link.card.instanceId,
        cardId: link.card.cardId,
        chaine: getCardDefinition(link.card.cardId).chaine === true,
      },
      { ...base, type: "CHAIN_LINK_ADDED", playerId: link.playerId, linkId: link.id, instanceId: link.card.instanceId, cardId: link.card.cardId, depth: stack.length },
    ],
  };
}

/**
 * Fenêtre de RÉPONSE au maillon qui vient de monter : n'ouvre que si
 * quelqu'un a une réponse légale. `chainBase` garde la fenêtre dans laquelle
 * la pile a commencé, pour la reprendre une fois la pile vide.
 */
export function openChainResponse(state: GameState, link: ChainLink): { state: GameState; events: GameEvent[] } {
  const fenetre = ouvrirFenetrePour(state, [objectPlayedTrigger(link)], state.turnNumber);
  if (!fenetre) return { state, events: [] };
  return {
    state: { ...state, pendingReaction: fenetre },
    events: [{ type: "REACTION_WINDOW_OPENED", turnNumber: fenetre.turnNumber, timestamp: Date.now(), playerId: fenetre.awaitingPlayerId }],
  };
}

/**
 * Cibles qui n'existent que dans la situation qui a fait jouer l'Objet :
 * l'attaquant ou la cible de l'attaque suspendue, la carte déclencheuse.
 */
function reactionTargetGone(state: GameState, effect: EffectDefinition, link: ChainLink): boolean {
  const surLePlateau = (instanceId: string | undefined) => {
    if (!instanceId) return false;
    const trouvee = trouverCarte(state, instanceId);
    return trouvee?.zone === "board";
  };
  switch (effect.target.kind) {
    case "pendingAttacker":
      return !surLePlateau(state.pendingAttack?.attackerInstanceId);
    case "attackTarget":
      return state.pendingAttack?.defenderInstanceId !== undefined && !surLePlateau(state.pendingAttack.defenderInstanceId);
    case "triggerSource":
      // La déclencheuse peut être un Objet encore sur la pile (« lorsqu'un
      // adversaire joue un Objet : annulez son effet »).
      return !surLePlateau(link.triggerSourceInstanceId) && !state.chainStack?.some((l) => l.card.instanceId === link.triggerSourceInstanceId);
    default:
      return false;
  }
}

/**
 * L'Objet a-t-il encore une cible légale ? Une cible désignée devenue
 * illégale pour TOUS les effets qui la visent, ou la carte que visait la
 * réaction partie : l'Objet n'a plus rien sur quoi agir.
 */
function hasLegalTarget(state: GameState, link: ChainLink, effects: readonly EffectDefinition[]): boolean {
  const designes = effects.filter((e) => e.target.kind === "chosenUnit");
  if (designes.length > 0) {
    if (!link.targetInstanceId) return false;
    const legal = designes.some((e) =>
      isEligibleChosenUnit(state, e.target, link.playerId, link.targetInstanceId!, link.card.instanceId, link.triggerSourceInstanceId)
    );
    if (!legal) return false;
  }
  return !effects.some((e) => reactionTargetGone(state, e, link));
}

/** L'Objet part au Cimetière de son joueur (joué, il ne vient d'aucune zone de jeu). */
function versLeCimetiere(state: GameState, link: ChainLink): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === link.playerId
        ? recordGraveyardArrival(
            { ...p, graveyard: [...p.graveyard, { ...link.card, damageMarked: 0, modifiers: [] }] },
            { cardId: link.card.cardId, instanceId: link.card.instanceId, turnNumber: state.turnNumber, fromZone: "hand" }
          )
        : p
    ) as [PlayerState, PlayerState],
  };
}

/**
 * Résout UN maillon, déjà retiré de la pile.
 *
 * - Annulé (Sabotage Discret) ou sans cible légale : l'Objet part au
 *   Cimetière, son coût reste payé, et il n'est PAS Brisé — rien de ce qui
 *   guette un Bris ne se déclenche (`OBJECT_FIZZLED`).
 * - Sinon son effet se résout, puis il est Brisé : il part au Cimetière,
 *   `OBJECT_BROKEN`, et tout ce qui guette un Bris se déclenche, dans la
 *   limite de ses « une fois par tour ». Briser n'est pas Saborder : ni
 *   `onDeath` ni `onSaborde`.
 */
export function resolveChainLink(state: GameState, link: ChainLink): { state: GameState; events: GameEvent[] } {
  const def = getCardDefinition(link.card.cardId);
  const turnNumber = state.turnNumber;
  const base = { turnNumber, timestamp: Date.now() };
  const resolu: GameEvent = {
    ...base,
    type: "CHAIN_LINK_RESOLVED",
    playerId: link.playerId,
    linkId: link.id,
    instanceId: link.card.instanceId,
    cardId: link.card.cardId,
  };
  const effects = linkEffects(def, link);

  const echec = link.cancelled ? "cancelled" : hasLegalTarget(state, link, effects) ? undefined : "noLegalTarget";
  if (echec) {
    const apres = versLeCimetiere(state, link);
    const ferme = isDieChainObject(def) ? closeDieRollIfIdle(apres) : { state: apres, events: [] };
    return {
      state: ferme.state,
      events: [
        { ...base, type: "OBJECT_FIZZLED", playerId: link.playerId, instanceId: link.card.instanceId, cardId: link.card.cardId, reason: echec },
        resolu,
        ...ferme.events,
      ],
    };
  }

  const context: EffectContext = {
    controllerId: link.playerId,
    sourceInstanceId: link.card.instanceId,
    chosenTargetInstanceId: link.targetInstanceId,
    chosenGraveyardInstanceId: link.chosenGraveyardInstanceId,
    triggerSourceInstanceId: link.triggerSourceInstanceId,
    ...(link.dieDelta !== undefined ? { dieDelta: link.dieDelta } : {}),
    turnNumber,
  };
  const events: GameEvent[] = [];
  const effet = resolveEffectSequence(state, effects, context);
  let nextState = effet.state;
  events.push(...effet.events);

  // Ce que l'effet a fait arriver, renvoyer, défausser ou repêcher réveille
  // les mêmes déclencheurs qu'après une pose.
  for (const balayage of [processSummonEnterTriggers, processReturnedToHandTriggers, processGraveyardEntryTriggers, processGraveyardRecoveryTriggers]) {
    const suite = balayage(nextState, effet.events, turnNumber);
    nextState = suite.state;
    events.push(...suite.events);
  }

  // Brisé : au Cimetière, puis le fait « vous Brisez un Objet ».
  nextState = versLeCimetiere(nextState, link);
  nextState = {
    ...nextState,
    players: nextState.players.map((p) =>
      p.id === link.playerId
        ? {
            ...p,
            objectsBrokenThisTurn: {
              turnNumber,
              names: [...(p.objectsBrokenThisTurn?.turnNumber === turnNumber ? p.objectsBrokenThisTurn.names : []), def.name],
            },
          }
        : p
    ) as [PlayerState, PlayerState],
  };
  events.push({ ...base, type: "OBJECT_BROKEN", playerId: link.playerId, instanceId: link.card.instanceId, cardId: def.id });
  const brise = processTrigger(
    nextState,
    { trigger: "onObjectBroken", playerId: link.playerId, cardId: def.id, sourceInstanceId: link.card.instanceId },
    turnNumber
  );
  nextState = brise.state;
  events.push(...brise.events, resolu);

  // Une Chaîne de dé qui laisse le joueur sans plus rien à faire sur le jet le ferme.
  if (isDieChainObject(def)) {
    const ferme = closeDieRollIfIdle(nextState);
    nextState = ferme.state;
    events.push(...ferme.events);
  }
  return { state: nextState, events };
}

/** Le maillon du haut peut-il se résoudre maintenant ? */
function peutResoudre(state: GameState): boolean {
  const top = state.chainStack?.[state.chainStack.length - 1];
  if (!top || state.status !== "active" || state.pendingReaction) return false;
  if (!state.pendingChoice) return true;
  // Une Chaîne de dé se résout sur le jet en cours, qui reste ouvert.
  return state.pendingChoice.kind === "dieRoll" && isDieChainObject(getCardDefinition(top.card.cardId));
}

/**
 * Fait avancer la pile tant que personne n'a rien à y répondre : résout le
 * maillon du haut, puis, s'il en reste, ouvre une fenêtre pour ce que cette
 * résolution vient de produire (s'il y a une réponse légale) — sinon
 * continue. Pile vide : la fenêtre où elle avait commencé (`chainBase`)
 * reprend, enrichie de ce que la pile a produit.
 *
 * `leftoverTriggers` : déclencheurs que personne n'a encore pu voir, quand
 * la pile n'est pas partie d'une fenêtre. L'appelant décide : une action
 * ordinaire laisse `dispatch` les dériver de ses événements ; une action de
 * fenêtre (dont `dispatch` ne redérive rien) les met en attente.
 */
export function runChain(state: GameState): { state: GameState; events: GameEvent[]; leftoverTriggers: TriggerEvent[] } {
  let nextState = state;
  const events: GameEvent[] = [];
  let leftoverTriggers: TriggerEvent[] = [];

  while (peutResoudre(nextState)) {
    const stack = nextState.chainStack!;
    const top = stack[stack.length - 1]!;
    const reste = stack.slice(0, -1);
    nextState = { ...nextState, chainStack: reste.length > 0 ? reste : undefined };
    const resolution = resolveChainLink(nextState, top);
    nextState = resolution.state;
    events.push(...resolution.events);
    const produits = deriveReactionTriggerEvents(nextState, resolution.events);

    if (nextState.chainStack?.length) {
      // Entre deux résolutions : une fenêtre peut s'ouvrir sur ce qui vient de se passer.
      const fenetre = produits.length > 0 && !nextState.pendingChoice ? ouvrirFenetrePour(nextState, produits, nextState.turnNumber) : undefined;
      if (fenetre) {
        nextState = { ...nextState, pendingReaction: fenetre };
        events.push({ type: "REACTION_WINDOW_OPENED", turnNumber: fenetre.turnNumber, timestamp: Date.now(), playerId: fenetre.awaitingPlayerId });
        break;
      }
      nextState = garderPourPlusTard(nextState, produits, (t) => (leftoverTriggers = [...leftoverTriggers, ...t]));
      continue;
    }

    // Pile vide : la fenêtre d'origine reprend.
    nextState = garderPourPlusTard(nextState, produits, (t) => (leftoverTriggers = [...leftoverTriggers, ...t]));
    const origine = nextState.chainBase;
    if (origine) {
      const { chainBase: _repris, ...sansBase } = nextState;
      nextState = sansBase;
      const reprise = !nextState.pendingChoice ? recomputePendingReaction(nextState, origine) : undefined;
      if (reprise) {
        nextState = { ...nextState, pendingReaction: reprise };
        events.push({ type: "REACTION_WINDOW_OPENED", turnNumber: reprise.turnNumber, timestamp: Date.now(), playerId: reprise.awaitingPlayerId });
      } else if (nextState.pendingChoice && origine.events.length > 0) {
        // Un choix s'est ouvert pendant la pile : la fenêtre d'origine attendra qu'il soit tranché.
        leftoverTriggers = [...leftoverTriggers, ...origine.events];
      }
    }
  }

  return { state: nextState, events, leftoverTriggers };
}

/** Déclencheurs produits par la pile que personne n'a pu voir : versés à la fenêtre d'origine, sinon rendus. */
function garderPourPlusTard(state: GameState, produits: TriggerEvent[], rendre: (t: TriggerEvent[]) => void): GameState {
  if (produits.length === 0) return state;
  if (state.chainBase) return { ...state, chainBase: { ...state.chainBase, events: [...state.chainBase.events, ...produits] } };
  rendre(produits);
  return state;
}

/** Fenêtre d'origine à garder quand une pile démarre dans `fenetre` (la plus ancienne l'emporte). */
export function withChainBase(state: GameState, fenetre: PendingReactionState): GameState {
  return state.chainBase ? state : { ...state, chainBase: fenetre };
}
