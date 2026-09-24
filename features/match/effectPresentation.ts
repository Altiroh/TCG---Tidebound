import type { CardInstance, GameEvent, GameState, PlayerId } from "@/game";

/**
 * Mise en scène des EFFETS (hors coup d'attaque) — la partie pure, testable
 * sans DOM : quoi animer, d'où, vers où, et quel état afficher en attendant.
 *
 *   - dégâts d'un effet (sort, capacité, tir de Navire) : un projectile part
 *     du LANCEUR (`DamageEvent.origin`) — la carte si elle est sur un
 *     plateau, sinon le Navire de son contrôleur — vers chaque cible, tous
 *     en même temps ;
 *   - soin : un voile se pose sur la carte ou le Navire soigné ;
 *   - gain / perte de caractéristiques ou de mot-clé : une pastille surgit
 *     au-dessus de la carte, puis file se ranger là où la valeur s'affiche.
 *
 * Pendant ce temps, l'affichage montre un état RAPIÉCÉ (`patchedDisplay`) :
 * l'état réel, sauf les cibles (et un lanceur qui vient de quitter le
 * plateau), rendues telles qu'elles étaient avant le lot. Les chiffres ne
 * bougent donc qu'à l'arrivée du projectile, et une carte tuée par l'effet
 * encaisse le coup avant de se briser.
 */

/** Temps de vol d'un projectile, du lanceur à la cible. */
export const SHOT_FLIGHT_MS = 480;
/** Instant où le voile de soin recouvre la cible : la Résistance remonte dessous. */
export const HEAL_APPLY_MS = 420;
/** Durée totale du voile. */
export const HEAL_TOTAL_MS = 1150;
/** Pastille de gain : surgit, se montre, puis rejoint sa place — la valeur change à l'arrivée. */
export const BUFF_LAND_MS = 900;
/** Carte qui vient d'être posée : on la laisse atterrir avant qu'elle ne tire (`useTableMotion`, glissé de pose). */
export const ARRIVAL_DELAY_MS = 460;

export type FxTarget = { kind: "unit"; id: string } | { kind: "ship"; id: PlayerId };

export interface EffectShot {
  from: FxTarget;
  /** Contrôleur de l'effet : son Navire sert de départ si la carte lanceuse n'est pas à l'écran. */
  originPlayerId: PlayerId;
  to: FxTarget;
  amount: number;
  /** Boulet du canon de Navire, ou projectile d'effet. */
  look: "magic" | "cannon";
}

export interface EffectHeal {
  to: FxTarget;
  amount: number;
}

export interface EffectBuff {
  targetInstanceId: string;
  attack: number;
  health: number;
  keywords: string[];
  /** `DEBUFF_APPLIED` : la pastille est une perte. */
  loss: boolean;
}

export interface EffectVolley {
  id: number;
  /** Attente avant le départ (lanceur tout juste posé). */
  delayMs: number;
  shots: EffectShot[];
  heals: EffectHeal[];
  buffs: EffectBuff[];
}

type Located = { ownerId: PlayerId; index: number; instance: CardInstance };

function boardIndex(state: GameState): Map<string, Located> {
  const map = new Map<string, Located>();
  for (const player of state.players) {
    player.board.forEach((instance, index) => map.set(instance.instanceId, { ownerId: player.id, index, instance }));
  }
  return map;
}

/**
 * Effets à mettre en scène dans un lot d'événements, ou `null` s'il n'y a
 * rien à montrer. Ne lit que des faits résolus par le moteur.
 */
