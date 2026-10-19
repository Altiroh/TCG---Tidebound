"use client";

import { useEffect, useRef, useState } from "react";
import {
  boardPermanents,
  boardSlotLayout,
  findAssemblage,
  getCardDefinition,
  getShipDefinition,
  graveyardChoicesForAbility,
  isReactionChainObject,
  graveyardChoicesForPlay,
  type CardInstance,
  type ChromaticColor,
  type GameState,
  activatableArrivals,
  type ActivatableArrival,
  type PendingReactionCandidate,
  type PlayerAction,
  type PlayerId,
  type PlayerState,
  withDieBranchEffects,
} from "@/game";
import { needsPlayTarget } from "@/features/match/needsPlayTarget";
import { arrivalModeFor, type TableTargeting } from "@/features/match/table/legalTargets";

/**
 * Interactions du plateau, partagées par la partie LOCALE (`MatchBoard`) et
 * la partie ARBITRÉE (`OnlineBoard`).
 *
 * Les deux écrans posaient la même machine à états deux fois, sous des noms
 * différents (`pending` d'un côté, `selection` de l'autre) : sélection de
 * cible, file de réactions, invite de bris, choix en défausse, visionneuse
 * de cimetière, fiche de carte, menu de pause, et les quatre gestes qui les
 * enchaînent. Toute correction était à faire deux fois — et une fois sur
 * deux, elle ne l'était pas.
 *
 * Ce qui reste PROPRE à chaque écran, et qui n'avait donc rien à faire ici :
 * la façon de soumettre une action (`dispatch` immédiat contre aller-retour
 * serveur), et l'activation multiple de réactions, qui se plie en une fois
 * en local et s'attend coup par coup en ligne.
 */

/**
 * Question d'Assemblage en cours. `proposal` : l'Assemblage proposé quand
 * la carte a été lâchée sur une Sentinelle (invite Oui / Non) ; absent, le
 * joueur désigne lui-même ses Sentinelles (carte touchée dans la main).
 */
export interface AssemblagePick {
  card: CardInstance;
  boardSlot?: number;
  proposal?: Array<{ instanceId: string; color: ChromaticColor }>;
}

/**
 * Comment la carte de main a été jouée.
 *
 * - `dropped` : LÂCHÉE sur le plateau. Le glisser a montré le prix de
 *   Déraison, et le lâcher sur un emplacement libre a déjà répondu à la
 *   question d'Assemblage (coût normal) ; `boardSlot` dit où.
 * - `fromZoom` : bouton « Jouer » de la carte agrandie, au doigt. Son
 *   libellé disait la Déraison : il vaut confirmation. Mais la question
 *   d'Assemblage reste posée, et un ciblage déjà engagé sur cette carte
 *   n'est pas annulé.
 */
export interface HandCardClickOptions {
  dropped?: boolean;
  boardSlot?: number;
  fromZoom?: boolean;
}

/** Ce que le joueur a commencé et doit terminer en désignant une cible. */
export type BoardSelection =
  | { kind: "playCard"; instanceId: string; needsTarget: boolean }
  | { kind: "attack"; attackerId: string }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; needsTarget: boolean; triggerSourceInstanceId?: string }
  /** Effet d'arrivée en réserve activé depuis la carte posée à droite : sa cible se désigne sur le plateau. */
  | { kind: "arrival"; sourceInstanceId: string; abilityIndexes: number[] }
  /** Canon de Navire armé : le joueur désigne ce qu'il vise (un permanent adverse, ou le Navire adverse). */
  | { kind: "shipShot" }
  /**
   * Capacité de Navire CIBLÉE (Pique à Glace) : le joueur désigne n'importe
   * quel permanent doté de Résistance, des deux côtés, ou n'importe quel
   * Navire — le sien compris. L'activation part au clic sur la cible.
   */
  | { kind: "shipTarget" }
  /**
   * Capacité activable d'une carte du plateau (`activatableOncePerTurn`) qui
   * demande une cible (Coffret aux Cinq Pierres : l'Éclat à Saborder).
   * L'activation part au clic sur la cible.
   */
  | { kind: "ability"; instanceId: string };

/**
 * Traduit la sélection du conteneur en ciblage pour le plateau. Les deux
 * écrans (local et en ligne) faisaient la même conversion en ligne, chacun
 * dans son JSX : un nouveau genre de sélection était à ajouter deux fois.
 *
 * Le tir de canon (`shipShot`) est le seul sans source sur le plateau — sa
 * source est le Navire, qui n'est pas une carte.
 */
