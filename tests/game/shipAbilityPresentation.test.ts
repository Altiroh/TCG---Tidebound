/**
 * Ce qu'une capacité de Navire DOIT porter pour être jouable à l'écran :
 * une illustration pour son hublot, et de quoi s'entendre quand elle part.
 *
 * Règle tenue ici plutôt que dans une revue : une capacité muette ou sans
 * image passe inaperçue en partie, et rien dans le moteur ne s'en plaint.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHIP_SET } from "@/game/environment/shipData";

const SHIPS = path.join(process.cwd(), "public", "assets", "ships");

const ABILITIES = SHIP_SET.filter((ship) => ship.activatableAbility).map((ship) => ({
  ship,
  ability: ship.activatableAbility!,
}));

describe("présentation des capacités de Navire", () => {
  it("chaque Navire du roster porte une capacité activable", () => {
    expect(ABILITIES).toHaveLength(SHIP_SET.length);
  });

  it.each(ABILITIES)("$ship.name — son hublot a une illustration, et le fichier existe", ({ ability }) => {
    expect(ability.illustration).toMatch(/\.webp$/);
    expect(existsSync(path.join(SHIPS, "capacite", ability.illustration!))).toBe(true);
  });

  it.each(ABILITIES)("$ship.name — son illustration de Navire existe", ({ ship }) => {
    expect(ship.illustration).toMatch(/\.webp$/);
    expect(existsSync(path.join(SHIPS, "illu", ship.illustration!))).toBe(true);
  });

  /**
   * Une capacité qui s'active d'un seul geste s'entend à l'activation ; une
   * capacité en deux temps (le Canon de proue) est muette à l'armement — ce
   * qui s'entend, c'est le tir, et c'est l'impact d'attaque qui le joue
   * (`features/match/table/useTableMotion.ts`). Une capacité CIBLÉE (Pique à
   * Glace) s'entend par l'impact de ses dégâts, comme tout effet qui blesse.
   */
  it.each(ABILITIES)("$ship.name — elle s'entend au bon moment", ({ ability }) => {
    if (ability.armedShot || ability.targeting) expect(ability.activationSound).toBeUndefined();
    else expect(ability.activationSound).toBeDefined();
  });
});
