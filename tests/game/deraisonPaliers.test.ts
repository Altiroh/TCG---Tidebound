import { afterEach, describe, expect, it } from "vitest";
import { deraisonAnchorCost, deraisonAnchorDamage } from "@/game/state/reason";
import { RULES } from "@/game/rules/constants";

/**
 * LE BARÈME DE LA DETTE.
 *
 * Du 22/09 au 19/10/2026, les points au-delà du 4e coûtaient 2 Ancrage ;
 * ce doublement est RETIRÉ (il ne se voyait pas à l'écran) : chaque point
 * coûte de nouveau 1 (`RULES.DERAISON_ANCHOR_DAMAGE_TIERS` vide). Ces tests tiennent les deux bouts
 * — que la règle EN VIGUEUR est bien celle-là, et que le barème compte
 * point par point quelle que soit sa forme, pour que la remesurer
 * (`npm run replay -- --variante deraison`) reste honnête.
 */

type Palier = { from: number; perPoint: number };
const regles = RULES as { DERAISON_ANCHOR_DAMAGE_TIERS: ReadonlyArray<Palier> };
const initial = regles.DERAISON_ANCHOR_DAMAGE_TIERS;
afterEach(() => {
  regles.DERAISON_ANCHOR_DAMAGE_TIERS = initial;
});

describe("barème de la Déraison", () => {
  it("la règle en vigueur : 1 Ancrage par point de dette, sans doublement", () => {
    expect(RULES.DERAISON_ANCHOR_DAMAGE_TIERS).toEqual([]);
    expect(deraisonAnchorCost(0)).toBe(0);
    expect(deraisonAnchorCost(4)).toBe(4);
    // La dette de 14 du retour du 19/10/2026 : 14, plus 24.
    expect(deraisonAnchorCost(14)).toBe(14);
  });

  it("sans palier, la somme revaut la multiplication d'avant", () => {
    regles.DERAISON_ANCHOR_DAMAGE_TIERS = [];
    for (const dette of [0, 1, 3, 7, 11]) {
      expect(deraisonAnchorCost(dette)).toBe(dette * RULES.DERAISON_ANCHOR_DAMAGE_PER_POINT);
    }
  });

  it("les paliers s'empilent, le dernier atteint l'emporte", () => {
    regles.DERAISON_ANCHOR_DAMAGE_TIERS = [
      { from: 4, perPoint: 2 },
      { from: 8, perPoint: 3 },
    ];
    // 3x1 + 4x2 + 2x3
    expect(deraisonAnchorCost(9)).toBe(3 + 8 + 6);
  });

  it("la réduction du Navire s'applique APRÈS le barème, et ne descend pas sous zéro", () => {
    regles.DERAISON_ANCHOR_DAMAGE_TIERS = [{ from: 5, perPoint: 2 }];
    // Le Goliath n'a aucune réduction : le barème passe tel quel.
    expect(deraisonAnchorDamage({ shipId: "le-goliath" }, -7)).toBe(10);
    // Pénitence retranche du TOTAL, elle ne change pas le tarif du point.
    const penitence = deraisonAnchorDamage({ shipId: "la-religieuse" }, -7);
    expect(penitence).toBeGreaterThanOrEqual(0);
    expect(penitence).toBeLessThanOrEqual(10);
  });

  it("une Raison positive ou nulle ne doit rien, barème ou pas", () => {
    regles.DERAISON_ANCHOR_DAMAGE_TIERS = [{ from: 1, perPoint: 5 }];
    expect(deraisonAnchorDamage({ shipId: "le-goliath" }, 0)).toBe(0);
    expect(deraisonAnchorDamage({ shipId: "le-goliath" }, 3)).toBe(0);
  });
});