export function tableTargetingFor(selection: BoardSelection | null): TableTargeting {
  if (!selection) return null;
  if (selection.kind === "shipShot") return { kind: "shipShot" };
  if (selection.kind === "shipTarget") return { kind: "shipTarget" };
  if (selection.kind === "attack") return { kind: "attack", sourceInstanceId: selection.attackerId };
  if (selection.kind === "reaction") {
    return {
      kind: "reaction",
      sourceInstanceId: selection.sourceInstanceId,
      abilityIndex: selection.abilityIndex,
      triggerSourceInstanceId: selection.triggerSourceInstanceId,
    };
  }
  if (selection.kind === "ability") return { kind: "ability", sourceInstanceId: selection.instanceId };
  // Les cibles de tous ses modes : c'est la cible touchée qui choisit le mode.
  if (selection.kind === "arrival") return { kind: "arrival", sourceInstanceId: selection.sourceInstanceId, abilityIndexes: selection.abilityIndexes };
  return { kind: selection.kind, sourceInstanceId: selection.instanceId };
}

export interface BoardInteractionConfig {
  /**
   * État VIVANT — celui du moteur, sur lequel se calculent coûts et choix.
   * Jamais l'état AFFICHÉ, qui retarde volontairement pendant l'animation
   * d'une attaque : un choix de défausse lu dessus porterait sur un plateau
   * qui n'existe déjà plus.
   */
  liveState: GameState;
  /** Joueur qui regarde : sa main et son plateau. */
  viewer: PlayerState;
  /** Au nom de qui les actions normales sont émises. */
  actorId: PlayerId;
  /** Peut jouer / saborder maintenant. */
  canPlayCards: boolean;
  /** Peut agir tout court (hors fenêtre de réaction en attente). */
  canAct: boolean;
  /** Soumet une action normale. */
  act: (action: PlayerAction) => void;
  /**
   * Premier clic sur une carte qui ferait plonger en Déraison : `true` si
   * l'avertissement l'a intercepté, et que le geste ne doit pas aboutir.
   */
  interceptDeraison: (instanceId: string) => boolean;
  /**
   * Appelé quand un geste commence, avant qu'il n'aboutisse ou n'entre en
   * désignation de cible. La partie locale y efface l'erreur du moteur : y
   * renoncer laisserait un refus affiché pendant qu'on choisit sa cible.
   */
  onGestureStart?: () => void;
}

/**
 * Geste suspendu à un choix dans le Cimetière.
 *
 * Deux formes, parce que deux gestes différents le demandent — et pas une
 * seule, parce que ce n'est pas la même action qui part ensuite. Jouer un
 * Objet (Grappin de Récupération) est une pose comme une autre.
 */
export type GraveyardPickRequest =
  | { kind: "play"; card: CardInstance; boardSlot?: number }
  | { kind: "reaction"; candidate: PendingReactionCandidate; arrival?: true };

/**
 * LA CARTE POSÉE À DROITE (`FocusedCard`, retour du 12/10/2026) : ce qu'on
 * s'apprête à faire d'une carte — activer son effet d'arrivée en réserve —
 * sans fenêtre par-dessus la table.
 *
 *   - `choose` : la carte est arrivée, ses boutons attendent ;
 *   - `targeting` : l'effet demande une cible, le plateau l'éclaire ;
 *   - `resolving` : l'action est partie, l'effet part de la carte ;
 *   - `leaving` : elle rentre (à sa place, ou au Cimetière).
 */
export type FocusRequest = { kind: "arrival"; card: CardInstance; options: ActivatableArrival[] };

export interface FocusState {
  request: FocusRequest;
  stage: "choose" | "targeting" | "resolving";
  leaving: boolean;
}

/** Temps que la carte reste à droite une fois l'action partie : l'effet s'envole d'elle. */
const FOCUS_RESOLVE_HOLD_MS = 1100;

export interface BoardInteraction {
  selection: BoardSelection | null;
  setSelection: (selection: BoardSelection | null) => void;
  clearSelection: () => void;

