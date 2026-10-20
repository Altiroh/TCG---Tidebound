import { CARD_DATABASE } from "@/game";

/**
 * Échanges de cartes entre amis — règles PURES, partagées par le serveur
 * (qui les applique) et l'écran (qui les annonce).
 *
 * Décision du 20/10/2026 : on échange des exemplaires CLASSIQUES, entre
 * amis seulement, et chaque côté donne quelque chose (un échange, pas un
 * don — un don à sens unique viderait un compte au profit d'un autre).
 * La base revérifie tout à l'acceptation (`accept_card_trade`).
 */

/** Cartes différentes par côté (la base borne aussi : `card_trades_offered_array`). */
export const TRADE_MAX_LINES = 5;
/** Exemplaires d'une même carte par ligne. */
export const TRADE_MAX_COPIES = 3;
/** Une offre sans réponse au bout de 72 h n'est plus acceptable (même délai en base). */
export const TRADE_TTL_MS = 72 * 60 * 60 * 1000;
/** Offres en attente qu'un joueur peut avoir lancées en même temps. */
export const MAX_PENDING_TRADES = 5;
/** Échanges conclus par joueur et par 24 h — fixé en base (`accept_card_trade`), rappelé à l'écran. */
export const TRADE_DAILY_CAP = 5;

export interface TradeLine {
  cardId: string;
  quantity: number;
}

/**
 * Lignes reçues du navigateur, nettoyées : une ligne par carte (les
 * doublons s'additionnent), cartes du catalogue seulement, quantités
 * entières positives. `null` si la forme est illisible.
 */
export function normalizeTradeLines(raw: unknown): TradeLine[] | null {
  if (!Array.isArray(raw) || raw.length > 50) return null;
  const merged = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { cardId, quantity } = entry as { cardId?: unknown; quantity?: unknown };
    if (typeof cardId !== "string" || !CARD_DATABASE.has(cardId)) return null;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return null;
    merged.set(cardId, (merged.get(cardId) ?? 0) + quantity);
  }
  return [...merged].map(([cardId, quantity]) => ({ cardId, quantity }));
}

/** Ce qui empêche une proposition, ou `null` si elle tient. */
export function tradeProposalError(offered: TradeLine[], requested: TradeLine[]): string | null {
  if (offered.length === 0) return "Choisis au moins une carte à donner.";
  if (requested.length === 0) return "Choisis au moins une carte à recevoir.";
  if (offered.length > TRADE_MAX_LINES || requested.length > TRADE_MAX_LINES) {
    return `${TRADE_MAX_LINES} cartes différentes au plus de chaque côté.`;
  }
  if ([...offered, ...requested].some((line) => line.quantity > TRADE_MAX_COPIES)) {
    return `${TRADE_MAX_COPIES} exemplaires au plus d'une même carte.`;
  }
  const given = new Set(offered.map((line) => line.cardId));
  if (requested.some((line) => given.has(line.cardId))) return "Une même carte ne peut pas être donnée et demandée.";
  return null;
}

/** Lignes manquantes chez le donneur (disponibilité Classique par carte), pour un refus explicite. */
export function missingLines(lines: TradeLine[], available: ReadonlyMap<string, number>): TradeLine[] {
  return lines.filter((line) => (available.get(line.cardId) ?? 0) < line.quantity);
}

/** L'offre a-t-elle dépassé son délai ? */
export function tradeExpired(createdAt: string, now = Date.now()): boolean {
  return now - Date.parse(createdAt) > TRADE_TTL_MS;
}

/** Forme en base (`card_trades.offered`). */
export function toStoredLines(lines: TradeLine[]): { card_id: string; quantity: number }[] {
  return lines.map((line) => ({ card_id: line.cardId, quantity: line.quantity }));
}

/** Lecture d'une colonne `offered`/`requested` — une ligne illisible est ignorée. */
export function fromStoredLines(raw: unknown): TradeLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const cardId = entry?.card_id;
    const quantity = entry?.quantity;
    return typeof cardId === "string" && CARD_DATABASE.has(cardId) && typeof quantity === "number" && quantity > 0 ? [{ cardId, quantity }] : [];
  });
}
