import { getCardDefinition, type CardInstance, type GameEvent, type GameState, type PlayerId } from "@/game";

/**
 * Mise en scène des EFFETS (hors coup d'attaque) — la partie pure, testable
 * sans DOM : quoi animer, d'où, vers où, et quel état afficher en attendant.
 *
 *   - la carte qui déclenche sa capacité se RÉVEILLE : elle se soulève,
 *     pulse d'une lueur, puis retombe (`awakens`) ;
 *   - un SORT (dégâts d'effet, soin, renfort, malus) : une orbe se forme
 *     devant le LANCEUR (`origin` de l'événement) — la carte si elle est sur
 *     un plateau, sinon le Navire de son contrôleur —, puis file vers chaque
 *     cible, toutes en même temps, en comète de sa famille (attaque, soin,
 *     malus) ; le tir du canon de Navire garde son boulet, sans orbe ;
 *   - soin : à l'arrivée du sort, un voile se pose sur la carte ou le Navire soigné ;
 *   - gain / perte de caractéristiques ou de mot-clé : à l'arrivée du sort,
 *     une pastille surgit au-dessus de la carte, puis file se ranger là où
 *     la valeur s'affiche ;
 *   - Raison payée ou gagnée : le chiffre flotte au-dessus de la jauge du
 *     Navire, puis s'abat dessus. Une carte payée MOINS que son coût imprimé
 *     (Assemblage) montre le coût imprimé qui se décompte jusqu'au prix payé.
 *
 * Pendant ce temps, l'affichage montre un état RAPIÉCÉ (`patchedDisplay`) :
 * l'état réel, sauf les cibles (et un lanceur qui vient de quitter le
 * plateau), rendues telles qu'elles étaient avant le lot. Les chiffres ne
 * bougent donc qu'à l'arrivée du projectile, et une carte tuée par l'effet
 * encaisse le coup avant de se briser.
 */

/** Temps de vol d'un projectile, du lanceur (ou de son orbe) à la cible. */
export const SHOT_FLIGHT_MS = 400;
/** Réveil d'une carte qui déclenche sa capacité : elle se soulève pendant `AWAKE_LIFT_MS`, pulse, puis retombe. */
export const AWAKE_LIFT_MS = 180;
/** Le réveil tient la carte levée jusqu'au départ des comètes (`AWAKE_LIFT_MS + ORB_CHARGE_MS`), puis elle retombe. */
export const AWAKE_MS = 800;
/** L'orbe se forme devant le lanceur et grossit avant de partir vers ses cibles. */
export const ORB_CHARGE_MS = 420;
/** Effet activé par un permanent : il s'illumine, et l'effet touche sa cible au plus fort de la lueur. */
export const GLOW_LAND_MS = AWAKE_LIFT_MS + 240;
/** Bris d'un Objet : la carte quitte sa place et vient se tenir au-dessus de son Cimetière. */
export const BREAK_LEAD_MS = 420;
/** …puis, au départ des comètes, elle éclate et ses éclats tombent dans le Cimetière. */
export const BREAK_SHATTER_MS = 560;
/** Garde : la carte qui la porte se lève, son badge scintille, puis elle se repose (`showGuard`) — quand une attaque vise à côté d'elle. */
export const GUARD_SHOW_MS = 1100;
/** Instant où le voile de soin recouvre la cible : la Résistance remonte dessous. */
export const HEAL_APPLY_MS = 420;
/** Durée totale du voile. */
export const HEAL_TOTAL_MS = 1150;
/** Pastille de gain : surgit, se montre, puis rejoint sa place — la valeur change à l'arrivée. */
export const BUFF_LAND_MS = 720;
/** Une carte touchée par un effet (détruite, renvoyée, un état) : le temps de voir le coup avant qu'elle ne parte. */
export const TOUCH_LAND_MS = 260;
/** Carte qui vient d'être posée : on la laisse atterrir avant qu'elle ne tire (`useTableMotion`, glissé de pose). */
export const ARRIVAL_DELAY_MS = 460;
/** Décompte du coût imprimé jusqu'au prix payé (Assemblage : 8 → 2). */
export const REASON_COUNT_MS = 700;
/** Le chiffre s'abat sur la jauge de Raison : la valeur change à l'impact. */
export const REASON_FALL_MS = 420;

