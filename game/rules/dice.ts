import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import { nextInt } from "@/game/rng";
import { activeLandeRules } from "@/game/rules/lande";
import type { DieOutcome } from "@/game/triggers/types";
import type { DieRollChoice, DieSize, GameState, NextRollModifier, PlayerId, PlayerState } from "@/game/state/types";

/**
 * DÉS (Lot 17 — « Dungeon et Ladalle »).
 *
 * - Chaque carte à dé a le sien (`CardDefinition.die` : D4, D6, D8).
 * - Réussite critique = la face max ; Échec critique = 1 (décision du
 *   05/10/2026). Une Réussite critique est aussi une Réussite.
 * - Réussite simple : le seuil de l'effet (`successAt`), sinon la moitié
 *   haute du dé (3+ sur D4, 4+ sur D6, 5+ sur D8).
 * - LA CHAÎNE : entre le lancer et la résolution, le joueur peut Briser ses
 *   Objets « Chaîne », relancer (Le Donjon de Ladalle), ajuster (Miss
 *   Franche-Comté 1987) ou choisir entre deux dés (Double tentative). Les
 *   critiques ne se jugent qu'à la fermeture.
 * - Un jet sur lequel le joueur ne peut RIEN faire se résout aussitôt, sans
 *   question : on ne fait pas valider ce qu'il n'y a pas à décider.
 */

/** Clés « une fois par tour » posées sur les cartes en jeu par les dés. */
const CLE_AJUSTEMENT = "dieAdjust";
const CLE_AJUSTEMENT_BONUS = "dieAdjustBonus";
const CLE_BONUS_RELANCE = "rerollBonus";

const TAILLES: readonly DieSize[] = [4, 6, 8];

/** Le dé monte de `steps` crans (D4 → D6 → D8), plafonné au D8. */
export function upgradeDie(die: DieSize, steps: number): DieSize {
  const i = TAILLES.indexOf(die);
  return TAILLES[Math.min(TAILLES.length - 1, Math.max(0, i + steps))]!;
}

/** Seuil de Réussite par défaut : la moitié haute du dé. */
export function defaultSuccessAt(die: DieSize): number {
  return Math.floor(die / 2) + 1;
}

const borne = (value: number, die: DieSize) => Math.max(1, Math.min(die, value));

/** Issue d'un résultat, Chaîne fermée. */
export function dieOutcomeOf(choice: Pick<DieRollChoice, "die" | "successAt" | "noCriticalFailure">, value: number): DieOutcome {
  if (value >= choice.die) return "criticalSuccess";
  if (value <= 1 && !choice.noCriticalFailure) return "criticalFailure";
  return value >= choice.successAt ? "success" : "failure";
}

function getPlayer(state: GameState, id: PlayerId): PlayerState {
  return state.players.find((p) => p.id === id)!;
}

function replacePlayer(state: GameState, player: PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player.id ? player : p)) as GameState["players"] };
}

function replaceBoardUnit(state: GameState, ownerId: PlayerId, instanceId: string, change: (u: CardInstance) => CardInstance): GameState {
  const owner = getPlayer(state, ownerId);
  return replacePlayer(state, { ...owner, board: owner.board.map((u) => (u.instanceId === instanceId ? change(u) : u)) });
}

function flagTurn(unit: CardInstance, key: string): number | string | undefined {
  return (unit.oncePerTurnFlags ?? {})[key];
}

/**
 * LANCER : tire le dé, consomme ce qui attendait le prochain jet du joueur
 * (`PlayerState.nextRoll`), et rend la question de Chaîne (pas encore posée
 * dans l'état). Le joueur est celui qui contrôle l'effet.
 */
