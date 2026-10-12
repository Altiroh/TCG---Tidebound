import { useEffect } from "react";
import { QUALIFICATION_ORDER, QUALIFICATIONS, STATUS_IMMOBILISE, STATUS_MALADE, STATUS_SILENCE, type CardInstance, type GameEvent, type GameState, type StatModifier } from "@/game";

/**
 * EFFETS DE LABO — appliquer d'un clic, à de VRAIES cartes du plateau du
 * labo (`/game/lande-preview`), ce qu'une carte peut porter : états
 * (Malade, Immobilisé, Silence), mots-clés (Garde, Pied marin), +1/+1 et
 * −1/−1, dégât et soin, entrave, texte ignoré, marqueur Mort, niveau LV
 * (demande du 12/10/2026).
 *
 * Ce n'est PAS le moteur : rien ne passe par `dispatch`, aucune règle ne
 * décide. Le labo écrit directement l'état de sa partie locale, et AJOUTE
 * au journal l'événement qu'une vraie carte aurait produit — c'est lui qui
 * fait jouer la même mise en scène qu'en partie (badge qui arrive, pastille
 * de gain, voile de soin, balancement d'un coup encaissé). Réservé au labo :
 * seul un `MatchBoard` monté avec `labPatchable` accepte ces écritures.
 */

export type LabPatch = (state: GameState) => GameState;

let target: ((patch: LabPatch) => void) | null = null;

/** Branche le plateau du labo : ses écritures passent par `setState`. */
export function useLabPatchTarget(enabled: boolean, setState: (update: (state: GameState) => GameState) => void): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const apply = (patch: LabPatch) => setState(patch);
    target = apply;
    return () => {
      if (target === apply) target = null;
    };
  }, [enabled, setState]);
}

/** Applique un effet de labo au plateau branché. `false` sans plateau de labo. */
export function applyLabPatch(patch: LabPatch): boolean {
  if (!target) return false;
  target(patch);
  return true;
}

export interface LabEffect {
  id: string;
  label: string;
  /** Section du panneau. */
  group: "États" | "Mots-clés" | "Qualifications" | "Statistiques" | "Entraves" | "Marqueurs";
  /** Ce que l'effet fait à UNE carte, et l'événement qu'une vraie carte aurait émis. */
  apply: (unit: CardInstance, state: GameState) => { unit: CardInstance; events: Omit<GameEvent, "turnNumber" | "timestamp">[] };
}

let modifierCount = 0;
function labModifier(fields: Partial<StatModifier>): StatModifier {
  modifierCount += 1;
  return { id: `lab_${Date.now()}_${modifierCount}`, source: "unknown", attack: 0, health: 0, duration: "permanent", ...fields };
}

/** Un état posé, ou retiré s'il est déjà là : le même bouton bascule. */
function toggleStatus(status: string): LabEffect["apply"] {
  return (unit) => {
    const has = (unit.statuses ?? []).includes(status);
    const statuses = has ? (unit.statuses ?? []).filter((s) => s !== status) : [...(unit.statuses ?? []), status];
    return {
      unit: { ...unit, statuses: statuses.length > 0 ? statuses : undefined },
      events: [{ type: "STATUS_CHANGED", targetInstanceId: unit.instanceId, status, applied: !has } as Omit<GameEvent, "turnNumber" | "timestamp">],
    };
  };
}

/** Un modificateur de labo du même genre, retiré s'il est déjà là ; sinon posé. */
function toggleModifier(kind: string, fields: Partial<StatModifier>, event?: (unit: CardInstance) => Omit<GameEvent, "turnNumber" | "timestamp">): LabEffect["apply"] {
  return (unit) => {
    const tag = `lab:${kind}`;
    const existing = unit.modifiers.find((m) => m.whileSourceInPlay === tag);
    if (existing) return { unit: { ...unit, modifiers: unit.modifiers.filter((m) => m !== existing) }, events: [] };
    return { unit: { ...unit, modifiers: [...unit.modifiers, labModifier({ ...fields, whileSourceInPlay: tag })] }, events: event ? [event(unit)] : [] };
  };
}

type Ev = Omit<GameEvent, "turnNumber" | "timestamp">;

