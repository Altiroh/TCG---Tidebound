import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mustSignIn, redirectToSignIn } from "@/middleware";

/**
 * Connexion obligatoire (28/09/2026) : toute page demande un compte, sauf
 * l'authentification et les laboratoires de réglage.
 */
const req = (path: string, method = "GET") => new NextRequest(new URL(path, "https://tidebound.test"), { method });

describe("Porte de connexion du middleware", () => {
  it("ferme les pages du jeu", () => {
    for (const path of ["/", "/partie", "/collection", "/decks/abc", "/profil?onglet=recompenses", "/en-ligne/rejoindre/XYZ"]) {
      expect(mustSignIn(req(path)), path).toBe(true);
    }
  });

  it("laisse ouvertes l'authentification et les laboratoires", () => {
    for (const path of ["/connexion", "/connexion/mot-de-passe-oublie", "/inscription", "/reinitialiser-mot-de-passe", "/auth/callback", "/game/profil-preview"]) {
      expect(mustSignIn(req(path)), path).toBe(false);
    }
  });

  it("ne redirige pas une Server Action (POST) : elle revérifie la session elle-même", () => {
    expect(mustSignIn(req("/partie", "POST"))).toBe(false);
  });

  it("renvoie vers /connexion avec la page demandée", () => {
    const redirect = redirectToSignIn(req("/profil?onglet=quetes"), NextResponse.next());
    expect(redirect.headers.get("location")).toBe("https://tidebound.test/connexion?redirect=%2Fprofil%3Fonglet%3Dquetes");
    expect(redirectToSignIn(req("/"), NextResponse.next()).headers.get("location")).toBe("https://tidebound.test/connexion");
  });
});