export function rollDie(
  state: GameState,
  effect: EffectDefinition,
  context: DieRollChoice["context"]
): { state: GameState; choice: DieRollChoice } {
  const playerId = context.controllerId;
  const turnNumber = context.turnNumber;
  const source = context.sourceInstanceId
    ? state.players.flatMap((p) => [...p.board, ...p.hand, ...p.graveyard]).find((c) => c.instanceId === context.sourceInstanceId)
    : undefined;
  const sourceDef = source ? getCardDefinition(source.cardId) : undefined;
  let die: DieSize = effect.die ?? sourceDef?.die ?? 6;

  // Ce qui attendait CE jet : posé « ce tour » et pas encore servi, ou sans limite.
  const player = getPlayer(state, playerId);
  const enAttente = (player.nextRoll ?? []).filter((m) => m.thisTurnOnly === undefined || m.thisTurnOnly === turnNumber);
  const delta = enAttente.reduce((sum, m) => sum + (m.delta ?? 0), 0);
  const avantage = enAttente.some((m) => m.advantage);
  die = upgradeDie(die, enAttente.reduce((sum, m) => sum + (m.upgradeSteps ?? 0), 0));
  const hooks = enAttente.filter((m) => m.ifCriticalSuccess || m.ifCriticalFailure);

  // « La première fois que vous lancez un dé à chacun de vos tours » (Le Donjon).
  const premierDuTour = state.activePlayerId === playerId && player.firstRollTurn !== turnNumber;
  const relanceOfferte = premierDuTour && activeLandeRules(state.environment)?.firstRollRerollEachTurn === true;

  let rng = state.rngState;
  const tirer = () => {
    const r = nextInt(rng, die);
    rng = r.nextState;
    return r.value + 1;
  };
  const premier = tirer();
  const second = avantage ? tirer() : undefined;

  const { nextRoll: _consommes, ...sansAttente } = player;
  const restants = (player.nextRoll ?? []).filter((m) => !enAttente.includes(m));
  const apres: PlayerState = {
    ...sansAttente,
    ...(restants.length > 0 ? { nextRoll: restants } : {}),
    ...(state.activePlayerId === playerId ? { firstRollTurn: turnNumber } : {}),
  };

  const successAt = effect.successAt ?? defaultSuccessAt(die);
  const choice: DieRollChoice = {
    kind: "dieRoll",
    playerId,
    die,
    rolls: second === undefined ? [premier] : [premier, second],
    ...(second === undefined ? { value: borne(premier + delta, die) } : { candidates: [borne(premier + delta, die), borne(second + delta, die)] }),
    successAt,
    ...(relanceOfferte ? {} : { landeRerollUsed: true }),
    ...(hooks.length > 0 ? { hooks } : {}),
    branches: effect.dieBranches ?? [],
    ...(effect.dieBranchMode ? { branchMode: effect.dieBranchMode } : {}),
    ...(context.sourceInstanceId ? { sourceInstanceId: context.sourceInstanceId } : {}),
    ...(source ? { cardId: source.cardId } : {}),
    context,
    turnNumber,
  };
  return { state: replacePlayer({ ...state, rngState: rng }, apres), choice };
}

/** Une carte « Chaîne » que ce joueur peut Briser maintenant, depuis sa main ou son plateau. */
export function chainBreakables(state: GameState, playerId: PlayerId): Array<{ card: CardInstance; fromHand: boolean }> {
  const player = getPlayer(state, playerId);
  const chaine = (c: CardInstance) => getCardDefinition(c.cardId).chaine === true;
  return [
    ...player.hand.filter(chaine).map((card) => ({ card, fromHand: true })),
    ...player.board.filter(chaine).map((card) => ({ card, fromHand: false })),
  ];
}

/** Cartes en jeu de ce joueur dont l'ajustement (« +1 ou -1 ») est encore disponible ce tour. */
export function dieAdjusters(state: GameState, playerId: PlayerId, turnNumber: number): CardInstance[] {
  return getPlayer(state, playerId).board.filter((unit) => {
    const spec = getCardDefinition(unit.cardId).dieAdjust;
    if (!spec || unit.pendingRemoval) return false;
    if (flagTurn(unit, CLE_AJUSTEMENT) !== turnNumber) return true;
    // Utilisation de plus, gagnée par une Réussite critique.
    return flagTurn(unit, CLE_AJUSTEMENT_BONUS) === turnNumber;
  });
}

