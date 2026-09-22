/**
 * Ce qu'une capacité de Navire DOIT porter pour être jouable à l'écran :
 * une illustration pour son hublot, et de quoi s'entendre quand elle part.
 *
 * Règle tenue ici plutôt que dans une revue : une capacité muette ou sans
 * image passe inaperçue en partie, et rien dans le moteur ne s'en plaint.
 */
import { describe, expect, it } from "vitest";
import { SHIP_SET } from "@/game/environment/shipData";

const ABILITIES = SHIP_SET.filter((ship) => ship.activatableAbility).map((ship) => ({
  ship,
  ability: ship.activatableAbility!,
}));

describe("présentation des capacités de Navire", () => {
  it("chaque Navire du roster porte une capacité activable", () => {
    expect(ABILITIES).toHaveLength(SHIP_SET.length);
  });

  it.each(ABILITIES)("$ship.name — son hublot a une illustration", ({ ability }) => {
    expect(ability.illustration).toMatch(/\.webp$/);
  });

  /**
   * Une capacité qui s'active d'un seul geste s'entend à l'activation ; une
   * capacité en deux temps (le Canon de proue) est muette à l'armement — ce
   * qui s'entend, c'est le tir, et c'est l'impact d'attaque qui le joue
   * (`features/match/table/useTableMotion.ts`).
   */
  it.each(ABILITIES)("$ship.name — elle s'entend au bon moment", ({ ability }) => {
    if (ability.armedShot) expect(ability.activationSound).toBeUndefined();
    else expect(ability.activationSound).toBeDefined();
  });
});