export function deriveEffectVolley(events: GameEvent[], before: GameState, after: GameState, id: number): EffectVolley | null {
  const onBoardBefore = boardIndex(before);
  const onBoardAfter = boardIndex(after);
  const cannon = events.some((event) => event.type === "SHIP_ABILITY_FIRED");
  let arrived = false;

  const shots: EffectShot[] = [];
  const heals: EffectHeal[] = [];
  const buffs: EffectBuff[] = [];

  for (const event of events) {
    if (event.type === "DAMAGE" && event.origin && !event.combat && event.amount > 0) {
      const to: FxTarget | null = event.targetInstanceId
        ? { kind: "unit", id: event.targetInstanceId }
        : event.targetPlayerId
          ? { kind: "ship", id: event.targetPlayerId }
          : null;
      if (!to) continue;
      const source = event.origin.instanceId;
      // Le lanceur est une carte EN JEU (ou qui l'était juste avant, comme
      // un Objet brisé) : le projectile part d'elle. Sinon — sort joué de
      // la main, capacité de Navire — il part du Navire.
      const fromCard = source !== undefined && (onBoardBefore.has(source) || onBoardAfter.has(source));
      if (fromCard && !onBoardBefore.has(source!)) arrived = true;
      shots.push({
        from: fromCard ? { kind: "unit", id: source! } : { kind: "ship", id: event.origin.playerId },
        originPlayerId: event.origin.playerId,
        to,
        amount: event.amount,
        look: cannon && !fromCard ? "cannon" : "magic",
      });
    } else if (event.type === "HEAL" && event.amount > 0) {
      const to: FxTarget | null = event.targetInstanceId
        ? { kind: "unit", id: event.targetInstanceId }
        : event.targetPlayerId
          ? { kind: "ship", id: event.targetPlayerId }
          : null;
      if (to) heals.push({ to, amount: event.amount });
    } else if (event.type === "BUFF_APPLIED" || event.type === "DEBUFF_APPLIED") {
      const keywords = event.type === "BUFF_APPLIED" ? (event.keywords ?? []) : [];
      if (event.attack === 0 && event.health === 0 && keywords.length === 0) continue;
      // Une cible qui n'est plus en jeu (morte du même lot) n'a plus d'endroit où ranger sa pastille.
      if (!onBoardAfter.has(event.targetInstanceId)) continue;
      if (!onBoardBefore.has(event.targetInstanceId)) arrived = true;
      buffs.push({
        targetInstanceId: event.targetInstanceId,
        attack: event.attack,
        health: event.health,
        keywords,
        loss: event.type === "DEBUFF_APPLIED",
      });
    }
  }

  if (shots.length === 0 && heals.length === 0 && buffs.length === 0) return null;
  return { id, delayMs: arrived ? ARRIVAL_DELAY_MS : 0, shots, heals, buffs };
}

/** Instant, depuis le début du lot, où tous les effets ont « touché » : l'état réel peut s'afficher. */
export function volleyLandingMs(volley: EffectVolley): number {
  const landings = [
    volley.shots.length > 0 ? SHOT_FLIGHT_MS : 0,
    volley.heals.length > 0 ? HEAL_APPLY_MS : 0,
    volley.buffs.length > 0 ? BUFF_LAND_MS : 0,
  ];
  return volley.delayMs + Math.max(...landings);
}

/**
 * État AFFICHÉ pendant la volée : l'état réel, où chaque carte visée (et un
 * lanceur parti du plateau) reprend la version, la place et le plateau
 * qu'elle avait AVANT le lot, et chaque Navire visé son Ancrage d'avant.
 * Le journal reste celui d'avant : sons et fil d'événements tombent avec
 * l'impact, quand l'état réel s'affiche.
 *
 * Affichage seulement — rien ne doit décider sur cet état.
 */
export function patchedDisplay(before: GameState, after: GameState, volley: EffectVolley): GameState {
  const onBoardBefore = boardIndex(before);
  const restore = new Set<string>();
  const ships = new Set<PlayerId>();
  const note = (target: FxTarget) => {
    if (target.kind === "ship") ships.add(target.id);
    else if (onBoardBefore.has(target.id)) restore.add(target.id);
  };
  for (const shot of volley.shots) {
    note(shot.to);
    if (shot.from.kind === "unit") note(shot.from);
  }
  for (const heal of volley.heals) note(heal.to);
  for (const buff of volley.buffs) note({ kind: "unit", id: buff.targetInstanceId });

  // Le lanceur resté en jeu n'a pas à revenir en arrière : seul celui qui a
  // quitté le plateau (Objet brisé, carte sabordée) est rappelé.
  const onBoardAfter = boardIndex(after);
  for (const shot of volley.shots) {
    if (shot.from.kind === "unit" && onBoardAfter.has(shot.from.id) && !volley.shots.some((s) => s.to.kind === "unit" && s.to.id === shot.from.id)) {
      restore.delete(shot.from.id);
    }
  }

  const players = after.players.map((player) => {
    const strip = (cards: CardInstance[]) => cards.filter((card) => !restore.has(card.instanceId));
    let board = strip(player.board);
    // Réinsertion à la place d'avant, dans l'ordre des places.
    const back = [...restore]
      .map((id) => onBoardBefore.get(id)!)
      .filter((located) => located.ownerId === player.id)
      .sort((a, b) => a.index - b.index);
    for (const located of back) {
      board = [...board.slice(0, located.index), located.instance, ...board.slice(located.index)];
    }
    const previous = before.players.find((p) => p.id === player.id);
    return {
      ...player,
      board,
      hand: strip(player.hand),
      deck: strip(player.deck),
      graveyard: strip(player.graveyard),
      anchor: ships.has(player.id) && previous ? previous.anchor : player.anchor,
    };
  }) as GameState["players"];

  return { ...after, players, eventLog: before.eventLog };
}