/** Ce que le joueur peut encore faire sur ce jet — vide : il se résout tout seul. */
export function dieRollOptions(state: GameState, choice: DieRollChoice): { pick: boolean; reroll: boolean; adjusters: CardInstance[]; chain: Array<{ card: CardInstance; fromHand: boolean }> } {
  const pick = choice.candidates !== undefined;
  return {
    pick,
    reroll: !choice.landeRerollUsed,
    adjusters: dieAdjusters(state, choice.playerId, choice.turnNumber),
    chain: chainBreakables(state, choice.playerId),
  };
}

export function dieRollHasOptions(state: GameState, choice: DieRollChoice): boolean {
  const o = dieRollOptions(state, choice);
  return o.pick || o.reroll || o.adjusters.length > 0 || o.chain.length > 0;
}

/** Le jet en cours, s'il y en a un. */
export function pendingDieRoll(state: GameState): DieRollChoice | undefined {
  return state.pendingChoice?.kind === "dieRoll" ? state.pendingChoice : undefined;
}

function withChoice(state: GameState, choice: DieRollChoice): GameState {
  return { ...state, pendingChoice: choice };
}

/**
 * RELANCE (Le Donjon de Ladalle, Relance j'te jure) : nouveau tirage, qui
 * remplace l'ancien. « La première relance que vous effectuez à chacun de vos
 * tours gagne +N » si la Lande nommée est active (Maître de Ladalle).
 */
export function rerollPending(state: GameState, choice: DieRollChoice): GameState {
  const r = nextInt(state.rngState, choice.die);
  let roll = r.value + 1;
  let next: GameState = { ...state, rngState: r.nextState };
  if (next.activePlayerId === choice.playerId) {
    for (const unit of getPlayer(next, choice.playerId).board) {
      const bonus = getCardDefinition(unit.cardId).rerollBonusWhileLande;
      if (!bonus || next.environment.lande?.cardId !== bonus.landeCardId || flagTurn(unit, CLE_BONUS_RELANCE) === choice.turnNumber) continue;
      roll += bonus.bonus;
      next = replaceBoardUnit(next, choice.playerId, unit.instanceId, (u) => ({
        ...u,
        oncePerTurnFlags: { ...(u.oncePerTurnFlags ?? {}), [CLE_BONUS_RELANCE]: choice.turnNumber },
      }));
      break;
    }
  }
  const { candidates: _abandonnes, ...reste } = choice;
  return withChoice(next, { ...reste, value: borne(roll, choice.die), rolls: [...choice.rolls, r.value + 1] });
}

/** Modifie le résultat courant (Chaîne, ajustement) — toujours entre 1 et la face max. */
export function shiftPending(state: GameState, choice: DieRollChoice, delta: number): GameState {
  if (choice.value === undefined) return state;
  return withChoice(state, { ...choice, value: borne(choice.value + delta, choice.die) });
}

/** Ajustement d'une carte en jeu (Miss Franche-Comté 1987) : consomme son utilisation du tour. */
export function adjustPending(state: GameState, choice: DieRollChoice, sourceInstanceId: string, delta: number): { ok: true; state: GameState } | { ok: false; error: string } {
  const unit = dieAdjusters(state, choice.playerId, choice.turnNumber).find((u) => u.instanceId === sourceInstanceId);
  if (!unit) return { ok: false, error: "Cette carte ne peut plus ajuster de jet ce tour." };
  const spec = getCardDefinition(unit.cardId).dieAdjust!;
  if (Math.abs(delta) !== spec.amount) return { ok: false, error: `L'ajustement est de +${spec.amount} ou -${spec.amount}.` };
  if (choice.value === undefined) return { ok: false, error: "Choisissez d'abord le dé à garder." };
  const bonus = flagTurn(unit, CLE_AJUSTEMENT) === choice.turnNumber;
  let next = replaceBoardUnit(state, choice.playerId, unit.instanceId, (u) => {
    const flags = { ...(u.oncePerTurnFlags ?? {}) };
    if (bonus) delete flags[CLE_AJUSTEMENT_BONUS];
    else flags[CLE_AJUSTEMENT] = choice.turnNumber;
    return { ...u, oncePerTurnFlags: flags };
  });
  next = withChoice(next, { ...choice, value: borne(choice.value + delta, choice.die), adjustedBy: [...(choice.adjustedBy ?? []), unit.instanceId] });
  return { ok: true, state: next };
}

