import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  fromStoredLines,
  MAX_PENDING_TRADES,
  missingLines,
  toStoredLines,
  tradeExpired,
  tradeProposalError,
  TRADE_TTL_MS,
  type TradeLine,
} from "@/features/friends/tradeRules";

/**
 * Échanges de cartes entre amis — module SERVEUR, sans directive
 * `"use server"` : l'identifiant du joueur est un paramètre, tiré de la
 * session par `features/friends/tradeActions.ts`.
 *
 * La proposition vérifie ce qu'elle peut (amitié, cartes possédées des deux
 * côtés) pour refuser tôt et clairement ; l'acceptation, elle, revérifie
 * TOUT dans une seule transaction (`accept_card_trade`) — entre-temps, l'un
 * ou l'autre a pu revendre, échanger ailleurs, ou rompre l'amitié.
 */

export type TradeResult = { ok: true; message?: string } | { ok: false; error: string };

export interface TradeView {
  id: string;
  /** L'autre joueur : l'auteur pour une offre reçue, le destinataire pour une offre envoyée. */
  otherUserId: string;
  otherName: string;
  /** Ce que l'AUTEUR donne. */
  offered: TradeLine[];
  /** Ce que l'AUTEUR demande. */
  requested: TradeLine[];
  createdAt: string;
  expiresAt: string;
}

export interface TradesView {
  incoming: TradeView[];
  outgoing: TradeView[];
}

/** Une carte échangeable : exemplaires Classiques disponibles. */
export interface TradeableCard {
  cardId: string;
  available: number;
}

function service() {
  return createSupabaseServiceRoleClient();
}

function pairOf(a: string, b: string): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

async function areFriends(a: string, b: string): Promise<boolean> {
  const { data } = await service().from("friendships").select("status").match(pairOf(a, b)).maybeSingle();
  return data?.status === "accepted";
}

/**
 * Exemplaires CLASSIQUES disponibles par carte : le compte de la carte moins
 * ses éditions rares, qui ne s'échangent pas (même règle que la revente).
 */
export async function classicAvailability(userId: string): Promise<Map<string, number>> {
  const db = service();
  const [{ data: cards, error }, { data: editions, error: editionsError }] = await Promise.all([
    db.from("player_cards").select("card_id, quantity").eq("user_id", userId).gt("quantity", 0),
    db.from("player_card_editions").select("card_id, quantity").eq("user_id", userId).gt("quantity", 0),
  ]);
  if (error) throw new Error(error.message);
  // Éditions illisibles : prudence, rien n'est échangeable plutôt qu'un exemplaire rare cédé comme Classique.
  if (editionsError) throw new Error(editionsError.message);
  const rares = new Map<string, number>();
  for (const row of editions ?? []) rares.set(row.card_id, (rares.get(row.card_id) ?? 0) + row.quantity);
  const result = new Map<string, number>();
  for (const row of cards ?? []) {
    const available = row.quantity - (rares.get(row.card_id) ?? 0);
    if (available > 0) result.set(row.card_id, available);
  }
  return result;
}

/** Cartes échangeables de `ownerId`, lisibles par lui-même ou un AMI. `null` sinon. */
export async function readTradeableCards(viewerId: string, ownerId: string): Promise<TradeableCard[] | null> {
  if (viewerId !== ownerId && !(await areFriends(viewerId, ownerId))) return null;
  const available = await classicAvailability(ownerId);
  return [...available].map(([cardId, count]) => ({ cardId, available: count }));
}