export type FxTarget = { kind: "unit"; id: string } | { kind: "ship"; id: PlayerId };

export interface EffectShot {
  from: FxTarget;
  /** Contrôleur de l'effet : son Navire sert de départ si la carte lanceuse n'est pas à l'écran. */
  originPlayerId: PlayerId;
  to: FxTarget;
  amount: number;
  /**
   * Boulet du canon de Navire, projectile d'effet — ou dégât
   * d'environnement (`DamageEvent.fx`) : `"tide"`, une orbe pourpre se
   * forme sur la piste de Marée et ses comètes frappent ; `"sickness"`, des
   * bulles vertes éclatent sur l'unité MALADE (`from` vaut alors `to`) ;
   * `"drain"`, un sort de MALUS (comète pourpre) qui ne fait pas de dégât —
   * Ponction, qui fait perdre de la Raison à un Navire.
   */
  look: "magic" | "cannon" | "tide" | "sickness" | "glow" | "drain";
}

/**
 * D'où part le sort d'un soin ou d'un renfort, quand le moteur l'a dit
 * (`origin`) : sans lanceur connu, l'effet se pose directement sur sa cible.
 */
export interface SpellSource {
  from: FxTarget;
  originPlayerId: PlayerId;
  /**
   * EFFET ACTIVÉ, pas SORT LANCÉ (retour de partie du 12/10/2026) : la
   * source est un permanent EN JEU qui active son effet (capacité
   * déclenchée ou activable, effet d'arrivée, Éveil). Il s'illumine, et
   * l'effet se pose directement sur sa cible — sans orbe ni projectile.
   * Absent : un sort LANCÉ (joué de la main, Objet brisé, capacité de
   * Navire), qui part en projectile.
   */
  glow?: true;
}

export interface EffectHeal {
  to: FxTarget;
  amount: number;
  source?: SpellSource;
}

export interface EffectBuff {
  targetInstanceId: string;
  attack: number;
  health: number;
  keywords: string[];
  /** `DEBUFF_APPLIED` : la pastille est une perte. */
  loss: boolean;
  source?: SpellSource;
}

/** Raison payée (négatif) ou gagnée grâce à une carte (positif), sur le Navire de `playerId`. */
export interface EffectReason {
  playerId: PlayerId;
  amount: number;
  /** Coût imprimé, quand la carte a été payée moins cher : le chiffre part de là et se décompte. */
  printed?: number;
  /**
   * Attente avant d'apparaître : les chiffres d'un même Navire tombent L'UN
   * APRÈS L'AUTRE (le prix de l'Assemblage, puis la Raison rendue par le
   * Signal Vert), jamais superposés.
   */
  delayMs?: number;
}

/** Durée d'un chiffre de Raison, de son apparition à son impact. */
function reasonDurationMs(entry: Pick<EffectReason, "printed">): number {
  return (entry.printed !== undefined ? REASON_COUNT_MS : 0) + REASON_FALL_MS;
}

/**
 * Un Objet qui se BRISE dans ce lot : il vient au-dessus de son Cimetière,
 * s'illumine de la couleur de son effet (`tone`), et éclate quand son sort
 * part (demande du 12/10/2026). Son sort part de lui, là, pas de sa place.
 */
export interface EffectBreak {
  instanceId: string;
  ownerId: PlayerId;
  /** Brisé depuis la main (Objet réactif) : il n'était pas sur le plateau. */
  fromHand: boolean;
  /** Couleur de l'effet : dégâts (bleu), soin ou renfort (or), malus (pourpre). */
  tone: "attack" | "heal" | "malus";
}

/**
 * Un effet qui TOUCHE une carte sans la blesser ni la renforcer — la détruire,
 * lui poser ou lui retirer un état, la renvoyer du plateau — ou qui donne de
 * l'Armure à un Navire (13/10/2026). Le
 * sort part de son lanceur comme les dégâts (orbe et comète, ou halo d'un
 * effet activé) et éclate sur la cible ; la carte détruite ou renvoyée reste
 * à sa place jusque-là (`patchedDisplay`).
 */