/** Garde l'un des deux dés tirés (Double tentative). */
export function keepCandidate(state: GameState, choice: DieRollChoice, index: number): { ok: true; state: GameState } | { ok: false; error: string } {
  const value = choice.candidates?.[index];
  if (value === undefined) return { ok: false, error: "Ce dé n'existe pas." };
  const { candidates: _tires, ...reste } = choice;
  return { ok: true, state: withChoice(state, { ...reste, value }) };
}

/** La relance de Lande (Le Donjon de Ladalle) : une par jet, sur le premier jet de chacun de vos tours. */
export function landeReroll(state: GameState, choice: DieRollChoice): { ok: true; state: GameState } | { ok: false; error: string } {
  if (choice.landeRerollUsed) return { ok: false, error: "Aucune relance de Lande n'est disponible sur ce jet." };
  const player = getPlayer(state, choice.playerId);
  const next = replacePlayer(state, { ...player, landeRerollTurn: choice.turnNumber });
  return { ok: true, state: rerollPending(next, { ...choice, landeRerollUsed: true }) };
}

/** Ce que la fermeture de la Chaîne doit résoudre, dans l'ordre. */
export interface DieResolution {
  state: GameState;
  events: GameEvent[];
  /** Effets des branches satisfaites, puis la suite de la séquence — avec `dieResult`. */
  effects: EffectDefinition[];
  context: DieRollChoice["context"] & { dieResult: number };
  /** Suites de critique d'autres cartes (Maurice, Miss), chacune avec SA source. */
  hooks: Array<{ effects: EffectDefinition[]; context: { controllerId: PlayerId; sourceInstanceId?: string; turnNumber: number } }>;
}

/**
 * FERMETURE DE LA CHAÎNE : le résultat est retenu, son issue jugée, et ce qui
 * doit se résoudre est rendu à l'appelant (qui sait résoudre une séquence —
 * ce module ne l'importe pas). Le jet quitte `pendingChoice`.
 */
export function closeDieRoll(state: GameState, choice: DieRollChoice): DieResolution {
  const value = choice.value ?? Math.max(...(choice.candidates ?? [1]));
  const outcome = dieOutcomeOf(choice, value);
  const critique = outcome === "criticalSuccess" ? "success" : outcome === "criticalFailure" ? "failure" : undefined;
  const reussite = outcome === "criticalSuccess" || outcome === "success";

  const retenues: EffectDefinition[] = [];
  for (const branche of choice.branches) {
    const w = branche.when ?? {};
    if (w.critical && w.critical !== critique) continue;
    if (w.min !== undefined && value < w.min) continue;
    if (w.max !== undefined && value > w.max) continue;
    if (w.success && !reussite) continue;
    if (w.failure && reussite) continue;
    if (w.notCriticalFailure && outcome === "criticalFailure") continue;
    retenues.push(...branche.effects);
    if (choice.branchMode === "first") break;
  }

  const hooks: DieResolution["hooks"] = [];
  for (const hook of choice.hooks ?? []) {
    const effets = critique === "success" ? hook.ifCriticalSuccess : critique === "failure" ? hook.ifCriticalFailure : undefined;
    if (effets?.length) hooks.push({ effects: effets, context: { controllerId: hook.controllerId ?? choice.playerId, sourceInstanceId: hook.sourceInstanceId, turnNumber: choice.turnNumber } });
  }

  let next: GameState = { ...state, pendingChoice: undefined };
  // Ajustements de Miss Franche-Comté 1987 : une utilisation de plus sur
  // Réussite critique, sa sanction sur Échec critique.
  for (const id of choice.adjustedBy ?? []) {
    const owner = next.players.find((p) => p.board.some((u) => u.instanceId === id));
    const unit = owner?.board.find((u) => u.instanceId === id);
    if (!owner || !unit) continue;
    const spec = getCardDefinition(unit.cardId).dieAdjust;
    if (!spec) continue;
    if (critique === "success" && spec.extraUseOnCriticalSuccess) {
      next = replaceBoardUnit(next, owner.id, id, (u) => ({ ...u, oncePerTurnFlags: { ...(u.oncePerTurnFlags ?? {}), [CLE_AJUSTEMENT_BONUS]: choice.turnNumber } }));
    }
    if (critique === "failure" && spec.ifCriticalFailure?.length) {
      hooks.push({ effects: spec.ifCriticalFailure, context: { controllerId: owner.id, sourceInstanceId: id, turnNumber: choice.turnNumber } });
    }
  }

  const events: GameEvent[] = [
    {
      type: "DIE_RESOLVED",
      turnNumber: choice.turnNumber,
      timestamp: Date.now(),
      playerId: choice.playerId,
      ...(choice.sourceInstanceId ? { sourceInstanceId: choice.sourceInstanceId } : {}),
      ...(choice.cardId ? { cardId: choice.cardId } : {}),
      die: choice.die,
      value,
      outcome,
      rolls: choice.rolls,
    },
  ];
  return {
    state: next,
    events,
    effects: [...retenues, ...(choice.continuation?.effects ?? [])],
    context: { ...choice.context, dieResult: value },
    hooks,
  };
}

