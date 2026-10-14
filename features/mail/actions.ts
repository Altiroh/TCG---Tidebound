"use server";

import { isAdmin } from "@/features/admin/roles";
import { normalizeMailDraft, type InboxMail, type MailDraft } from "@/features/mail/mailDraft";
import { claimMailGift as claimGiftFor, listInbox, markMailRead, sendMail } from "@/features/mail/mailService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Courrier de bord — actions exposées au navigateur. Le joueur vient
 * TOUJOURS de sa session ; l'envoi revérifie le rôle Admin en base.
 */

export async function fetchInbox(): Promise<{ ok: true; mails: InboxMail[] } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connectez-vous pour lire votre courrier." };
  try {
    return { ok: true, mails: await listInbox(user.id) };
  } catch (error) {
    console.error("[fetchInbox] Lecture impossible :", error);
    return { ok: false, error: "Courrier indisponible pour le moment." };
  }
}

export async function openMail(mailId: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || typeof mailId !== "string") return { ok: false };
  try {
    await markMailRead(user.id, mailId);
    return { ok: true };
  } catch (error) {
    console.error("[openMail] Marque de lecture impossible :", error);
    return { ok: false };
  }
}

export async function claimMailGift(mailId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connectez-vous pour réclamer." };
  if (typeof mailId !== "string") return { ok: false, error: "Courrier introuvable." };
  return claimGiftFor(user.id, mailId);
}

export async function sendAdminMail(draft: MailDraft): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user || !(await isAdmin(user.id))) return { ok: false, error: "Réservé aux Admins." };
  const checked = normalizeMailDraft(draft);
  if (!checked.ok) return checked;
  return sendMail(user.id, checked.draft);
}