export const LAB_EFFECTS: LabEffect[] = [
  { id: "malade", label: "Malade", group: "États", apply: toggleStatus(STATUS_MALADE) },
  { id: "immobilise", label: "Immobilisé", group: "États", apply: toggleStatus(STATUS_IMMOBILISE) },
  { id: "silence", label: "Silence", group: "États", apply: toggleStatus(STATUS_SILENCE) },
  {
    id: "sommeil",
    label: "Arrivée (ne peut pas attaquer)",
    group: "États",
    apply: (unit) => ({ unit: { ...unit, summoningSick: !unit.summoningSick }, events: [] }),
  },
  {
    id: "garde",
    label: "Garde",
    group: "Mots-clés",
    apply: toggleModifier("garde", { keywords: ["garde"] }, (unit) => ({ type: "BUFF_APPLIED", targetInstanceId: unit.instanceId, attack: 0, health: 0, keywords: ["garde"] }) as Ev),
  },
  {
    id: "pied-marin",
    label: "Pied marin",
    group: "Mots-clés",
    apply: toggleModifier("pied-marin", { keywords: ["pied-marin"] }, (unit) => ({ type: "BUFF_APPLIED", targetInstanceId: unit.instanceId, attack: 0, health: 0, keywords: ["pied-marin"] }) as Ev),
  },
  // Qualifications accordées (valeur X = 2) : une VRAIE attaque du labo les joue alors par le moteur, glyphes compris.
  ...QUALIFICATION_ORDER.map(
    (id): LabEffect => ({
      id: `q-${id}`,
      label: QUALIFICATIONS[id].hasValue ? `${QUALIFICATIONS[id].name} 2` : QUALIFICATIONS[id].name,
      group: "Qualifications",
      apply: toggleModifier(`q-${id}`, { qualifications: [{ id, ...(QUALIFICATIONS[id].hasValue ? { value: 2 } : {}) }] }),
    })
  ),
  {
    id: "buff",
    label: "+1/+1",
    group: "Statistiques",
    apply: (unit) => ({
      unit: { ...unit, modifiers: [...unit.modifiers, labModifier({ attack: 1, health: 1 })] },
      events: [{ type: "BUFF_APPLIED", targetInstanceId: unit.instanceId, attack: 1, health: 1 } as Ev],
    }),
  },
  {
    id: "debuff",
    label: "−1/−1",
    group: "Statistiques",
    apply: (unit) => ({
      unit: { ...unit, modifiers: [...unit.modifiers, labModifier({ attack: -1, health: -1 })] },
      events: [{ type: "DEBUFF_APPLIED", targetInstanceId: unit.instanceId, attack: -1, health: -1 } as Ev],
    }),
  },
  {
    id: "degat",
    label: "Dégât 1",
    group: "Statistiques",
    apply: (unit) => ({
      unit: { ...unit, damageMarked: unit.damageMarked + 1 },
      events: [{ type: "DAMAGE", targetInstanceId: unit.instanceId, amount: 1, cause: "effect" } as Ev],
    }),
  },
  {
    id: "soin",
    label: "Soin 1",
    group: "Statistiques",
    apply: (unit) => {
      if (unit.damageMarked <= 0) return { unit, events: [] };
      return { unit: { ...unit, damageMarked: unit.damageMarked - 1 }, events: [{ type: "HEAL", targetInstanceId: unit.instanceId, amount: 1 } as Ev] };
    },
  },
  {
    id: "remise",
    label: "Remettre à neuf",
    group: "Statistiques",
    apply: (unit) => ({ unit: { ...unit, damageMarked: 0, modifiers: [], statuses: undefined, markers: undefined, levelMarkers: undefined }, events: [] }),
  },
  { id: "entrave", label: "Entravée (ni attaque ni capacité)", group: "Entraves", apply: toggleModifier("entrave", { silenced: true }) },
  { id: "texte", label: "Texte ignoré", group: "Entraves", apply: toggleModifier("texte", { textIgnored: true }) },
  {
    id: "mort",
    label: "Marqueur Mort",
    group: "Marqueurs",
    apply: (unit) => {
      const has = (unit.markers?.mort ?? 0) > 0;
      return { unit: { ...unit, markers: has ? undefined : { ...unit.markers, mort: 1 } }, events: [] };
    },
  },
  {
    id: "niveau",
    label: "Niveau LV +1",
    group: "Marqueurs",
    apply: (unit) => ({ unit: { ...unit, levelMarkers: ((unit.levelMarkers ?? 0) + 1) % 5 || undefined }, events: [] }),
  },
];

/**
 * L'effet appliqué aux cartes `instanceIds` : l'état modifié, et les
 * événements correspondants ajoutés au journal (horodatés au tour en cours).
 */
export function applyLabEffect(state: GameState, effect: LabEffect, instanceIds: readonly string[]): GameState {
  const ids = new Set(instanceIds);
  const events: GameEvent[] = [];
  const players = state.players.map((player) => ({
    ...player,
    board: player.board.map((unit) => {
      if (!ids.has(unit.instanceId)) return unit;
      const result = effect.apply(unit, state);
      events.push(...result.events.map((event) => ({ ...event, turnNumber: state.turnNumber, timestamp: Date.now() }) as GameEvent));
      return result.unit;
    }),
  })) as GameState["players"];
  return { ...state, players, eventLog: [...state.eventLog, ...events] };
}
