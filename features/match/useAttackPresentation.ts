"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type GameEvent, type GameState, type PlayerId } from "@/game";
import { deriveEffectVolley, patchedDisplay, volleyLandingMs, type EffectVolley } from "@/features/match/effectPresentation";
import {
  declareCues,
  declareLeadMs,
  qualificationFxFrom,
  qualificationTimeline,
  type QualificationCue,
  type QualificationFx,
} from "@/features/match/qualificationFxData";
import { withoutSettledPrompts } from "@/features/match/settledPrompts";
import { beforeDieDisplay, dieHoldMs, freshDieRoll, type DieHold } from "@/features/match/dicePresentation";

export interface AttackAnimation {
  id: number;
  attackerInstanceId: string;
  /** Cible unité, absente pour une attaque directe du Navire. */
  defenderInstanceId?: string;
  /** Cible Navire (attaque directe) — présent seulement si `defenderInstanceId` est absent. */
  defenderPlayerId?: PlayerId;
  /** Dégâts infligés à la cible principale (unité ou Navire). */
  amount: number;
  /** Dégâts de riposte encaissés par l'attaquant (combat mutuel unité contre unité), si non nul. */
  retaliation?: number;
  /** La cible unité a quitté le plateau à l'issue du combat. */
  defenderDies: boolean;
  /** L'attaquant a quitté le plateau (riposte mortelle). */
  attackerDies: boolean;
  /** Qualifications qui ont joué pendant cette attaque (`QUALIFICATION_TRIGGERED`) : elles s'activent au bon moment. */
  qualifications?: QualificationFx[];
  /** Attente avant que l'attaquant ne parte : ses spé. de déclaration s'activent d'abord. */
  leadMs?: number;
  /** Quand chaque spé. s'active (déclaration, puis après l'attaque) — une à la fois, jamais ensemble. */
  qualificationCues?: QualificationCue[];
}

/**
 * Découpage de l'animation d'attaque (retour de test du 13/09) : la carte
 * se soulève, prend un léger élan en arrière, frappe sa cible, puis revient.
 * Le choc tombe à `ATTACK_IMPACT_AT_MS` — c'est à cet instant que les dégâts
 * deviennent visibles.
 */
export const ATTACK_TIMINGS = { lift: 140, windup: 170, strike: 120, back: 320 } as const;
export const ATTACK_IMPACT_AT_MS = ATTACK_TIMINGS.lift + ATTACK_TIMINGS.windup + ATTACK_TIMINGS.strike;
export const ATTACK_TOTAL_MS = ATTACK_IMPACT_AT_MS + ATTACK_TIMINGS.back;

function onAnyBoard(state: GameState, instanceId: string): boolean {
  return state.players.some((player) => player.board.some((unit) => unit.instanceId === instanceId));
}

/**
 * L'`ATTACK` d'indice `index` n'est qu'une DÉCLARATION suspendue : le moteur
 * l'émet quand une fenêtre de réaction s'ouvre avant le coup
 * (`suspendrePourInterception`, `game/actions/attack.ts`), puis l'émet de
 * nouveau à la reprise, quand le coup se résout pour de bon. Mettre en scène
 * les deux jouait deux élans et deux retenues — la première pour un « −0 »
 * trompeur, et la fenêtre n'apparaissait qu'après elle. Seule la résolution
 * s'anime ; si la réaction annule l'attaque, il n'y a simplement pas de coup.
 *
 * Reconnue à deux signes concordants : une fenêtre de réaction s'ouvre après
 * l'`ATTACK` sans qu'aucun coup (`DAMAGE.combat`) ne soit tombé, ET l'état
 * d'après garde l'attaque de CET attaquant en suspens (`pendingAttack`).
 */
export function isSuspendedDeclaration(events: GameEvent[], index: number, after: GameState): boolean {
  const declared = events[index];
  if (!declared || declared.type !== "ATTACK") return false;
  if (after.pendingAttack?.attackerInstanceId !== declared.attackerInstanceId) return false;
  for (const next of events.slice(index + 1)) {
    if (next.type === "ATTACK" || (next.type === "DAMAGE" && next.combat)) return false;
    if (next.type === "REACTION_WINDOW_OPENED") return true;
  }
  return false;
}