export interface EffectTouch {
  to: FxTarget;
  source: SpellSource;
  kind: "destroy" | "status" | "bounce" | "armor";
  /** Armure gagnée : combien (le chiffre surgit au-dessus du Navire). */
  amount?: number;
  /** Couleur de l'effet : un coup (bleu), un malus (pourpre), un état retiré (or). */
  tone: "attack" | "heal" | "malus";
}

export interface EffectVolley {
  id: number;
  /** Attente avant le départ (lanceur tout juste posé). */
  delayMs: number;
  /** Cartes en jeu qui déclenchent leur capacité dans ce lot : elles se réveillent au départ. */
  awakens: string[];
  /**
   * Temps, après `delayMs`, avant que les sorts ne quittent leur orbe : le
   * réveil du lanceur, puis la charge de l'orbe. `0` sans sort à lancer.
   */
  castMs: number;
  shots: EffectShot[];
  heals: EffectHeal[];
  buffs: EffectBuff[];
  reason: EffectReason[];
  /** Objets brisés : ils se montrent au-dessus du Cimetière avant que leur sort ne parte. Absent = aucun. */
  breaks?: EffectBreak[];
  /** Destructions, états, renvois par effet. Absent = aucun. */
  touches?: EffectTouch[];
  /** Couleur de la lueur des cartes qui activent leur effet (dégâts, soin ou gain, malus). Absent : l'or du réveil. */
  awakenTones?: Record<string, "attack" | "heal" | "malus">;
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
  const reason: EffectReason[] = [];
  const touches: EffectTouch[] = [];
  const awakens = new Set<string>();
  const onBoard = (id: string) => onBoardBefore.has(id) || onBoardAfter.has(id);
  // Les Objets brisés du lot : leur sort part d'EUX (au-dessus du Cimetière), même brisés depuis la main.
  const brokenEvents = events.flatMap((event) => (event.type === "OBJECT_BROKEN" ? [event] : []));
  const broken = new Set(brokenEvents.map((event) => event.instanceId));

  /**
   * D'où part le sort d'un lanceur : la carte EN JEU (ou qui l'était juste
   * avant, comme un Objet brisé), qui se réveille pour le lancer ; sinon —
   * sort joué de la main, capacité de Navire — le Navire de son contrôleur.
   */
  const sourceOf = (origin: { playerId: PlayerId; instanceId?: string }): SpellSource => {
    const id = origin.instanceId;
    if (id !== undefined && broken.has(id)) return { from: { kind: "unit", id }, originPlayerId: origin.playerId };
    if (id !== undefined && onBoard(id)) {
      if (!onBoardBefore.has(id)) arrived = true;
      awakens.add(id);
      // Un permanent en jeu ACTIVE son effet : il s'illumine, pas de projectile.
      return { from: { kind: "unit", id }, originPlayerId: origin.playerId, glow: true };
    }
    return { from: { kind: "ship", id: origin.playerId }, originPlayerId: origin.playerId };
  };
  /** Dernière carte jouée, en attente de son paiement : le `REASON_CHANGED` qui suit est son prix. */
  let jouee: { playerId: PlayerId; cardId: string } | null = null;

