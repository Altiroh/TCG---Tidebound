import { hiddenZoneCards, type CardInstance, type GameEvent, type GameState, type PlayerState } from "@/game";
import { HIDDEN_CARD_ID } from "@/game/cards/hiddenCard";

/**
 * Transport des vues d'une partie du serveur vers le navigateur : les vues
 * successives d'un coup (le coup du joueur, puis chaque action du bot), ou
 * la vue unique d'une relecture.
 *
 * Trois redondances y pesaient plus lourd que la partie elle-même (mesuré
 * sur une partie simulée : ~21 Ko par vue, jusqu'à 274 Ko par réponse) :
 *
 *   1. le JOURNAL d'événements complet, répété dans chaque vue. Or le moteur
 *      ne fait qu'y AJOUTER (`game/engine.ts`) : le journal d'une étape
 *      intermédiaire est un préfixe de celui de la dernière. Seule la vue
 *      finale le transporte ; chaque étape ne dit que sa longueur ;
 *   2. les DECKS masqués — une carte factice par carte restante, soit près
 *      de la moitié d'une vue — que `toPlayerView` fabrique de façon
 *      déterministe à partir de leur seule longueur (`hiddenZoneCards`). Le
 *      client les regénère à l'identique ;
 *   3. le journal que le navigateur a DÉJÀ reçu (14/10/2026) : environ 80 %
 *      de chaque réponse. Le client annonce ce qu'il possède (`KnownLog` :
 *      longueur et empreinte), et la vue finale ne transporte plus que la
 *      SUITE. Le préfixe n'est omis que si son empreinte, recalculée ici sur
 *      la projection ACTUELLE, est celle du client : `toPlayerView` re-projette
 *      d'anciens événements (une Structure masquée posée plus tôt, révélée
 *      depuis, est désormais nommée dans son `PLAY_CARD`). Dans ce cas
 *      l'empreinte diffère, et le journal complet repart.
 *
 * Aucune information supplémentaire ne sort : tout ce qui est reconstruit
 * vient de la vue finale, projetée pour le même destinataire, ou de ce que
 * le client avait déjà reçu À L'IDENTIQUE. Seul effet visible : pendant le
 * rejeu, un événement ancien apparaît projeté comme à la FIN du coup (ex.
 * une Structure devenue visible entre-temps est nommée un peu plus tôt).
 */
export interface PackedView {
  view: GameState;
  /** Longueur du journal de cette vue, repris de la vue finale. `null` : journal transporté tel quel. */
  eventCount: number | null;
  /** Longueur du deck masqué de chaque joueur, regénéré côté client. `null` : deck transporté tel quel. */
  deckCounts: [number | null, number | null];
}

export interface PackedFrames {
  /** Vues dans l'ordre ; la dernière porte le journal complet, ou sa suite (`logBase`). */
  views: PackedView[];
  /**
   * Journal en DELTA : la vue finale ne porte que les événements à partir de
   * cet index ; les `logBase` premiers sont ceux que le client a annoncés
   * (`KnownLog`). Absent : journal complet.
   */
  logBase?: number;
}

/** Ce que le client possède déjà du journal : sa longueur et son empreinte (`hashEventLog`). */
export interface KnownLog {
  length: number;
  hash: string;
}

/** Garde-fou de forme sur un `KnownLog` reçu du navigateur. `undefined` : ignoré, journal complet. */
export function parseKnownLog(value: unknown): KnownLog | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { length, hash } = value as Record<string, unknown>;
  if (typeof length !== "number" || !Number.isInteger(length) || length < 0 || length > 1_000_000) return undefined;
  if (typeof hash !== "string" || !/^[0-9a-f]{16}$/.test(hash)) return undefined;
  return { length, hash };
}

/** Empreinte d'un journal vide : point de départ du chaînage. */
const EMPTY_LOG_HASH = "811c9dc5050c5d1f";

/**
 * EMPREINTE d'un journal projeté, CHAÎNÉE : `extendLogHash(hashEventLog(a), b)`
 * vaut `hashEventLog([...a, ...b])`, si bien que le client la tient à jour
 * en ne hachant que la suite reçue. Deux voies FNV-1a 32 bits (64 bits en
 * tout) sur la forme JSON de chaque événement — celle que la réponse d'une
 * Server Action conserve. Une collision ne ferait que montrer au client un
 * ancien événement tel qu'il l'avait déjà reçu, jamais rien de plus.
 */
