import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueTutorialTicket, TUTORIAL_MAX_MS, TUTORIAL_MIN_MS, verifyTutorialTicket } from "@/features/onboarding/tutorialTicket";

/**
 * Ticket de tutoriel : la complétion récompensée n'est acceptée que pour le
 * compte qui a lancé la partie guidée, et après une durée minimale.
 */
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const T0 = 1_800_000_000_000;

beforeEach(() => {
  process.env.TUTORIAL_TICKET_SECRET = "secret-de-test";
});

afterEach(() => {
  delete process.env.TUTORIAL_TICKET_SECRET;
});

describe("ticket de tutoriel", () => {
  it("accepte le ticket de son compte après la durée minimale", () => {
    const ticket = issueTutorialTicket(USER, T0);
    expect(verifyTutorialTicket(USER, ticket, T0 + TUTORIAL_MIN_MS)).toBe("ok");
  });

  it("refuse une complétion trop rapide, un ticket périmé, ou l'absence de ticket", () => {
    const ticket = issueTutorialTicket(USER, T0);
    expect(verifyTutorialTicket(USER, ticket, T0 + TUTORIAL_MIN_MS - 1)).toBe("too-early");
    expect(verifyTutorialTicket(USER, ticket, T0 + TUTORIAL_MAX_MS + 1)).toBe("expired");
    expect(verifyTutorialTicket(USER, undefined, T0 + TUTORIAL_MIN_MS)).toBe("invalid");
  });

  it("refuse le ticket d'un autre compte, ou un ticket antidaté à la main", () => {
    const ticket = issueTutorialTicket(USER, T0)!;
    expect(verifyTutorialTicket(OTHER, ticket, T0 + TUTORIAL_MIN_MS)).toBe("invalid");

    const [, signature] = ticket.split(".");
    expect(verifyTutorialTicket(USER, `${T0 - TUTORIAL_MIN_MS}.${signature}`, T0)).toBe("invalid");
  });
});