  for (const event of events) {
    if (event.type === "PLAY_CARD") {
      jouee = { playerId: event.playerId, cardId: event.cardId };
      continue;
    }
    if (event.type === "REASON_CHANGED" && event.delta !== 0) {
      const paiement = event.delta < 0 && jouee?.playerId === event.playerId ? jouee : null;
      jouee = null;
      // La régénération de début de tour n'est pas un fait de carte : seuls
      // les coûts et les gains obtenus grâce à une carte se mettent en scène.
      if (event.delta > 0 && event.source !== "card") continue;
      const printed = paiement ? getCardDefinition(paiement.cardId).cost : undefined;
      // Après le dernier chiffre du même Navire : ils se suivent.
      const precedent = [...reason].reverse().find((r) => r.playerId === event.playerId);
      const delayMs = precedent ? (precedent.delayMs ?? 0) + reasonDurationMs(precedent) : 0;
      reason.push({
        playerId: event.playerId,
        amount: event.delta,
        ...(printed !== undefined && printed > -event.delta ? { printed } : {}),
        ...(delayMs > 0 ? { delayMs } : {}),
      });
      continue;
    }
    // Une capacité déclenchée, un Éveil, un effet d'arrivée rejoué : la carte se réveille, même sans sort à lancer.
    if ((event.type === "ABILITY_RESOLVED" || event.type === "EVEIL" || event.type === "ENTER_EFFECTS_REPEATED") && onBoard(event.instanceId)) {
      awakens.add(event.instanceId);
      continue;
    }
    // Destruction, état, renvoi par un effet : le sort touche la carte, qui ne part qu'à l'impact.
    if (event.type === "DESTROY" && event.origin && onBoardBefore.has(event.instanceId)) {
      touches.push({ to: { kind: "unit", id: event.instanceId }, source: sourceOf(event.origin), kind: "destroy", tone: "attack" });
      continue;
    }
    if (event.type === "CARD_MOVED" && event.origin && event.fromZone === "board" && onBoardBefore.has(event.instanceId)) {
      touches.push({ to: { kind: "unit", id: event.instanceId }, source: sourceOf(event.origin), kind: "bounce", tone: "malus" });
      continue;
    }
    if (event.type === "STATUS_CHANGED" && event.origin && onBoard(event.targetInstanceId)) {
      if (!onBoardBefore.has(event.targetInstanceId)) arrived = true;
      touches.push({ to: { kind: "unit", id: event.targetInstanceId }, source: sourceOf(event.origin), kind: "status", tone: event.applied ? "malus" : "heal" });
      continue;
    }
    if (event.type === "ARMOR_CHANGED" && event.origin && event.delta > 0) {
      touches.push({ to: { kind: "ship", id: event.playerId }, source: sourceOf(event.origin), kind: "armor", tone: "heal", amount: event.delta });
      continue;
    }
    // La Marée qui frappe, la maladie qui ronge : pas de lanceur, la mer elle-même.
    if (event.type === "DAMAGE" && event.fx && !event.origin && !event.combat && event.amount > 0) {
      const to: FxTarget | null = event.targetInstanceId
        ? { kind: "unit", id: event.targetInstanceId }
        : event.targetPlayerId
          ? { kind: "ship", id: event.targetPlayerId }
          : null;
      if (!to) continue;
      const owner = to.kind === "ship" ? to.id : (onBoardBefore.get(to.id)?.ownerId ?? onBoardAfter.get(to.id)?.ownerId ?? before.activePlayerId);
      shots.push({ from: to, originPlayerId: owner, to, amount: event.amount, look: event.fx });
      continue;
    }
    if (event.type === "DAMAGE" && event.origin && !event.combat && event.amount > 0) {
      const to: FxTarget | null = event.targetInstanceId
        ? { kind: "unit", id: event.targetInstanceId }
        : event.targetPlayerId
          ? { kind: "ship", id: event.targetPlayerId }
          : null;
      if (!to) continue;
      const source = sourceOf(event.origin);
      shots.push({
        from: source.from,
        originPlayerId: source.originPlayerId,
        to,
        amount: event.amount,
        look: source.glow ? "glow" : cannon && source.from.kind === "ship" ? "cannon" : "magic",
      });
    } else if (event.type === "HEAL" && event.amount > 0) {
      const to: FxTarget | null = event.targetInstanceId
        ? { kind: "unit", id: event.targetInstanceId }
        : event.targetPlayerId
          ? { kind: "ship", id: event.targetPlayerId }
          : null;
      if (to) heals.push({ to, amount: event.amount, ...(event.origin ? { source: sourceOf(event.origin) } : {}) });
    } else if (event.type === "BUFF_APPLIED" || event.type === "DEBUFF_APPLIED") {
      const keywords = event.type === "BUFF_APPLIED" ? (event.keywords ?? []) : [];
      const loss = event.type === "DEBUFF_APPLIED";
      const to: FxTarget = { kind: "unit", id: event.targetInstanceId };
      // Sans chiffre à montrer (un mot-clé perdu, une qualification, un texte
      // ignoré), ou une cible que le malus tue : l'effet la TOUCHE quand même,
      // sans quoi rien ne se verrait (audit du 13/10/2026).
      const silent = event.attack === 0 && event.health === 0 && keywords.length === 0;
      const killed = !onBoardAfter.has(event.targetInstanceId) && onBoardBefore.has(event.targetInstanceId);
      if (silent || killed) {
        if (event.origin && (onBoardBefore.has(event.targetInstanceId) || onBoardAfter.has(event.targetInstanceId))) {
          if (!onBoardBefore.has(event.targetInstanceId)) arrived = true;
          touches.push({ to, source: sourceOf(event.origin), kind: killed ? "destroy" : "status", tone: loss ? "malus" : "heal" });
        }
        continue;
      }
      // Une cible qui n'est plus en jeu (partie du même lot) n'a plus d'endroit où ranger sa pastille.
      if (!onBoardAfter.has(event.targetInstanceId)) continue;
      if (!onBoardBefore.has(event.targetInstanceId)) arrived = true;
      buffs.push({
        targetInstanceId: event.targetInstanceId,
        attack: event.attack,
        health: event.health,
        keywords,
        loss,
        ...(event.origin ? { source: sourceOf(event.origin) } : {}),
      });
    }
  }

