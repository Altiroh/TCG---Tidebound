import { describe, expect, it } from "vitest";
import { getCardDefinition, guardsBlockingAttack, QUALIFICATION_EQUIVALENTS, type CardInstance, type GameState } from "@/game";
import { effectLead, effectLine, qualificationChips, qualificationLead } from "@/features/match/qualificationDisplay";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

/**
 * AFFICHAGE DES QUALIFICATIONS (« spé. ») : la ligne en tête de l'effet,
 * les médaillons, et les équivalents d'effets déjà écrits (affichage seul).
 */

function avec(unit: CardInstance, qualifications: NonNullable<CardInstance["modifiers"][number]["qualifications"]>): CardInstance {
  return { ...unit, modifiers: [...unit.modifiers, { id: `q_${unit.instanceId}`, source: "unknown", attack: 0, health: 0, duration: "permanent", qualifications }] };
}

describe("qualificationChips", () => {
  it("une carte sans qualification n'en montre aucune", () => {
    const def = getCardDefinition("matelot-du-sans-nom");
    expect(qualificationChips(def)).toEqual([]);
    expect(qualificationLead([])).toBe("");
  });

  it("les qualifications accordées s'écrivent en tête de l'effet, valeur comprise", () => {
    const unit = avec(instance("matelot-du-sans-nom", "p1"), [{ id: "rafale" }, { id: "eclaboussure", value: 2 }]);
    const chips = qualificationChips(getCardDefinition(unit.cardId), unit);
    expect(chips.map((c) => c.label)).toEqual(["Rafale", "Éclaboussure 2"]);
    expect(chips[1]!.value).toBe(2);
    expect(chips.every((c) => !c.equivalent)).toBe(true);
    expect(chips[0]!.glyph).toBe("/assets/qualifications/rafale.webp");
    expect(qualificationLead(chips)).toBe("Rafale · Éclaboussure 2");
  });

  it("un équivalent d'effet écrit se montre avec sa condition, sans devenir une qualification", () => {
    const chips = qualificationChips(getCardDefinition("bat-marin-abyssal"));
    expect(chips.map((c) => c.label)).toEqual(["Contournement (Tempête ou Abysses)", "Ponction 1 (Abysses)"]);
    expect(chips.every((c) => c.equivalent)).toBe(true);
    // La définition, elle, ne porte toujours aucune qualification.
    expect(getCardDefinition("bat-marin-abyssal").qualifications).toBeUndefined();
  });

  it("chaque équivalent de l'audit désigne une carte qui existe", () => {
    for (const cardId of Object.keys(QUALIFICATION_EQUIVALENTS)) expect(() => getCardDefinition(cardId)).not.toThrow();
  });
});

describe("Garde et Déluge", () => {
  it("une unité à Déluge visant le Navire : ce n'est pas la Garde qui refuse", () => {
    const deluge = avec(instance("matelot-du-sans-nom", "p1"), [{ id: "deluge" }]);
    const gardien = {
      ...instance("charpentier-de-bord", "p2"),
      modifiers: [{ id: "g", source: "unknown", attack: 0, health: 0, duration: "permanent" as const, keywords: ["garde" as const] }],
    };
    const state: GameState = {
      ...testGameState({ players: [testPlayer("p1", { board: [deluge] }), testPlayer("p2", { board: [gardien] })] }),
      phase: "combatPhase",
    };
    expect(guardsBlockingAttack(state, "p1", deluge.instanceId)).toEqual([]);
    // Sans Déluge, la même Garde s'interpose.
    const simple = instance("matelot-du-sans-nom", "p1");
    const sansDeluge: GameState = { ...state, players: [testPlayer("p1", { board: [simple] }), state.players[1]] };
    expect(guardsBlockingAttack(sansDeluge, "p1", simple.instanceId)).toEqual([gardien.instanceId]);
  });
});

describe("effectLead : la spé. en tête de l'effet", () => {
  it("les mots-clés qui OUVRENT le texte passent dans la spé., devant les qualifications", () => {
    const unit = avec(instance("matelot-du-sans-nom", "p1"), [{ id: "sangsue" }]);
    const chips = qualificationChips(getCardDefinition(unit.cardId), unit);
    expect(effectLead("Garde. Pied marin. La première fois à chaque tour qu'il attaque, récupérez 1 Raison.", chips)).toEqual({
      lead: "Garde · Pied marin · Sangsue",
      text: "La première fois à chaque tour qu'il attaque, récupérez 1 Raison.",
    });
    expect(effectLine("Garde. Pied marin.", [])).toBe("Garde · Pied marin");
  });

  it("un mot-clé au milieu d'une phrase reste à sa place", () => {
    expect(effectLead("Pendant Tempête, il gagne +1 Puissance et ignore Garde.", [])).toEqual({
      lead: "",
      text: "Pendant Tempête, il gagne +1 Puissance et ignore Garde.",
    });
    expect(effectLead("Garde. Perd Garde pendant Calme.", [])).toEqual({ lead: "Garde", text: "Perd Garde pendant Calme." });
  });

  it("une qualification NOMMÉE en tête du texte n'y est pas répétée (Lot 19 — « Sangsue. Carnage. »)", () => {
    const def = getCardDefinition("devoreur-de-moelle");
    expect(effectLead(def.text, qualificationChips(def))).toEqual({ lead: "Carnage · Sangsue", text: "" });
    const parasite = getCardDefinition("parasite-ecarlate");
    expect(effectLine(parasite.text, qualificationChips(parasite))).toBe("Sangsue — À sa mort — Votre Navire récupère 1 Ancrage.");
  });
});

describe("Équipement : il confère, il ne porte pas", () => {
  it("Le Cerf-volant ne montre aucune spé. ; l'unité qu'il équipe montre Sangsue, avec son nom", () => {
    expect(qualificationChips(getCardDefinition("le-cerf-volant"))).toEqual([]);
    const porteur = instance("matelot-du-sans-nom", "p1");
    const cerf = { ...instance("le-cerf-volant", "p1"), attachedToInstanceId: porteur.instanceId };
    const chips = qualificationChips(getCardDefinition(porteur.cardId), porteur, [porteur, cerf]);
    expect(chips.map((c) => c.label)).toEqual(["Sangsue (Le Cerf-volant)"]);
    // Hors plateau (fiche de collection), rien n'est conféré.
    expect(qualificationChips(getCardDefinition(porteur.cardId), porteur)).toEqual([]);
  });
});