export async function proposeTrade(userId: string, friendId: string, offered: TradeLine[], requested: TradeLine[]): Promise<TradeResult> {
  const invalid = tradeProposalError(offered, requested);
  if (invalid) return { ok: false, error: invalid };
  if (friendId === userId || !(await areFriends(userId, friendId))) return { ok: false, error: "On n'échange qu'avec ses amis." };

  const since = new Date(Date.now() - TRADE_TTL_MS).toISOString();
  const { data: pending } = await service().from("card_trades").select("id").eq("from_user", userId).eq("status", "pending").gte("created_at", since);
  if ((pending ?? []).length >= MAX_PENDING_TRADES) {
    return { ok: false, error: `Déjà ${MAX_PENDING_TRADES} offres en attente : laisse-leur le temps de répondre.` };
  }

  const [mine, theirs] = await Promise.all([classicAvailability(userId), classicAvailability(friendId)]);
  if (missingLines(offered, mine).length > 0) return { ok: false, error: "Tu ne possèdes pas toutes les cartes proposées (éditions rares exclues)." };
  if (missingLines(requested, theirs).length > 0) return { ok: false, error: "Ton ami ne possède pas toutes les cartes demandées." };

  const { error } = await service()
    .from("card_trades")
    .insert({ from_user: userId, to_user: friendId, offered: toStoredLines(offered), requested: toStoredLines(requested), status: "pending" });
  if (error) {
    console.error("[proposeTrade] Offre non enregistrée :", error.message);
    return { ok: false, error: "Proposition impossible pour l'instant." };
  }
  return { ok: true, message: "Proposition envoyée." };
}

/** Offres reçues et envoyées encore ouvertes (en attente, moins de 72 h). */
export async function readTrades(userId: string): Promise<TradesView> {
  const since = new Date(Date.now() - TRADE_TTL_MS).toISOString();
  const { data, error } = await service()
    .from("card_trades")
    .select("id, from_user, to_user, offered, requested, created_at")
    .or(`from_user.eq.${userId},to_user.eq.${userId}`)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    // Base sans la migration `20261112120000` : pas d'échange, sans bruit pour le joueur.
    console.warn("[readTrades] Échanges illisibles :", error.message);
    return { incoming: [], outgoing: [] };
  }
  const rows = data ?? [];
  const otherIds = [...new Set(rows.map((row) => (row.from_user === userId ? row.to_user : row.from_user)))];
  const { data: profiles } = otherIds.length > 0 ? await service().from("profiles").select("id, display_name").in("id", otherIds) : { data: [] };
  const names = new Map((profiles ?? []).map((row) => [row.id, row.display_name]));

  const view = (row: (typeof rows)[number]): TradeView => {
    const otherUserId = row.from_user === userId ? row.to_user : row.from_user;
    return {
      id: row.id,
      otherUserId,
      otherName: names.get(otherUserId) ?? "Un ami",
      offered: fromStoredLines(row.offered),
      requested: fromStoredLines(row.requested),
      createdAt: row.created_at,
      expiresAt: new Date(Date.parse(row.created_at) + TRADE_TTL_MS).toISOString(),
    };
  };
  return {
    incoming: rows.filter((row) => row.to_user === userId && !tradeExpired(row.created_at)).map(view),
    outgoing: rows.filter((row) => row.from_user === userId && !tradeExpired(row.created_at)).map(view),
  };
}

export async function acceptTrade(userId: string, tradeId: string): Promise<TradeResult> {
  const { data, error } = await service().rpc("accept_card_trade", { p_trade_id: tradeId, p_user_id: userId });
  if (error) {
    console.error("[acceptTrade] Échange refusé par la base :", error.message);
    return { ok: false, error: "Échange impossible pour l'instant." };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Échange impossible." };
  return { ok: true, message: "Échange conclu : les cartes sont dans ta collection." };
}

/** Refus (par le destinataire) ou annulation (par l'auteur) d'une offre encore en attente. */
export async function closeTrade(userId: string, tradeId: string, as: "declined" | "cancelled"): Promise<TradeResult> {
  const column = as === "declined" ? "to_user" : "from_user";
  const { data, error } = await service()
    .from("card_trades")
    .update({ status: as, resolved_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq(column, userId)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: "Impossible pour l'instant." };
  if ((data ?? []).length === 0) return { ok: false, error: "Cet échange n'existe plus." };
  return { ok: true, message: as === "declined" ? "Offre refusée." : "Offre annulée." };
}

/** Offres reçues en attente, avec leur auteur — pour l'alerte du pouls social. */
export async function readIncomingTradeIds(userId: string): Promise<{ id: string; fromName: string }[]> {
  const trades = await readTrades(userId);
  return trades.incoming.map((trade) => ({ id: trade.id, fromName: trade.otherName }));
}