  /** Geste en attente d'une carte du Cimetière (pose ou réaction). */
  graveyardPick: GraveyardPickRequest | null;
  setGraveyardPick: (pick: GraveyardPickRequest | null) => void;
  /**
   * Carte à Assemblage en attente (Le Géant Chromatique, Lot 15) : le joueur
   * choisit entre l'Assemblage — et ses Sentinelles — et le coût normal.
   */
  assemblagePick: AssemblagePick | null;
  setAssemblagePick: (pick: AssemblagePick | null) => void;
  /**
   * Carte à Assemblage lâchée SUR une Sentinelle : la question se pose en
   * Oui / Non, avec un Assemblage qui inclut cette Sentinelle. `false` si
   * aucun Assemblage ne passe par elle.
   */
  handleAssemblageDrop: (instanceId: string, sentinelId: string) => boolean;
  graveyardViewerPlayerId: PlayerId | null;
  setGraveyardViewerPlayerId: (playerId: PlayerId | null) => void;
  detailInstance: CardInstance | null;
  setDetailInstance: (instance: CardInstance | null) => void;
  showPauseMenu: boolean;
  setShowPauseMenu: (open: boolean) => void;
  /** Carte de main en cours de glisser — alimente l'avertissement de Déraison. */
  draggingId: string | null;
  setDraggingId: (instanceId: string | null) => void;

  /** Réactions ciblées encore à résoudre, après celle en cours. */
  reactionQueue: PendingReactionCandidate[];
  /**
   * Entre en désignation de cible pour la première réaction de la file, et
   * garde le reste pour après. Rend `false` si la file est vide — l'appelant
   * referme alors la sélection.
   */
  beginReactionTargeting: (queued: PendingReactionCandidate[]) => boolean;

  handleHandCardClick: (instanceId: string, options?: HandCardClickOptions) => void;
  /** Cible désignée sur le plateau. Rend l'action de réaction à soumettre, ou `null` si le geste est déjà traité. */
  resolveBoardCardClick: (instanceId: string, ownerId: PlayerId) => PlayerAction | null;
  handleDropOnGraveyard: (instanceId: string, from: "hand" | "board") => void;
  /** Bouton « Activer » d'une carte du plateau (`activatableOncePerTurn`). */
  requestAbility: (instanceId: string) => void;
  /** Pastille de capacité glissée jusqu'à une cible : l'activation part sur elle, sans étape de sélection. */
  activateAbilityOn: (instanceId: string, targetInstanceId: string) => void;

  /** La carte posée à droite, s'il y en a une (`FocusedCard`). */
  focus: FocusState | null;
  /** Cartes du joueur dont l'effet d'arrivée attend en réserve : elles luisent. */
  arrivalReadyIds: string[];
  /** Carte lumineuse touchée : elle vole à droite et son effet part aussitôt (cible à désigner, ou résolution). */
  openArrivalFocus: (instanceId: string) => void;
  /** « Activer » (une option si la carte en a plusieurs — « choisissez : A ou B »). */
  activateFocusedArrival: (option: ActivatableArrival) => void;
  /**
   * « Activer » d'un effet à plusieurs modes qui visent tous une unité : les
   * cibles de tous les modes s'éclairent, le toucher choisit le mode.
   * `false` si un mode ne vise rien (il faut alors choisir le mode d'abord).
   */
  startFocusedArrival: () => boolean;
  /** « Annuler » : la carte rentre à sa place. */
  cancelFocus: () => void;
  /** Fin du vol de retour. */
  focusDone: () => void;
}