/**
 * Premier `ATTACK` RÉSOLU du lot, avec les dégâts déjà résolus par le moteur
 * (jamais recalculés côté client). Une déclaration suspendue par une fenêtre
 * de réaction ne compte pas (`isSuspendedDeclaration`).
 */
export function deriveAttack(events: GameEvent[], after: GameState, id: number): AttackAnimation | null {
  const index = events.findIndex((event, at) => event.type === "ATTACK" && !isSuspendedDeclaration(events, at, after));
  const event = events[index];
  if (!event || event.type !== "ATTACK") return null;

  let amount = 0;
  let defenderPlayerId: PlayerId | undefined;
  let retaliation: number | undefined;
  const qualifications: QualificationFx[] = [];
  // Seuls les coups marqués par le moteur (`DamageEvent.combat`) : un
  // Contrecoup renvoyé ou les dégâts d'une capacité ne sont pas « le coup ».
  for (const next of events.slice(index + 1)) {
    if (next.type === "ATTACK") break;
    const fx = qualificationFxFrom(next);
    if (fx) qualifications.push(fx);
    if (next.type !== "DAMAGE" || !next.combat) continue;
    if (next.combat === "retaliation") {
      retaliation = (retaliation ?? 0) + next.amount;
    } else {
      amount += next.amount;
      if (next.targetPlayerId) defenderPlayerId = next.targetPlayerId;
    }
  }

  return {
    id,
    attackerInstanceId: event.attackerInstanceId,
    defenderInstanceId: event.defenderInstanceId,
    // Attaque directe sans DAMAGE (0 dégât) : le Navire visé reste celui de l'adversaire de l'attaquant.
    defenderPlayerId: event.defenderInstanceId
      ? undefined
      : (defenderPlayerId ?? after.players.find((player) => player.id !== event.playerId)?.id),
    amount,
    retaliation,
    defenderDies: Boolean(event.defenderInstanceId) && !onAnyBoard(after, event.defenderInstanceId!),
    attackerDies: !onAnyBoard(after, event.attackerInstanceId),
    ...(qualifications.length > 0 ? { qualifications, leadMs: declareLeadMs(qualifications), qualificationCues: declareCues(qualifications) } : {}),
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Ce que la mise en scène a vu passer, et ce qu'elle retient. */
interface Presentation {
  /** Dernier état réel examiné. */
  live: GameState;
  /** État AFFICHÉ à la place du réel pendant le coup ou la volée — `null` hors mise en scène. */
  held: GameState | null;
  /** L'attaque en cours de mise en scène, s'il y en a une. */
  attack: AttackAnimation | null;
  /** Les effets en cours de mise en scène (projectiles, soins, gains), s'il y en a. */
  volley: EffectVolley | null;
  /** Ce coup termine la partie : on laisse l'animation aller au bout avant l'écran de fin. */
  finalBlow: boolean;
  /**
   * Un jet de dé résolu d'office (`dicePresentation.ts`) : le plateau reste
   * sur l'état d'avant l'issue (`shown`) le temps que le dé se pose et qu'on
   * lise sa face ; la suite du lot (`after`) se met en scène ensuite.
   */
  dice: { hold: DieHold; shown: GameState; after: GameEvent[] } | null;
  /**
   * Après l'attaque classique, les spé. s'activent et lancent leurs sorts
   * (`qualificationFxData.ts`) : le plateau affiche `interim` — l'attaque
   * jouée, pas encore ses effets de qualification — jusqu'à `endMs`.
   */
  post?: { volleys: EffectVolley[]; displays: Array<{ atMs: number; held: GameState }>; endMs: number } | null;
}

/** Mise en scène d'un lot d'événements : l'attaque, sinon les effets, et l'état à afficher en attendant. */
function stage(previous: GameState, live: GameState, events: GameEvent[], nextId: { current: number }): Omit<Presentation, "dice"> {
  const derived = deriveAttack(events, live, nextId.current);
  // Attaquer une Garde ne la montre pas : le coup part. Elle se montre quand on attaque À CÔTÉ d'elle (`showGuard`).
  const attack = derived;
  if (attack) nextId.current += 1;
  // Les effets des qualifications se jouent APRÈS l'attaque, en sorts de leur porteur : pas avec le coup.
  const volley = deriveEffectVolley(
    events.filter((event) => !event.byQualification),
    previous,
    live,
    nextId.current
  );
  if (volley) nextId.current += 1;
  let post: Presentation["post"] = null;
  let staging = attack;
  const fx = attack?.qualifications ?? [];
  if (attack && fx.length > 0) {
    // Après l'attaque classique, retour compris : les spé. s'enchaînent, une à la fois.
    const timeline = qualificationTimeline(previous, live, fx, attack.amount, (attack.leadMs ?? 0) + ATTACK_TOTAL_MS, () => nextId.current++);
    if (timeline.steps.length > 0) {
      post = { volleys: timeline.steps.flatMap((step) => (step.volley ? [step.volley] : [])), displays: timeline.displays, endMs: timeline.endMs };
      staging = {
        ...attack,
        qualificationCues: [
          ...(attack.qualificationCues ?? []),
          ...timeline.steps.map((step) => ({ sourceInstanceId: step.sourceInstanceId, qualification: step.qualification, atMs: step.atMs })),
        ],
      };
    }
  }
  const staged = staging !== null || volley !== null;
  return {
    live,
    held: staging ? previous : volley ? patchedDisplay(previous, live, volley) : null,
    attack: staging,
    volley,
    finalBlow: staged && live.status === "finished" && previous.status !== "finished",
    post,
  };
}

/** Après un coup qui termine la partie : le temps de voir le Navire encaisser avant l'écran de fin. */
const FINAL_BLOW_LINGER_MS = 900;

/**
 * Met en scène les attaques ET les effets en retardant l'état AFFICHÉ,
 * jamais l'état de jeu.
 *
 * Attaque : quand un nouvel état contient un `ATTACK`, le plateau continue
 * d'afficher l'état d'avant l'attaque (attaquant et cible encore en place,
 * Résistances intactes) pendant que `AttackImpactLayer` anime la vraie carte,
 * puis bascule sur l'état réel au choc — ou à la fin du retour si une carte
 * meurt, pour qu'elle encaisse le coup avant de partir au cimetière.
 *
 * Effets (`effectPresentation.ts`) : dégâts d'effet, soins, gains. Le
 * plateau affiche l'état réel RAPIÉCÉ — les cibles telles qu'avant — le
 * temps que `EffectFxLayer` fasse voler les projectiles, pose les voiles et
 * range les pastilles ; l'état réel s'affiche quand tout a touché. Dans un
 * lot qui contient aussi une attaque, c'est l'attaque qui retient l'état.
 *
 * Les appelants doivent continuer à valider/appliquer les actions sur l'état
 * RÉEL (`live`), pas sur `displayState`. Un nouvel état qui arrive pendant
 * une mise en scène l'interrompt : l'affichage rattrape aussitôt le réel.
 *
 * La retenue est décidée PENDANT LE RENDU (mise à jour d'état en cours de
 * rendu, pas dans un effet) : les enfants ne voient JAMAIS l'état réel
 * avant le choc. Avec un effet — même de layout — le plateau était d'abord
 * validé avec l'état réel, et `useTableMotion`, dont l'effet passe AVANT
 * celui du parent, faisait déjà voler la carte détruite vers la défausse ;
 * puis la retenue la faisait réapparaître pour le coup, et elle repartait
 * une seconde fois. Une carte ne doit mourir qu'une fois.
 */
export function useAttackPresentation(live: GameState): {
  displayState: GameState;
  attacks: AttackAnimation[];
  volleys: EffectVolley[];
  /** Un dé roule encore et retient l'issue de son jet : le bot attend avant de rejouer. */
  diceHolding: boolean;
  /**
   * Une mise en scène retient l'affichage (attaque, sort, dé) : le bot attend
   * qu'elle ait touché avant de rejouer — sinon son action suivante la coupe.
   */
  holding: boolean;
} {
  const [presentation, setPresentation] = useState<Presentation>({ live, held: null, attack: null, volley: null, finalBlow: false, dice: null });
  const [attacks, setAttacks] = useState<AttackAnimation[]>([]);
  const [volleys, setVolleys] = useState<EffectVolley[]>([]);
  const nextId = useRef(0);

  if (presentation.live !== live) {
    const previous = presentation.live;
    const newEvents = live.eventLog.length > previous.eventLog.length ? live.eventLog.slice(previous.eventLog.length) : [];
    const animate = newEvents.length > 0 && !prefersReducedMotion();
    const hold = animate ? freshDieRoll(newEvents, previous) : null;
    if (hold) {
      const shown = beforeDieDisplay(previous, live, newEvents, hold);
      setPresentation({ live, held: shown, attack: null, volley: null, finalBlow: false, dice: { hold, shown, after: newEvents.slice(hold.index + 1) } });
    } else {
      setPresentation(animate ? { ...stage(previous, live, newEvents, nextId), dice: null } : { live, held: null, attack: null, volley: null, finalBlow: false, dice: null });
    }
  }

  // Le dé s'est posé et sa face a été lue : la suite du lot se met en scène.
  // Un état plus récent a pu remplacer ce jet entre-temps : on n'y touche pas.
  const dice = presentation.dice;
  useEffect(() => {
    if (!dice) return;
    const timer = setTimeout(() => {
      setPresentation((current) =>
        current.dice === dice ? { ...stage(dice.shown, current.live, dice.after, nextId), dice: null } : current
      );
    }, dieHoldMs(dice.hold));
    return () => clearTimeout(timer);
  }, [dice]);

  // Minuteurs de la mise en scène : relâcher l'état retenu au bon moment,
  // puis retirer l'animation. La relâche ne touche qu'à SA mise en scène :
  // un état plus récent l'a peut-être déjà remplacée.
  const staged = presentation.attack;
  const volley = presentation.volley;
  const finalBlow = presentation.finalBlow;
  const post = presentation.post ?? null;
  useEffect(() => {
    if (!staged && !volley) return;
    const lead = staged?.leadMs ?? 0;
    if (staged) setAttacks((current) => (current.some((it) => it.id === staged.id) ? current : [...current, staged]));
    const spells = post?.volleys ?? [];
    for (const v of [volley, ...spells]) {
      if (v) setVolleys((current) => (current.some((it) => it.id === v.id) ? current : [...current, v]));
    }

    // L'attaque retient l'état si elle est là ; sinon, la volée jusqu'à son dernier impact.
    const baseHold = staged
      ? lead + (staged.defenderDies || staged.attackerDies ? ATTACK_TOTAL_MS : ATTACK_IMPACT_AT_MS)
      : volleyLandingMs(volley!);
    // Les spé. d'après l'attaque : l'état intermédiaire jusqu'à l'arrivée de leurs sorts.
    const endHold = post ? Math.max(baseHold, post.endMs) : baseHold;
    // Le coup de grâce : l'écran de fin n'arrive qu'une fois le coup joué
    // jusqu'au bout, retour compris, et le temps d'un souffle.
    const holdMs = finalBlow ? Math.max(endHold, staged ? lead + ATTACK_TOTAL_MS : 0) + FINAL_BLOW_LINGER_MS : endHold;
    const mine = (current: Presentation) => current.attack === staged && current.volley === volley;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Le plateau suit les spé. : au début aucune n'a agi, puis chacune a agi quand son étape est finie.
    for (const display of post?.displays ?? []) {
      timers.push(setTimeout(() => setPresentation((current) => (mine(current) ? { ...current, held: display.held } : current)), Math.max(baseHold, display.atMs)));
    }
    timers.push(setTimeout(() => setPresentation((current) => (mine(current) ? { ...current, held: null } : current)), holdMs));
    if (staged) setTimeout(() => setAttacks((current) => current.filter((it) => it.id !== staged.id)), Math.max(lead + ATTACK_TOTAL_MS, post?.endMs ?? 0) + 900);
    for (const v of [volley, ...spells]) {
      if (v) setTimeout(() => setVolleys((current) => current.filter((it) => it.id !== v.id)), volleyLandingMs(v) + 1400);
    }
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [staged, volley, finalBlow, post]);

  // Mémorisé : un nouvel objet à chaque rendu ferait croire au plateau que la partie a changé.
  const displayState = useMemo(
    () => (presentation.held ? withoutSettledPrompts(presentation.held, presentation.live) : presentation.live),
    [presentation.held, presentation.live]
  );

  return {
    displayState,
    attacks,
    volleys,
    diceHolding: presentation.dice !== null,
    holding: presentation.held !== null || presentation.dice !== null,
  };
}
