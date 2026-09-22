import { afterEach, describe, expect, it } from "vitest";
import { deraisonAnchorCost, deraisonAnchorDamage } from "@/game/state/reason";
import { RULES } from "@/game/rules/constants";

/**
 * LE BARÈME DE LA DETTE.
 *
 * `DERAISON_ANCHOR_DAMAGE_TIERS` est un INSTRUMENT : vide dans le dépôt, il
 * laisse la règle plate d'origine intacte. Ces tests tiennent les deux
 * bouts — que l'état par défaut n'a rien changé, et que le barème progressif
 * compte bien point par point le jour où on l'allume (`npm run replay --
 * --variante deraison`).
 */

type Palier = { from: number; perPoint: number };
const regles = RULES as { DERAISON_ANCHOR_DAMAGE_TIERS: ReadonlyArray<Palier> };
const initial = regles.DERAISON_ANCHOR_DAMAGE_TIERS;
afterEach(() => {
  regles.DERAISON_ANCHOR_DAMAGE_TIERS = initial;
});

describe("barème de la Déraison", () => {
  it("sans palier, la règle reste plate — un point, un Ancrage", () => {
    expect(RULES.DERAISON_ANCHOR_DAMAGE_TIERS).toEqual([]);
    for (const dette of [0, 1, 3, 7, 11]) {
      expect(deraisonAnchorCost(dette)).toBe(dette * RULES.DERAISON_ANCHOR_DAMAGE_PER_POINT);
    }
  });

  it("avec un palier, chaque point paie le tarif du sien — c'est une somme, pas un multiplicateur", () => {
    regles.DERAISON_ANCHOR_DAMAGE_TIERS = [{ from: 5, perPoint: 2 }];
    // Sous le palier : rien ne bouge. C'est le point de la forme choisie —
    // les tours qui empruntent peu ne sont pas touchés.
    expect(deraisonAnchorCost(4)).toBe(4);
    // 4 points à 1, puis 3 à 2.
    expect(deraisonAnchorCost(7)).toBe(4 + 6);
    // La dette de 11 réellement observée au banc : 4 + 14.
    expect(deraisonAnchorCost(11)).toBe(18);
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
