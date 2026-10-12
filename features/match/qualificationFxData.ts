import type { CardInstance, GameEvent, GameState, PlayerId, QualificationId } from "@/game";
import {
  GUARD_SHOW_MS,
  ORB_CHARGE_MS,
  patchedDisplay,
  SHOT_FLIGHT_MS,
  volleyLandingMs,
  type EffectVolley,
  type SpellSource,
} from "@/features/match/effectPresentation";

/**
 * Données PURES de la mise en scène des qualifications (spécification du
 * 12/10/2026, commit « New effect ») — sans DOM ni son :
 *
 *   1. La spé. S'ACTIVE comme la Garde : la carte qui la porte se lève, son
 *      médaillon scintille, puis elle se repose (`activateQualifications`).
 *   2. Puis son effet part en SORT, depuis la carte, comme les sorts lancés
 *      (orbe qui se charge, comète) :
 *        - Brèche : un sort de dégâts sur le Navire adverse (l'excédent) ;
 *        - Sangsue : un sort de soin sur le Navire du porteur ;
 *        - Éclaboussure, Salve : des sorts de dégâts sur les autres cibles ;
 *        - Entaille : un sort de malus sur la cible ;
 *        - Ponction : un malus sur le Navire touché, dont la Raison baisse ;
 *        - Coup de grâce : pas de sort, la cible est détruite ensuite ;
 *        - Carnage : pas de sort, le halo d'attaque se rallume.
 *
 * Le MOMENT : Rafale, Déluge et Contournement s'activent à la DÉCLARATION,
 * avant que l'attaquant ne frappe (c'est ce qui rend l'attaque possible) ;
 * toutes les autres APRÈS l'attaque classique, une fois l'attaquant revenu.
 *
 * Plusieurs spé. : JAMAIS en même temps (retour du 12/10/2026). Elles
 * s'enchaînent, une ÉTAPE chacune — activation, puis son sort — dans
 * l'ordre de `STEP_ORDER` : ce que le coup fait à la cible, puis à ses
 * voisins, puis au Navire adverse, puis au sien, et l'attaque de plus en
 * dernier.
 */

/** Durée de l'activation (lever, scintillement, repos) — celle de la Garde. */
export const QUALIFICATION_SHOW_MS = GUARD_SHOW_MS;
/** Instant, dans l'activation, où l'orbe du sort commence à se charger : au second scintillement. */
export const QUALIFICATION_SPELL_AT_MS = Math.round(GUARD_SHOW_MS * 0.55);

export type QualificationMoment = "declare" | "after";

const DECLARE: ReadonlySet<QualificationId> = new Set(["rafale", "deluge", "contournement"]);

export function qualificationMoment(id: QualificationId): QualificationMoment {
  return DECLARE.has(id) ? "declare" : "after";
}

/** Couleur (« r,g,b ») de l'activation : celle de ce que fait la qualification. */
export const QUALIFICATION_TONES: Record<QualificationId, string> = {
  rafale: "253,224,71",
  deluge: "125,211,252",
  contournement: "125,211,252",
  salve: "253,224,71",
  "coup-de-grace": "248,113,113",
  eclaboussure: "125,211,252",
  entaille: "232,121,249",
  breche: "248,113,113",
  ponction: "232,121,249",
  sangsue: "134,239,172",
  carnage: "248,113,113",
};

/** Une qualification à mettre en scène : ce que dit l'événement du moteur. */
export interface QualificationFx {
  qualification: QualificationId;
  sourceInstanceId: string;
  targetInstanceId?: string;
  targetPlayerId?: PlayerId;
  amount?: number;
}

export function qualificationFxFrom(event: GameEvent): QualificationFx | null {
  if (event.type !== "QUALIFICATION_TRIGGERED") return null;
  return {
    qualification: event.qualification,
    sourceInstanceId: event.sourceInstanceId,
    targetInstanceId: event.targetInstanceId,
    targetPlayerId: event.targetPlayerId,
    amount: event.amount,
  };
}

/** Ordre des étapes quand plusieurs spé. jouent dans la même attaque. */
const STEP_ORDER: readonly QualificationId[] = [
  "rafale",
  "deluge",
  "contournement",
  "coup-de-grace",
  "entaille",
  "eclaboussure",
  "salve",
  "breche",
  "ponction",
  "sangsue",
  "carnage",
];

/** Écart entre deux étapes : la spé. suivante s'active quand la carte se repose de la précédente. */
export const QUALIFICATION_STEP_MS = Math.round(QUALIFICATION_SHOW_MS * 0.85);

/** UNE spé. qui s'active sur sa carte, avec ce qu'elle fait (plusieurs voisins pour une Éclaboussure). */
export interface QualificationStep {
  sourceInstanceId: string;
  qualification: QualificationId;
  fx: QualificationFx[];
}

