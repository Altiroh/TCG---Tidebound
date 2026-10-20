"use server";

import { revalidatePath } from "next/cache";
import {
  acceptTrade as acceptFor,
  closeTrade,
  proposeTrade as proposeFor,
  readTradeableCards,
  readTrades,
  type TradeableCard,
  type TradeResult,
  type TradesView,
} from "@/features/friends/tradeService";
import { normalizeTradeLines } from "@/features/friends/tradeRules";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { socialClosedFor } from "@/features/friends/socialGate";
import { SOCIAL_INDISPONIBLE } from "@/features/friends/socialLock";

/**
 * Échanges de cartes — Server Actions exposées au navigateur. Le joueur est
 * TOUJOURS tiré de la session ; l'ami et l'offre reçus ne désignent que
 * l'AUTRE partie, et le service vérifie le lien avant d'agir.
 */

const SIGNED_OUT: TradeResult = { ok: false, error: "Connecte-toi pour échanger des cartes." };
/** Volet social réservé au mode Dev (`socialLock.ts`). */
const CLOSED: TradeResult = { ok: false, error: SOCIAL_INDISPONIBLE };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function done(result: TradeResult): TradeResult {
  if (result.ok) {
    revalidatePath("/amis");
    revalidatePath("/collection");
  }
  return result;
}

export async function fetchTrades(): Promise<TradesView | null> {
  try {
    const user = await getSessionUser();
    if (!user || (await socialClosedFor(user.id))) return null;
    return await readTrades(user.id);
  } catch (error) {
    console.error("[fetchTrades] Lecture impossible :", error);
    return null;
  }
}

/** Les deux collections échangeables (la sienne, celle de l'ami) — `null` hors amitié. */
export async function fetchTradeTable(friendId: string): Promise<{ mine: TradeableCard[]; theirs: TradeableCard[] } | null> {
  try {
    const user = await getSessionUser();
    if (!user || !isUuid(friendId) || friendId === user.id || (await socialClosedFor(user.id))) return null;
    const theirs = await readTradeableCards(user.id, friendId);
    if (!theirs) return null;
    const mine = (await readTradeableCards(user.id, user.id)) ?? [];
    return { mine, theirs };
  } catch (error) {
    console.error("[fetchTradeTable] Lecture impossible :", error);
    return null;
  }
}

export async function proposeTrade(friendId: string, offered: unknown, requested: unknown): Promise<TradeResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (await socialClosedFor(user.id)) return CLOSED;
  if (!isUuid(friendId)) return { ok: false, error: "Ami introuvable." };
  const give = normalizeTradeLines(offered);
  const take = normalizeTradeLines(requested);
  if (!give || !take) return { ok: false, error: "Proposition illisible." };
  return done(await proposeFor(user.id, friendId, give, take).catch(() => ({ ok: false as const, error: "Proposition impossible pour l'instant." })));
}

export async function acceptTrade(tradeId: string): Promise<TradeResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (await socialClosedFor(user.id)) return CLOSED;
  if (!isUuid(tradeId)) return { ok: false, error: "Échange introuvable." };
  return done(await acceptFor(user.id, tradeId).catch(() => ({ ok: false as const, error: "Échange impossible pour l'instant." })));
}

export async function declineTrade(tradeId: string): Promise<TradeResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (await socialClosedFor(user.id)) return CLOSED;
  if (!isUuid(tradeId)) return { ok: false, error: "Échange introuvable." };
  return done(await closeTrade(user.id, tradeId, "declined"));
}

export async function cancelTrade(tradeId: string): Promise<TradeResult> {
  const user = await getSessionUser();
  if (!user) return SIGNED_OUT;
  if (await socialClosedFor(user.id)) return CLOSED;
  if (!isUuid(tradeId)) return { ok: false, error: "Échange introuvable." };
  return done(await closeTrade(user.id, tradeId, "cancelled"));
}