export function extendLogHash(hash: string, events: readonly GameEvent[]): string {
  let a = parseInt(hash.slice(0, 8), 16) >>> 0;
  let b = parseInt(hash.slice(8, 16), 16) >>> 0;
  for (const event of events) {
    const text = JSON.stringify(event);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      a = Math.imul(a ^ code, 0x01000193) >>> 0;
      b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
      b ^= b >>> 15;
    }
    // Séparateur : `[ab, c]` et `[a, bc]` ne se confondent pas.
    a = Math.imul(a ^ 0x1e, 0x01000193) >>> 0;
    b = Math.imul(b ^ 0x1e, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** Empreinte des `length` premiers événements (tout le journal par défaut). */
export function hashEventLog(log: readonly GameEvent[], length = log.length): string {
  return extendLogHash(EMPTY_LOG_HASH, length === log.length ? log : log.slice(0, length));
}

/** Le deck est-il exactement celui que `hiddenZoneCards` fabriquerait ? Sinon, on le transporte tel quel. */
function isRegeneratedDeck(deck: readonly CardInstance[], ownerId: string): boolean {
  const expected = hiddenZoneCards(deck.length, ownerId, "deck");
  return deck.every((card, index) => {
    const model = expected[index]!;
    const keys = Object.keys(card);
    return (
      card.cardId === HIDDEN_CARD_ID &&
      card.instanceId === model.instanceId &&
      keys.length === Object.keys(model).length &&
      keys.every((key) => JSON.stringify(card[key as keyof CardInstance]) === JSON.stringify(model[key as keyof CardInstance]))
    );
  });
}

function packView(view: GameState, log: GameEvent[] | null): PackedView {
  const deckCounts = view.players.map((player) => (isRegeneratedDeck(player.deck, player.id) ? player.deck.length : null)) as [
    number | null,
    number | null,
  ];
  return {
    view: {
      ...view,
      eventLog: log ?? [],
      players: view.players.map((player, index) => (deckCounts[index] === null ? player : { ...player, deck: [] })) as [
        PlayerState,
        PlayerState,
      ],
    },
    eventCount: log ? null : view.eventLog.length,
    deckCounts,
  };
}

/**
 * Côté serveur : `views` déjà projetées pour leur destinataire (`toPlayerView`), dans l'ordre. Au moins une.
 * `known` : ce que le client annonce posséder du journal ; seul un préfixe d'empreinte IDENTIQUE est omis.
 */
export function packFrames(views: readonly GameState[], known?: KnownLog): PackedFrames {
  if (views.length === 0) throw new Error("packFrames : aucune vue à transmettre.");
  const finalLog = views[views.length - 1]!.eventLog;
  const logBase =
    known && known.length > 0 && known.length <= finalLog.length && hashEventLog(finalLog, known.length) === known.hash ? known.length : null;
  const packed: PackedFrames = {
    views: views.map((view, index) =>
      packView(view, index === views.length - 1 ? (logBase === null ? view.eventLog : view.eventLog.slice(logBase)) : null)
    ),
  };
  if (logBase !== null) packed.logBase = logBase;
  return packed;
}

/**
 * Côté client : les vues complètes, dans l'ordre. `knownLog` : le journal que
 * le client avait annoncé pour CETTE requête (le même tableau, capturé à
 * l'envoi), indispensable quand la réponse est en delta.
 */
export function unpackFrames(packed: PackedFrames, knownLog?: readonly GameEvent[]): GameState[] {
  const sent = packed.views[packed.views.length - 1]!.view.eventLog;
  let finalLog = sent;
  if (packed.logBase !== undefined && packed.logBase !== null) {
    if (!knownLog || knownLog.length < packed.logBase) throw new Error("unpackFrames : journal connu manquant pour une réponse en delta.");
    finalLog = [...knownLog.slice(0, packed.logBase), ...sent];
  }
  return packed.views.map(({ view, eventCount, deckCounts }) => ({
    ...view,
    eventLog: eventCount === null ? finalLog : finalLog.slice(0, eventCount),
    players: view.players.map((player, index) => {
      const count = deckCounts[index];
      return count === null || count === undefined ? player : { ...player, deck: hiddenZoneCards(count, player.id, "deck") };
    }) as [PlayerState, PlayerState],
  }));
}

/**
 * Côté client : le `KnownLog` à annoncer après avoir reçu `packed` (dépaqueté
 * en `views`) sur la base de `known`. La suite seule est hachée quand la
 * réponse était en delta ; sinon tout le journal.
 */
export function nextKnownLog(
  packed: PackedFrames,
  views: readonly GameState[],
  known: { log: readonly GameEvent[]; hash: string }
): { log: GameEvent[]; hash: string } {
  const log = views[views.length - 1]!.eventLog;
  const base = packed.logBase;
  if (base !== undefined && base !== null && base === known.log.length) return { log, hash: extendLogHash(known.hash, log.slice(base)) };
  return { log, hash: hashEventLog(log) };
}