  // Un Objet brisé ne se réveille pas à sa place : il se montre au-dessus de son Cimetière.
  for (const id of broken) awakens.delete(id);
  // La lueur d'une carte qui active son effet prend la couleur de cet effet.
  const awakenTones: Record<string, "attack" | "heal" | "malus"> = {};
  const fromUnit = (source: SpellSource | undefined, id: string) => source?.from.kind === "unit" && source.from.id === id;
  for (const id of awakens) {
    const touch = touches.find((t) => fromUnit(t.source, id));
    if (shots.some((shot) => fromUnit(shot, id))) awakenTones[id] = "attack";
    else if (touch) awakenTones[id] = touch.tone;
    else if (buffs.some((buff) => buff.loss && fromUnit(buff.source, id))) awakenTones[id] = "malus";
    else if (heals.some((heal) => fromUnit(heal.source, id)) || buffs.some((buff) => fromUnit(buff.source, id))) awakenTones[id] = "heal";
  }
  const breaks: EffectBreak[] = brokenEvents.map((event) => {
    const fromThis = (source: SpellSource | undefined) => source?.from.kind === "unit" && source.from.id === event.instanceId;
    const touched = touches.find((touch) => fromThis(touch.source));
    const tone: EffectBreak["tone"] = shots.some((shot) => fromThis(shot))
      ? "attack"
      : touched
        ? touched.tone
        : buffs.some((buff) => buff.loss && fromThis(buff.source))
          ? "malus"
          : "heal";
    return { instanceId: event.instanceId, ownerId: event.playerId, fromHand: event.fromHand, tone };
  });

  if (shots.length === 0 && heals.length === 0 && buffs.length === 0 && reason.length === 0 && awakens.size === 0 && breaks.length === 0 && touches.length === 0) return null;
  // Seuls les sorts LANCÉS chargent une orbe ; un effet activé s'illumine sur sa carte.
  const casts =
    shots.some((shot) => shot.look === "magic" || shot.look === "tide" || shot.look === "drain") ||
    heals.some((heal) => heal.source && !heal.source.glow) ||
    buffs.some((buff) => buff.source && !buff.source.glow) ||
    touches.some((touch) => !touch.source.glow);
  // Avant la charge de l'orbe : le réveil du lanceur, ou l'Objet brisé qui gagne son Cimetière.
  const lead = Math.max(awakens.size > 0 ? AWAKE_LIFT_MS : 0, breaks.length > 0 ? BREAK_LEAD_MS : 0);
  const castMs = casts ? lead + ORB_CHARGE_MS : 0;
  return {
    id,
    delayMs: arrived ? ARRIVAL_DELAY_MS : 0,
    awakens: [...awakens],
    castMs,
    shots,
    heals,
    buffs,
    reason,
    ...(breaks.length > 0 ? { breaks } : {}),
    ...(touches.length > 0 ? { touches } : {}),
    ...(Object.keys(awakenTones).length > 0 ? { awakenTones } : {}),
  };
}

/**
 * Instant, après `delayMs`, où un effet ARRIVE sur sa cible : un sort lancé
 * d'une orbe après la charge et le vol, le boulet du canon après son vol, un
 * effet sans lanceur aussitôt.
 */