/** Les étapes d'un moment, une par (carte, qualification), dans l'ordre de `STEP_ORDER`. */
export function qualificationSteps(fx: readonly QualificationFx[], moment: QualificationMoment): QualificationStep[] {
  const steps: QualificationStep[] = [];
  for (const f of fx) {
    if (qualificationMoment(f.qualification) !== moment) continue;
    const known = steps.find((step) => step.sourceInstanceId === f.sourceInstanceId && step.qualification === f.qualification);
    if (known) known.fx.push(f);
    else steps.push({ sourceInstanceId: f.sourceInstanceId, qualification: f.qualification, fx: [f] });
  }
  return steps.sort((a, b) => STEP_ORDER.indexOf(a.qualification) - STEP_ORDER.indexOf(b.qualification));
}

/** Attente avant que l'attaquant ne parte : ses spé. de déclaration s'activent d'abord, l'une après l'autre. */
export function declareLeadMs(fx: readonly QualificationFx[]): number {
  return qualificationSteps(fx, "declare").length * QUALIFICATION_STEP_MS;
}

/** Quand chaque spé. s'active, depuis le début de la mise en scène — ce que joue `AttackImpactLayer`. */
export interface QualificationCue {
  sourceInstanceId: string;
  qualification: QualificationId;
  atMs: number;
}

/** Les spé. de déclaration, l'une après l'autre dès le départ. */
export function declareCues(fx: readonly QualificationFx[]): QualificationCue[] {
  return qualificationSteps(fx, "declare").map((step, index) => ({ sourceInstanceId: step.sourceInstanceId, qualification: step.qualification, atMs: index * QUALIFICATION_STEP_MS }));
}

function ownerOf(states: readonly GameState[], instanceId: string): PlayerId | undefined {
  for (const state of states) {
    const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId));
    if (owner) return owner.id;
  }
  return undefined;
}

/**
 * Les SORTS des qualifications d'après l'attaque, lancés par leur porteur
 * `delayMs` après le début de la mise en scène — `null` s'il n'y a rien à
 * lancer (Coup de grâce et Carnage s'activent sans sort).
 */
export function qualificationVolley(fx: readonly QualificationFx[], before: GameState, after: GameState, id: number, delayMs: number): EffectVolley | null {
  return qualificationVolleyFor(
    fx,
    {
      ownerOf: (instanceId) => ownerOf([after, before], instanceId) ?? before.activePlayerId,
      stillOnBoard: (instanceId) => after.players.some((p) => p.board.some((u) => u.instanceId === instanceId)),
    },
    id,
    delayMs
  );
}

/** Même construction, sans état de partie (labo) : qui contrôle le porteur, et la cible est-elle encore en jeu ? */
export function qualificationVolleyFor(
  fx: readonly QualificationFx[],
  board: { ownerOf: (instanceId: string) => PlayerId; stillOnBoard: (instanceId: string) => boolean },
  id: number,
  delayMs: number
): EffectVolley | null {
  const volley: EffectVolley = { id, delayMs, awakens: [], castMs: ORB_CHARGE_MS, shots: [], heals: [], buffs: [], reason: [] };
  const sourceOf = (f: QualificationFx): SpellSource => ({ from: { kind: "unit", id: f.sourceInstanceId }, originPlayerId: board.ownerOf(f.sourceInstanceId) });
  const onBoardAfter = board.stillOnBoard;
  for (const f of fx) {
    if (qualificationMoment(f.qualification) !== "after") continue;
    const source = sourceOf(f);
    const amount = f.amount ?? 0;
    switch (f.qualification) {
      case "breche":
        if (f.targetPlayerId && amount > 0) volley.shots.push({ ...source, to: { kind: "ship", id: f.targetPlayerId }, amount, look: "magic" });
        break;
      case "eclaboussure":
      case "salve":
        if (f.targetInstanceId && amount > 0) volley.shots.push({ ...source, to: { kind: "unit", id: f.targetInstanceId }, amount, look: "magic" });
        break;
      case "sangsue":
        if (f.targetPlayerId && amount > 0) volley.heals.push({ to: { kind: "ship", id: f.targetPlayerId }, amount, source });
        break;
      case "entaille":
        // Une cible détruite du même coup n'a plus où recevoir son malus.
        if (f.targetInstanceId && amount > 0 && onBoardAfter(f.targetInstanceId)) {
          volley.buffs.push({ targetInstanceId: f.targetInstanceId, attack: -amount, health: 0, keywords: [], loss: true, source });
        }
        break;
      case "ponction":
        if (f.targetPlayerId && amount > 0) {
          volley.shots.push({ ...source, to: { kind: "ship", id: f.targetPlayerId }, amount: 0, look: "drain" });
          // La Raison tombe sur la jauge quand le malus touche.
          volley.reason.push({ playerId: f.targetPlayerId, amount: -amount, delayMs: delayMs + ORB_CHARGE_MS + SHOT_FLIGHT_MS });
        }
        break;
      default:
        break;
    }
  }
  return volley.shots.length + volley.heals.length + volley.buffs.length + volley.reason.length > 0 ? volley : null;
}

