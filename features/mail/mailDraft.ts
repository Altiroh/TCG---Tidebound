import { OFF_SHELF_BOOSTER_IDS, SHELF_BOOSTER_IDS } from "@/game/boosters/extensions";
import type { LoginRewardItem } from "@/game/progression";

/**
 * COURRIER DE BORD — forme d'un courrier et règles d'écriture, sans base
 * ni interface : relu par l'action serveur (qui refuse un brouillon
 * invalide) comme par le formulaire (qui le dit avant l'envoi).
 */

export const MAIL_TITLE_MAX = 80;
export const MAIL_BODY_MAX = 2000;
/** Plafond d'un cadeau, en Tides comme en XP (même borne qu'en base). */
export const MAIL_GIFT_MAX = 100_000;
export const MAIL_BOOSTER_MAX = 50;
/** Longueur maximale de la miniature encodée (data URL) — même borne qu'en base. */
export const MAIL_THUMBNAIL_MAX = 300_000;

/** Boosters qu'un courrier peut offrir : ceux du rayon, et le booster de bienvenue. */
export const MAIL_BOOSTER_IDS: readonly string[] = [...SHELF_BOOSTER_IDS, ...OFF_SHELF_BOOSTER_IDS];

export interface MailBoosterGift {
  boosterId: string;
  count: number;
}

export interface MailGifts {
  tides: number;
  xp: number;
  boosters: MailBoosterGift[];
}

/** `all` : tous les joueurs inscrits ; `self` : l'Admin seul (pour essayer un courrier). */
export type MailAudience = "all" | "self";

export interface MailDraft {
  title: string;
  body: string;
  thumbnail: string | null;
  gifts: MailGifts;
  audience: MailAudience;
}

/** Un courrier tel que la boîte le montre au joueur. */
export interface InboxMail {
  id: string;
  title: string;
  body: string;
  thumbnail: string | null;
  gifts: MailGifts;
  sentAt: string;
  read: boolean;
  claimed: boolean;
}

export function hasGifts(gifts: MailGifts): boolean {
  return gifts.tides > 0 || gifts.xp > 0 || gifts.boosters.some((entry) => entry.count > 0);
}

/** Les cadeaux en récompenses affichables (`RewardIcon`, `RewardReveal`). */
export function mailGiftItems(gifts: MailGifts): LoginRewardItem[] {
  const items: LoginRewardItem[] = [];
  if (gifts.tides > 0) items.push({ kind: "tides", amount: gifts.tides });
  if (gifts.xp > 0) items.push({ kind: "xp", amount: gifts.xp });
  for (const entry of gifts.boosters) if (entry.count > 0) items.push({ kind: "booster", boosterId: entry.boosterId, count: entry.count });
  return items;
}

/** Relit la colonne `gift_boosters` (JSON libre) : ce qui n'a pas la bonne forme est ignoré. */
export function parseBoosterGifts(raw: unknown): MailBoosterGift[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const boosterId = (entry as { boosterId?: unknown })?.boosterId;
    const count = (entry as { count?: unknown })?.count;
    return typeof boosterId === "string" && typeof count === "number" && count > 0 ? [{ boosterId, count }] : [];
  });
}

/**
 * Valide un brouillon et le remet au propre (titre rogné, boosters
 * fusionnés par sachet, quantités nulles retirées). Le message d'erreur
 * est destiné à l'Admin, tel quel.
 */
export function normalizeMailDraft(draft: MailDraft): { ok: true; draft: MailDraft } | { ok: false; error: string } {
  // Venu du navigateur : la forme n'est pas garantie par le type.
  if (
    typeof draft?.title !== "string" ||
    typeof draft.body !== "string" ||
    (draft.thumbnail !== null && typeof draft.thumbnail !== "string") ||
    typeof draft.gifts !== "object" ||
    draft.gifts === null ||
    !Array.isArray(draft.gifts.boosters)
  ) {
    return { ok: false, error: "Courrier illisible." };
  }
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title) return { ok: false, error: "Le courrier n'a pas de titre." };
  if (title.length > MAIL_TITLE_MAX) return { ok: false, error: `Titre trop long (${MAIL_TITLE_MAX} caractères au plus).` };
  if (body.length > MAIL_BODY_MAX) return { ok: false, error: `Texte trop long (${MAIL_BODY_MAX} caractères au plus).` };

  if (draft.thumbnail !== null) {
    if (!/^data:image\/(webp|png|jpeg);base64,/.test(draft.thumbnail)) return { ok: false, error: "Miniature illisible." };
    if (draft.thumbnail.length > MAIL_THUMBNAIL_MAX) return { ok: false, error: "Miniature trop lourde." };
  }

  const { tides, xp } = draft.gifts;
  for (const [label, value] of [
    ["Tides", tides],
    ["XP", xp],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > MAIL_GIFT_MAX) return { ok: false, error: `${label} : un nombre entier entre 0 et ${MAIL_GIFT_MAX}.` };
  }

  const merged = new Map<string, number>();
  for (const entry of draft.gifts.boosters) {
    if (!MAIL_BOOSTER_IDS.includes(entry.boosterId)) return { ok: false, error: "Booster inconnu." };
    if (!Number.isInteger(entry.count) || entry.count < 0) return { ok: false, error: "Nombre de boosters invalide." };
    if (entry.count > 0) merged.set(entry.boosterId, (merged.get(entry.boosterId) ?? 0) + entry.count);
  }
  for (const count of merged.values()) if (count > MAIL_BOOSTER_MAX) return { ok: false, error: `${MAIL_BOOSTER_MAX} boosters du même sachet au plus.` };

  if (draft.audience !== "all" && draft.audience !== "self") return { ok: false, error: "Destinataire inconnu." };

  return {
    ok: true,
    draft: {
      title,
      body,
      thumbnail: draft.thumbnail,
      gifts: { tides, xp, boosters: [...merged].map(([boosterId, count]) => ({ boosterId, count })) },
      audience: draft.audience,
    },
  };
}