export function shotArrivalMs(volley: Pick<EffectVolley, "castMs">, shot: Pick<EffectShot, "look">): number {
  // Un effet activé touche au plus fort de la lueur de sa carte.
  if (shot.look === "glow") return GLOW_LAND_MS;
  // Le boulet part tout de suite ; un sort ou l'orbe de la Marée après sa charge ; les bulles éclatent avec eux.
  return (shot.look === "cannon" ? 0 : volley.castMs) + SHOT_FLIGHT_MS;
}

export function spellArrivalMs(volley: Pick<EffectVolley, "castMs">, source: SpellSource | undefined): number {
  if (source?.glow) return GLOW_LAND_MS;
  return source ? volley.castMs + SHOT_FLIGHT_MS : 0;
}

/** Instant, depuis le début du lot, où tous les effets ont « touché » : l'état réel peut s'afficher. */
export function volleyLandingMs(volley: EffectVolley): number {
  const landings = [
    ...volley.shots.map((shot) => shotArrivalMs(volley, shot)),
    ...volley.heals.map((heal) => spellArrivalMs(volley, heal.source) + HEAL_APPLY_MS),
    ...volley.buffs.map((buff) => spellArrivalMs(volley, buff.source) + BUFF_LAND_MS),
    // La carte touchée encaisse (halo, éclair) avant de partir ou de prendre son état.
    ...(volley.touches ?? []).map((touch) => spellArrivalMs(volley, touch.source) + (touch.kind === "armor" ? BUFF_LAND_MS : TOUCH_LAND_MS)),
  ];
  // Un Objet brisé éclate au départ de son sort (ou, sans sort, une fois arrivé au-dessus du Cimetière).
  if (volley.breaks && volley.breaks.length > 0) landings.push(breakShatterAtMs(volley) + BREAK_SHATTER_MS);
  // Un réveil seul ne retient rien : la carte se soulève sur l'état réel.
  const effects = landings.length > 0 ? volley.delayMs + Math.max(...landings) : 0;
  // Le prix se paie à la pose, pas après l'atterrissage : il ne subit pas le délai d'arrivée.
  return Math.max(effects, reasonLandingMs(volley));
}

/** Instant, après `delayMs`, où un Objet brisé éclate : au départ des comètes, ou dès qu'il est au-dessus de son Cimetière. */
export function breakShatterAtMs(volley: Pick<EffectVolley, "castMs">): number {
  return Math.max(volley.castMs, BREAK_LEAD_MS + 260);
}

/** Instant où le dernier chiffre de Raison touche sa jauge (0 : aucun). */
export function reasonLandingMs(volley: Pick<EffectVolley, "reason">): number {
  return Math.max(0, ...volley.reason.map((r) => (r.delayMs ?? 0) + reasonDurationMs(r)));
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
  const targets: FxTarget[] = [
    ...volley.shots.map((shot) => shot.to),
    ...volley.heals.map((heal) => heal.to),
    ...volley.buffs.map((buff): FxTarget => ({ kind: "unit", id: buff.targetInstanceId })),
    ...(volley.touches ?? []).map((touch) => touch.to),
  ];
  const casters: FxTarget[] = [
    ...volley.shots,
    ...volley.heals.map((heal) => heal.source),
    ...volley.buffs.map((buff) => buff.source),
    ...(volley.touches ?? []).map((touch) => touch.source),
  ].flatMap(
    (source) => (source && source.from.kind === "unit" ? [source.from] : [])
  );
  targets.forEach(note);

  // Le lanceur resté en jeu n'a pas à revenir en arrière : seul celui qui a
  // quitté le plateau (Objet brisé, carte sabordée) est rappelé — le temps
  // de lancer son sort.
  const onBoardAfter = boardIndex(after);
  for (const caster of casters) {
    if (!onBoardAfter.has(caster.id)) note(caster);
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
      // L'Armure gagnée ne s'affiche qu'à l'arrivée du sort.
      armor: (volley.touches ?? []).some((t) => t.kind === "armor" && t.to.id === player.id) && previous ? previous.armor : player.armor,
      // La Raison ne bouge qu'à l'impact du chiffre sur sa jauge.
      reason: volley.reason.some((r) => r.playerId === player.id) && previous ? previous.reason : player.reason,
    };
  }) as GameState["players"];

  return { ...after, players, eventLog: before.eventLog };
}