export function useBoardInteraction({
  liveState,
  viewer,
  actorId,
  canPlayCards,
  canAct,
  act,
  interceptDeraison,
  onGestureStart,
}: BoardInteractionConfig): BoardInteraction {
  const [selection, setSelection] = useState<BoardSelection | null>(null);
  const [reactionQueue, setReactionQueue] = useState<PendingReactionCandidate[]>([]);
  const [graveyardPick, setGraveyardPick] = useState<GraveyardPickRequest | null>(null);
  const [assemblagePick, setAssemblagePick] = useState<AssemblagePick | null>(null);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);
  const [detailInstance, setDetailInstance] = useState<CardInstance | null>(null);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  // Effets d'arrivée en réserve que le joueur peut activer maintenant — sur l'état VIVANT.
  const arrivals = canAct ? activatableArrivals(liveState, actorId) : [];
  const arrivalReadyIds = Array.from(new Set(arrivals.map(({ entry }) => entry.sourceInstanceId)));

  /** L'action de la carte à droite vient de partir : elle reste le temps que l'effet s'envole d'elle, puis rentre. */
  function focusResolving() {
    setFocus((current) => (current ? { ...current, stage: "resolving" } : current));
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setFocus((current) => (current ? { ...current, leaving: true } : current)), FOCUS_RESOLVE_HOLD_MS);
  }

  function cancelFocus() {
    if (selection?.kind === "arrival") clearSelection();
    window.clearTimeout(holdTimer.current);
    setFocus((current) => (current ? { ...current, leaving: true } : current));
  }

  function focusDone() {
    setFocus(null);
  }

  function openArrivalFocus(instanceId: string) {
    const card = viewer.board.find((c) => c.instanceId === instanceId);
    const options = arrivals.filter(({ entry }) => entry.sourceInstanceId === instanceId);
    if (!card || options.length === 0 || focus) return;
    onGestureStart?.();
    clearSelection();
    const focusState: FocusState = { request: { kind: "arrival", card, options }, stage: "choose", leaving: false };
    setFocus(focusState);
    // PAS DE SECONDE VALIDATION (16/10/2026) : toucher la carte lance son
    // effet. Un seul effet : il part (cible à désigner, « Annuler » possible,
    // ou résolution aussitôt). Plusieurs modes qui visent tous une unité : la
    // cible touchée choisit le mode. Seul un choix entre modes sans cible reste à faire.
    if (options.length === 1) {
      activateFocusedArrival(options[0]!);
      return;
    }
    if (options.every((option) => option.candidate.needsTarget)) {
      setSelection({ kind: "arrival", sourceInstanceId: instanceId, abilityIndexes: options.map((option) => option.entry.abilityIndex) });
      setFocus({ ...focusState, stage: "targeting" });
    }
  }

  function activateFocusedArrival({ candidate }: ActivatableArrival) {
    if (!canAct) return;
    const base = { type: "activateArrival" as const, playerId: actorId, sourceInstanceId: candidate.sourceInstanceId, abilityIndex: candidate.abilityIndex };
    if (candidate.needsTarget) {
      // Les cibles s'éclairent sur le plateau ; le reste s'estompe. Un toucher sur l'une, et c'est parti.
      setSelection({ kind: "arrival", sourceInstanceId: candidate.sourceInstanceId, abilityIndexes: [candidate.abilityIndex] });
      setFocus((current) => (current ? { ...current, stage: "targeting" } : current));
      return;
    }
    // Plusieurs cartes à repêcher : la question se pose ; une seule, le moteur la prend d'office.
    if (candidate.needsGraveyardTarget && graveyardChoicesForAbility(liveState, actorId, candidate.cardId, candidate.abilityIndex).length > 1) {
      setGraveyardPick({ kind: "reaction", candidate, arrival: true });
      focusResolving();
      return;
    }
    act(base);
    focusResolving();
  }

  function startFocusedArrival(): boolean {
    if (!canAct || focus?.request.kind !== "arrival") return false;
    const { options } = focus.request;
    if (options.length === 1) {
      activateFocusedArrival(options[0]!);
      return true;
    }
    if (!options.every((option) => option.candidate.needsTarget)) return false;
    setSelection({ kind: "arrival", sourceInstanceId: focus.request.card.instanceId, abilityIndexes: options.map((option) => option.entry.abilityIndex) });
    setFocus({ ...focus, stage: "targeting" });
    return true;
  }

  // Échap : bascule le menu de pause, sauf si une fenêtre est déjà ouverte —
  // Échap y vaut « annuler », jamais « quitter la partie ».
  useEffect(() => {
    const overlayOpen = Boolean(detailInstance || graveyardViewerPlayerId || graveyardPick || assemblagePick);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (overlayOpen) return;
      setShowPauseMenu((current) => !current);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailInstance, graveyardViewerPlayerId, graveyardPick, assemblagePick]);

  function clearSelection() {
    setSelection(null);
    setReactionQueue([]);
  }

  function beginReactionTargeting(queued: PendingReactionCandidate[]): boolean {
    const [first, ...rest] = queued;
    if (!first) {
      clearSelection();
      return false;
    }
    setSelection({
      kind: "reaction",
      sourceInstanceId: first.sourceInstanceId,
      abilityIndex: first.abilityIndex,
      needsTarget: true,
      triggerSourceInstanceId: first.triggerSourceInstanceId,
    });
    setReactionQueue(rest);
    return true;
  }

  /** Clic sur une carte de main : la joue, ou entre en désignation de cible (cf. `HandCardClickOptions`). */
  function handleHandCardClick(instanceId: string, { dropped = false, boardSlot, fromZoom = false }: HandCardClickOptions = {}) {
    if (!canPlayCards) return;
    const card = viewer.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (!dropped && !fromZoom && interceptDeraison(instanceId)) return;
    onGestureStart?.();
    // Recliquer la carte déjà choisie annule — le geste est son propre retour.
    // Pas depuis le zoom : « Jouer » n'y veut jamais dire « annuler ».
    if (selection?.kind === "playCard" && selection.instanceId === instanceId) {
      if (!fromZoom) clearSelection();
      return;
    }
    const def = getCardDefinition(card.cardId);
    // Un Objet « Chaîne » de réaction ne se joue que dans sa fenêtre : le
    // toucher le montre en grand, il ne tente rien. Une Chaîne instantanée
    // (`chaineLibre`) se joue aussi d'ici, comme un Objet classique.
    if (isReactionChainObject(def) && !def.chaineLibre) {
      setDetailInstance(card);
      return;
    }
    // « Assemblage Chromatique » : carte TOUCHÉE, la question se pose —
    // Assembler, ou payer le coût normal. Jamais décidée à la place du
    // joueur. Carte LÂCHÉE sur un emplacement libre (`confirmed`), le geste
    // a déjà répondu : il la pose, au coût normal. L'Assemblage, lui, se
    // demande en la lâchant sur une Sentinelle (`handleAssemblageDrop`).
    if (!dropped && def.chromaticAssemblage && findAssemblage(viewer.board, def.chromaticAssemblage.sentinels)) {
      setAssemblagePick({ card, boardSlot });
      return;
    }
    if (needsPlayTarget(def, viewer.board)) {
      setSelection({ kind: "playCard", instanceId, needsTarget: true });
      return;
    }
    // « À son arrivée, choisissez une unité dans votre Cimetière » (ou l'effet
    // d'un Objet qui repêche) : la question se pose AVANT la pose. Sur l'état VIVANT,
    // le Cimetière affiché pouvant retarder d'une animation.
    if (graveyardChoicesForPlay(liveState, actorId, def).length > 0) {
      // L'emplacement voyage avec la question : le joueur a déjà lâché sa
      // carte quelque part, la réponse au Cimetière ne doit pas l'oublier.
      setGraveyardPick({ kind: "play", card, boardSlot });
      return;
    }
    act({ type: "playCard", playerId: actorId, instanceId, boardSlot });
  }

  /**
   * Cible désignée sur le plateau.
   *
   * Les réactions remontent à l'appelant au lieu d'être soumises ici : elles
   * peuvent survenir HORS de son tour, et les deux écrans ne les soumettent
   * pas de la même façon. Tout le reste est traité sur place.
   */
  function resolveBoardCardClick(instanceId: string, ownerId: PlayerId): PlayerAction | null {
    if (selection?.kind === "reaction" && selection.needsTarget) {
      return {
        type: "activateReaction",
        playerId: viewer.id,
        sourceInstanceId: selection.sourceInstanceId,
        abilityIndex: selection.abilityIndex,
        targetInstanceId: instanceId,
      };
    }
    if (!canAct) return null;
    if (selection?.kind === "arrival") {
      // Plusieurs modes : la cible touchée dit lequel (une alliée pour le bonus, une ennemie pour le malus).
      const abilityIndex = arrivalModeFor(liveState, actorId, selection.sourceInstanceId, selection.abilityIndexes, instanceId);
      if (abilityIndex === undefined) return null;
      act({ type: "activateArrival", playerId: actorId, sourceInstanceId: selection.sourceInstanceId, abilityIndex, targetInstanceId: instanceId });
      clearSelection();
      focusResolving();
      return null;
    }
    if (selection?.kind === "playCard" && selection.needsTarget) {
      act({ type: "playCard", playerId: actorId, instanceId: selection.instanceId, targetInstanceId: instanceId });
      return null;
    }
    if (selection?.kind === "ability") {
      act({ type: "activateAbility", playerId: actorId, sourceInstanceId: selection.instanceId, targetInstanceId: instanceId });
      clearSelection();
      return null;
    }
    if (selection?.kind === "attack" && ownerId !== viewer.id) {
      act({ type: "attack", playerId: actorId, attackerInstanceId: selection.attackerId, defenderInstanceId: instanceId });
      return null;
    }
    if (selection?.kind === "shipShot" && ownerId !== viewer.id) {
      act({ type: "fireShipAbility", playerId: actorId, targetInstanceId: instanceId });
      clearSelection();
    }
    if (selection?.kind === "shipTarget") {
      act({ type: "activateShipAbility", playerId: actorId, targetInstanceId: instanceId });
      clearSelection();
    }
    return null;
  }

  function handleAssemblageDrop(instanceId: string, sentinelId: string): boolean {
    if (!canPlayCards) return false;
    const card = viewer.hand.find((c) => c.instanceId === instanceId);
    const requis = card && getCardDefinition(card.cardId).chromaticAssemblage?.sentinels;
    if (!card || !requis) return false;
    const proposal = findAssemblage(viewer.board, requis, sentinelId);
    if (!proposal) return false;
    onGestureStart?.();
    // Le Géant prend la CASE de la Sentinelle sur laquelle on l'a lâché :
    // elle se libère quand les Sentinelles Assemblées partent.
    const capacity = getShipDefinition(viewer.shipId).slotCount;
    const slot = boardSlotLayout(boardPermanents(viewer.board), capacity).findIndex((u) => u?.instanceId === sentinelId);
    setAssemblagePick({ card, proposal, boardSlot: slot >= 0 ? slot : undefined });
    return true;
  }

  /**
   * Bouton « Activer » d'une carte du plateau : l'activation part tout de
   * suite, ou — si un effet vise une unité désignée — le joueur désigne
   * d'abord la cible. Le moteur ne choisit jamais à sa place.
   */
  /**
   * Capacité activable (16/10/2026) : toucher la carte LANCE l'effet, sans
   * seconde validation. S'il vise une unité, la carte se pose à droite et le
   * plateau s'éclaire de ses cibles (« Annuler » possible) ; sinon il se
   * résout aussitôt.
   */
  function requestAbility(instanceId: string) {
    if (!canAct) return;
    const card = viewer.board.find((c) => c.instanceId === instanceId);
    if (!card) return;
    onGestureStart?.();
    if (selection?.kind === "ability" && selection.instanceId === instanceId) {
      clearSelection();
      return;
    }
    const spec = getCardDefinition(card.cardId).activatableOncePerTurn;
    if (spec && withDieBranchEffects(spec.effects).some((effect) => effect.target.kind === "chosenUnit")) {
      setSelection({ kind: "ability", instanceId });
      return;
    }
    act({ type: "activateAbility", playerId: actorId, sourceInstanceId: instanceId });
  }

  /** La cible a été désignée D'UN GESTE (glisser la pastille jusqu'à elle) : le joueur a choisi, on active. */
  function activateAbilityOn(instanceId: string, targetInstanceId: string) {
    if (!canAct) return;
    onGestureStart?.();
    clearSelection();
    act({ type: "activateAbility", playerId: actorId, sourceInstanceId: instanceId, targetInstanceId });
  }

  /**
   * Carte lâchée sur le crâne : un permanent du plateau est Sabordé. Un Objet
   * de la main se JOUE (il finira au Cimetière une fois résolu) — c'est le
   * geste qui servait à le Briser depuis la main.
   */
  function handleDropOnGraveyard(instanceId: string, from: "hand" | "board") {
    if (from === "board") {
      if (viewer.board.some((c) => c.instanceId === instanceId)) act({ type: "saborder", playerId: actorId, instanceId });
      return;
    }
    const card = viewer.hand.find((c) => c.instanceId === instanceId);
    if (card && getCardDefinition(card.cardId).type === "objet") handleHandCardClick(instanceId, { dropped: true });
  }

  return {
    focus,
    arrivalReadyIds,
    openArrivalFocus,
    activateFocusedArrival,
    startFocusedArrival,
    cancelFocus,
    focusDone,
    selection,
    setSelection,
    requestAbility,
    activateAbilityOn,
    clearSelection,
    graveyardPick,
    setGraveyardPick,
    assemblagePick,
    setAssemblagePick,
    handleAssemblageDrop,
    graveyardViewerPlayerId,
    setGraveyardViewerPlayerId,
    detailInstance,
    setDetailInstance,
    showPauseMenu,
    setShowPauseMenu,
    draggingId,
    setDraggingId,
    reactionQueue,
    beginReactionTargeting,
    handleHandCardClick,
    resolveBoardCardClick,
    handleDropOnGraveyard,
  };
}
