import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@/game";
import { NouveauCadreFace } from "@/features/cadre-preview/NouveauCadreCard";

// Le composant est compilé en JSX classique sous vitest : il attend `React` en global.
(globalThis as { React?: typeof React }).React = React;

const def = getCardDefinition("aberration-vorace");

describe("NouveauCadreFace — illustration pas encore sortie", () => {
  it("cachée : ni liseré, ni nom, ni stats ; seulement le flou et son sigle « S »", () => {
    const html = renderToStaticMarkup(createElement(NouveauCadreFace, { def, illustration: "styled", illustrationCachee: true }));
    expect(html).toContain("data-illustration-cachee");
    expect(html).toContain("data-illustration-sigle");
    expect(html).toMatch(/>S<\/span>/);
    expect(html).not.toContain(def.name);
    expect(html).not.toContain('data-stat="attack"');
    expect(html).not.toContain("/cadre.webp");
  });

  it("Full-Art cachée : sigle « FA »", () => {
    const html = renderToStaticMarkup(createElement(NouveauCadreFace, { def, illustration: "styled-fa", illustrationCachee: true }));
    expect(html).toMatch(/>FA<\/span>/);
    expect(html).not.toContain('data-stat="attack"');
  });

  it("visible : la carte entière, sans sigle", () => {
    const html = renderToStaticMarkup(createElement(NouveauCadreFace, { def, illustration: "styled" }));
    expect(html).toContain(def.name);
    expect(html).toContain('data-stat="attack"');
    expect(html).not.toContain("data-illustration-sigle");
  });
});
