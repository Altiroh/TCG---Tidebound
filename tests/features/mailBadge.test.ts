import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDatabase, createFakeClient } from "./fakeSupabase";

/**
 * L'ENVELOPPE DU BANDEAU (28/10/2026) : un courrier est « en attente » tant
 * qu'il n'est pas ouvert, OU qu'il est ouvert avec un cadeau pas réclamé.
 */
const USER = "11111111-1111-1111-1111-111111111111";
const db = new FakeDatabase();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => createFakeClient(db),
  createSupabaseServerClient: () => createFakeClient(db),
}));

const { countUnreadMail } = await import("@/features/mail/mailService");

function mail(id: string, gift: Partial<{ gift_tides: number; gift_xp: number; gift_boosters: unknown }> = {}) {
  db.table("mails").push({ id, title: id, body: "", recipient_id: USER, created_at: "2026-10-28T10:00:00Z", gift_tides: 0, gift_xp: 0, gift_boosters: [], ...gift });
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  db.table("profiles").push({ id: USER, created_at: "2026-10-01T00:00:00Z" });
});

describe("enveloppe du bandeau", () => {
  it("compte les courriers pas encore ouverts", async () => {
    mail("a");
    mail("b");
    expect(await countUnreadMail(USER)).toBe(2);
  });

  it("un courrier ouvert sans cadeau ne compte plus ; avec un cadeau pas réclamé, il compte encore", async () => {
    mail("lu-sans-cadeau");
    mail("lu-avec-cadeau", { gift_tides: 100 });
    mail("reclame", { gift_tides: 100 });
    db.table("mail_receipts").push(
      { mail_id: "lu-sans-cadeau", user_id: USER, read_at: "2026-10-28T11:00:00Z", claimed_at: null },
      { mail_id: "lu-avec-cadeau", user_id: USER, read_at: "2026-10-28T11:00:00Z", claimed_at: null },
      { mail_id: "reclame", user_id: USER, read_at: "2026-10-28T11:00:00Z", claimed_at: "2026-10-28T11:01:00Z" }
    );
    expect(await countUnreadMail(USER)).toBe(1);
  });
});
