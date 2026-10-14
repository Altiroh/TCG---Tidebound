import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { syncStoredLevel } from "@/features/progression/levelRewardService";
import { parseBoosterGifts, type InboxMail, type MailDraft } from "@/features/mail/mailDraft";

/**
 * COURRIER DE BORD — module SERVEUR (pas de `"use server"` : ces fonctions
 * prennent un identifiant de joueur ; les actions exposées vivent dans
 * `features/mail/actions.ts` et déduisent le joueur de sa session).
 *
 * Un courrier sans destinataire va à tous les joueurs inscrits AVANT son
 * envoi (même règle que `claim_mail_gift`, qui la revérifie).
 */

/** Combien de courriers la boîte montre, du plus récent au plus ancien. */
const INBOX_LIMIT = 50;

/** Date d'inscription du joueur : un courrier à tous plus ancien ne le concerne pas. */
async function joinedAt(userId: string): Promise<string | null> {
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("profiles").select("created_at").eq("id", userId).maybeSingle();
  return data?.created_at ?? null;
}

/** Les courriers adressés au joueur (à lui seul, ou à tous depuis son inscription). */
async function addressedMails(userId: string, columns: string) {
  const joined = await joinedAt(userId);
  if (!joined) return { data: [] as Record<string, unknown>[], error: null };
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("mails")
    .select(columns)
    .or(`recipient_id.eq.${userId},and(recipient_id.is.null,created_at.gte."${joined}")`)
    .order("created_at", { ascending: false })
    .limit(INBOX_LIMIT);
  return { data: (data ?? []) as unknown as Record<string, unknown>[], error };
}

export async function listInbox(userId: string): Promise<InboxMail[]> {
  const service = createSupabaseServiceRoleClient();
  const mails = await addressedMails(userId, "id, title, body, thumbnail, gift_tides, gift_xp, gift_boosters, created_at");
  if (mails.error) throw new Error(mails.error.message);
  const ids = mails.data.map((row) => row.id as string);
  const receipts = ids.length
    ? await service.from("mail_receipts").select("mail_id, read_at, claimed_at").eq("user_id", userId).in("mail_id", ids)
    : { data: [], error: null };
  const byMail = new Map((receipts.data ?? []).map((row) => [row.mail_id, row]));
  return mails.data.map((row) => {
    const receipt = byMail.get(row.id as string);
    return {
      id: row.id as string,
      title: row.title as string,
      body: row.body as string,
      thumbnail: (row.thumbnail as string | null) ?? null,
      gifts: { tides: row.gift_tides as number, xp: row.gift_xp as number, boosters: parseBoosterGifts(row.gift_boosters) },
      sentAt: row.created_at as string,
      read: Boolean(receipt?.read_at),
      claimed: Boolean(receipt?.claimed_at),
    };
  });
}

/** Courriers pas encore ouverts — l'enveloppe du bandeau. Zéro si les tables manquent encore. */
export async function countUnreadMail(userId: string): Promise<number> {
  try {
    const mails = await addressedMails(userId, "id");
    if (mails.error || mails.data.length === 0) return 0;
    const service = createSupabaseServiceRoleClient();
    const ids = mails.data.map((row) => row.id as string);
    const { data, error } = await service.from("mail_receipts").select("mail_id").eq("user_id", userId).not("read_at", "is", null).in("mail_id", ids);
    if (error) return 0;
    return ids.length - (data ?? []).length;
  } catch {
    return 0;
  }
}

/** Marque un courrier lu (ouvert). Sans effet s'il l'était déjà. */
export async function markMailRead(userId: string, mailId: string): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  const { error } = await service
    .from("mail_receipts")
    .upsert({ mail_id: mailId, user_id: userId, read_at: new Date().toISOString() }, { onConflict: "mail_id,user_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function claimMailGift(userId: string, mailId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("claim_mail_gift", { p_user_id: userId, p_mail_id: mailId });
  if (error) return { ok: false, error: "Réclamation impossible pour le moment." };
  if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation refusée." };
  // L'XP reçue peut faire franchir un palier : la colonne de niveau suit.
  await syncStoredLevel(userId);
  return { ok: true };
}

/** Envoie un courrier DÉJÀ validé (`normalizeMailDraft`) et vérifié Admin par l'appelant. */
export async function sendMail(senderId: string, draft: MailDraft): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("mails").insert({
    title: draft.title,
    body: draft.body,
    thumbnail: draft.thumbnail,
    gift_tides: draft.gifts.tides,
    gift_xp: draft.gifts.xp,
    gift_boosters: draft.gifts.boosters,
    recipient_id: draft.audience === "self" ? senderId : null,
    sent_by: senderId,
  });
  if (error) {
    console.error("[sendMail] Envoi impossible :", error.message);
    return { ok: false, error: "Envoi impossible pour le moment." };
  }
  return { ok: true };
}