/** « Votre prochain jet … » : pose le modificateur sur le joueur. */
export function addNextRollModifier(state: GameState, playerId: PlayerId, modifier: NextRollModifier): GameState {
  const player = getPlayer(state, playerId);
  return replacePlayer(state, { ...player, nextRoll: [...(player.nextRoll ?? []), modifier] });
}

/** Fin de tour : ce qui ne valait que « ce tour » tombe. */
export function expireNextRollModifiers(player: PlayerState, endingTurn: number): PlayerState {
  if (!player.nextRoll?.length) return player;
  const restants = player.nextRoll.filter((m) => m.thisTurnOnly === undefined || m.thisTurnOnly > endingTurn);
  if (restants.length === player.nextRoll.length) return player;
  const { nextRoll: _tombes, ...reste } = player;
  return restants.length > 0 ? { ...reste, nextRoll: restants } : reste;
}

/**
 * Ce que ferait un joueur raisonnable sur ce jet (bot, délai de tour) : un
 * seul geste, sans recherche — garder le meilleur dé, relancer un jet raté,
 * ajuster vers le haut quand l'ajustement change l'issue, sinon fermer.
 * Les Objets « Chaîne » ne sont pas dépensés ici : le bot les garde.
 */
export function sensibleDieAnswer(
  state: GameState,
  choice: DieRollChoice
): { dieKeep: number } | { dieReroll: true } | { dieAdjust: { sourceInstanceId: string; delta: number } } | { dieResolve: true } {
  if (choice.candidates !== undefined) {
    const best = choice.candidates.indexOf(Math.max(...choice.candidates));
    return { dieKeep: Math.max(0, best) };
  }
  const value = choice.value ?? 1;
  const issue = dieOutcomeOf(choice, value);
  if (!choice.landeRerollUsed && (issue === "failure" || issue === "criticalFailure")) return { dieReroll: true };
  const ajusteur = dieAdjusters(state, choice.playerId, choice.turnNumber)[0];
  if (ajusteur) {
    const pas = getCardDefinition(ajusteur.cardId).dieAdjust!.amount;
    const monte = dieOutcomeOf(choice, borne(value + pas, choice.die));
    const rang = (o: DieOutcome) => ["criticalFailure", "failure", "success", "criticalSuccess"].indexOf(o);
    if (rang(monte) > rang(issue)) return { dieAdjust: { sourceInstanceId: ajusteur.instanceId, delta: pas } };
  }
  return { dieResolve: true };
}
