import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * LES INVITES DE PARTIE SUR UN TÉLÉPHONE COUCHÉ (844×390, 667×375).
 *
 * Retour du 30/09/2026 : le pied de validation des invites à carrousel
 * (« Prendre », « Défausser », « Ne rien prendre »…) passait sous le bord à
 * 390 px de haut, la fenêtre de réaction perdait ses boutons dès trois
 * candidats, et la fiche d'une carte ne s'ouvrait pas sur iPhone (pas de
 * `contextmenu`). Pas de DOM dans cette suite : on tient la STRUCTURE qui
 * règle ces trois cas, pour qu'une retouche ne la défasse pas en silence.
 */

function read(file: string): string {
  return readFileSync(file, "utf8");
}

const CAROUSEL_PROMPTS = [
  "features/match/DeckLookPrompt.tsx",
  "features/match/HandDiscardPrompt.tsx",
  "features/match/PickUnitsPrompt.tsx",
  "features/match/KeepUnitsPrompt.tsx",
  "features/match/GraveyardPickPrompt.tsx",
  "features/match/AssemblagePrompt.tsx",
];

describe("Invites à carrousel — le pied reste visible", () => {
  it("les six invites passent par le cadre commun", () => {
    const offenders = CAROUSEL_PROMPTS.filter((file) => !read(file).includes("<CarouselPromptFrame"));
    expect(offenders, "poser l'invite dans `CarouselPromptFrame`").toEqual([]);
  });

  it("le cadre borne la hauteur, fait céder le carrousel et jamais le pied", () => {
    const css = read("features/match/CarouselPromptFrame.module.css");
    expect(css).toContain("--tb-carousel-card-max");
    expect(css).toContain("var(--tb-safe-bottom)");
    expect(css).toMatch(/\.carousel\s*\{[^}]*min-height:\s*0/);
    expect(css).toMatch(/\.foot\s*\{[^}]*flex:\s*none/);
    expect(css).toContain("@media (max-height: 520px)");
  });

  it("les cartes du carrousel lisent le plafond de hauteur", () => {
    expect(read("features/match/CardCarousel.tsx")).toContain("max-w-[var(--tb-carousel-card-max,none)]");
  });
});

describe("Invites en verre — hauteur bornée, boutons hors défilement", () => {
  it("ReactionPrompt borne son panneau et fait défiler la liste des candidats", () => {
    const source = read("features/match/ReactionPrompt.tsx");
    expect(source).toContain("max-h-full");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("--tb-safe-bottom");
    // Délai de décision : une minute, inchangé.
    expect(source).toContain("const TIMEOUT_MS = 60_000;");
  });

  it("PromptShell borne son panneau et colle ses boutons au bas de la zone défilante", () => {
    const source = read("features/match/PromptShell.tsx");
    expect(source).toContain("max-h-full");
    expect(source).toContain("overflow-y-auto");
    expect(source).toMatch(/export function PromptActions[\s\S]*sticky bottom-0/);
  });
});

describe("Fiche d'une carte au doigt", () => {
  it("le carrousel et le cimetière ouvrent la fiche à l'appui long, pas seulement au clic droit", () => {
    for (const file of ["features/match/CardCarousel.tsx", "features/match/GraveyardViewer.tsx"]) {
      expect(read(file), file).toContain("useLongPress");
    }
  });

  it("l'appui long ne répond qu'au doigt et s'annule quand il glisse", () => {
    const source = read("features/match/useLongPress.ts");
    expect(source).toContain('event.pointerType !== "touch"');
    expect(source).toContain("LONG_PRESS_SLOP_PX");
    expect(source).toContain("onPointerCancel");
  });
});