/**
 * L'état AFFICHÉ entre la fin de l'attaque classique et l'arrivée des sorts
 * des qualifications : l'état réel, sauf ce que ces sorts n'ont pas encore
 * fait — les voisins éclaboussés et les Navires visés tels qu'avant, la
 * Puissance retirée par Entaille pas encore retirée, la Raison de la
 * Ponction pas encore perdue, et la cible d'un Coup de grâce encore là
 * (blessée), le temps que la spé. s'active.
 */
export function qualificationInterim(
  previous: GameState,
  live: GameState,
  fx: readonly QualificationFx[],
  volley: EffectVolley | null,
  strikeAmount: number
): GameState {
  // Les cibles des sorts (hors malus de Raison et hors Entaille, traités à part) reprennent leur état d'avant.
  const base = volley
    ? patchedDisplay(previous, live, { ...volley, shots: volley.shots.filter((s) => s.look !== "drain"), buffs: [] })
    : { ...live, eventLog: previous.eventLog };
  const entailles = new Set(fx.filter((f) => f.qualification === "entaille" && f.targetInstanceId).map((f) => f.targetInstanceId!));
  const graces = fx.filter((f) => f.qualification === "coup-de-grace" && f.targetInstanceId).map((f) => f.targetInstanceId!);
  const players = base.players.map((player) => {
    let board: CardInstance[] = player.board.map((unit) =>
      entailles.has(unit.instanceId) ? { ...unit, modifiers: unit.modifiers.filter((m) => !m.id.startsWith("entaille_")) } : unit
    );
    // Coup de grâce : la cible n'est détruite qu'après l'activation.
    const before = previous.players.find((p) => p.id === player.id);
    for (const id of graces) {
      if (board.some((u) => u.instanceId === id)) continue;
      const index = before?.board.findIndex((u) => u.instanceId === id) ?? -1;
      if (!before || index < 0) continue;
      const victim = before.board[index]!;
      board = [...board.slice(0, index), { ...victim, damageMarked: victim.damageMarked + strikeAmount }, ...board.slice(index)];
    }
    return { ...player, board };
  }) as GameState["players"];
  return { ...base, players };
}

/** Une étape placée dans le temps : quand la spé. s'active, et le sort qu'elle lance. */
export type ScheduledStep = QualificationStep & { atMs: number; volley: EffectVolley | null; doneMs: number };

/**
 * Place les étapes L'UNE APRÈS L'AUTRE à partir de `startMs` : chacune
 * s'active quand la précédente a fini — sa carte reposée, son sort arrivé.
 */
export function scheduleSteps(
  steps: readonly QualificationStep[],
  startMs: number,
  volleyFor: (step: QualificationStep, spellAtMs: number) => EffectVolley | null
): ScheduledStep[] {
  let at = startMs;
  return steps.map((step) => {
    const volley = volleyFor(step, at + QUALIFICATION_SPELL_AT_MS);
    const doneMs = Math.max(at + QUALIFICATION_STEP_MS, volley ? volleyLandingMs(volley) : 0);
    const scheduled = { ...step, atMs: at, volley, doneMs };
    at = doneMs;
    return scheduled;
  });
}

/**
 * Le DÉROULÉ des spé. d'après l'attaque, `startMs` après le début de la
 * mise en scène : les étapes placées dans le temps et, pour le plateau,
 * l'état à afficher — au début, aucune n'a encore agi ; une fois une étape
 * finie, la sienne a agi.
 */
export function qualificationTimeline(
  previous: GameState,
  live: GameState,
  fx: readonly QualificationFx[],
  strikeAmount: number,
  startMs: number,
  nextId: () => number
): { steps: ScheduledStep[]; displays: Array<{ atMs: number; held: GameState }>; endMs: number } {
  const steps = scheduleSteps(qualificationSteps(fx, "after"), startMs, (step, spellAtMs) => qualificationVolley(step.fx, previous, live, nextId(), spellAtMs));
  const displays = steps.map((_, index) => {
    // Ce qui n'a pas encore agi : cette étape et les suivantes.
    const pending = steps.slice(index);
    const merged = pending.reduce<EffectVolley | null>(
      (acc, step) =>
        !step.volley
          ? acc
          : acc
            ? { ...acc, shots: [...acc.shots, ...step.volley.shots], heals: [...acc.heals, ...step.volley.heals], buffs: [...acc.buffs, ...step.volley.buffs], reason: [...acc.reason, ...step.volley.reason] }
            : step.volley,
      null
    );
    const atMs = index === 0 ? startMs : steps[index - 1]!.doneMs;
    return { atMs, held: qualificationInterim(previous, live, pending.flatMap((step) => step.fx), merged, strikeAmount) };
  });
  return { steps, displays, endMs: steps.length > 0 ? steps[steps.length - 1]!.doneMs : startMs };
}
