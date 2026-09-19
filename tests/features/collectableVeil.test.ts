import { describe, expect, it } from "vitest";
import { COLLECTABLE_FAMILIES, isArtVeiled, isFree, isSlotMasked } from "@/game";

/**
 * CE QU'ON N'A PAS GAGNÉ, ON NE LE VOIT PAS.
 *
 * La règle du 19/09/2026 tient en deux phrases :
 *
 *   1. toute récompense à MÉRITER reste sous le voile tant qu'elle n'est
 *      pas obtenue. Sinon, le jour où elle tombe, il n'y a plus rien à
 *      découvrir ;
 *   2. ce qui est EN VENTE se montre. On ne vend pas ce qu'on refuse de
 *      montrer, et le rayon Cosmétiques du Market lit la même donnée.
 *
 * Ces tests appellent `isArtVeiled` ELLE-MÊME — la fonction que
 * `collectablesService.toOption` applique. Une première version réécrivait
 * la règle ici : elle pouvait rester verte pendant que le code livré disait
 * autre chose, ce qui est exactement l'inverse de ce qu'on demande à un
 * test. C'est pour ça que la règle a été descendue dans le moteur
 * (`game/cosmetics/unlock.ts`), où elle se teste sans base.
 */

describe("voile des Collectables", () => {
  it("voile TOUT ce qui reste à mériter, quelle que soit la famille", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        if (isFree(item) || item.unlock.kind === "purchase") continue;
        expect(
          isArtVeiled(item, false),
          `« ${item.label} » (${family.label}) se laisse regarder sans être obtenu`
        ).toBe(true);
      }
    }
  });

  it("ne voile RIEN de ce qui est obtenu", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        expect(isArtVeiled(item, true), `« ${item.label} » reste voilé après obtention`).toBe(false);
      }
    }
  });

  it("montre ce qui est EN VENTE, même sans l'avoir — on ne vend pas ce qu'on cache", () => {
    const onSale = COLLECTABLE_FAMILIES.flatMap((family) => family.items).filter((item) => item.unlock.kind === "purchase");
    // Le rayon existe : sans lui, ce test ne prouverait rien.
    expect(onSale.length).toBeGreaterThan(0);
    for (const item of onSale) {
      expect(isArtVeiled(item, false), `« ${item.label} » est en vente et masqué`).toBe(false);
    }
  });

  it("masque l'EMPLACEMENT d'un Collectable caché, et le révèle une fois obtenu", () => {
    const hidden = COLLECTABLE_FAMILIES.flatMap((family) => family.items).filter((item) => item.hidden === true);
    expect(hidden.length).toBeGreaterThan(0);
    for (const item of hidden) {
      expect(isSlotMasked(item, false), item.label).toBe(true);
      expect(isSlotMasked(item, true), item.label).toBe(false);
      // Masqué implique voilé : on ne peut pas cacher le nom en montrant l'image.
      expect(isArtVeiled(item, false), item.label).toBe(true);
    }
  });

  it("ne masque jamais un emplacement qui n'est pas déclaré caché", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        if (item.hidden === true) continue;
        expect(isSlotMasked(item, false), item.label).toBe(false);
      }
    }
  });

  it("n'a aucun Collectable caché qui serait en vente — les deux se contrediraient", () => {
    // Un objet caché ne dit ni son nom ni sa condition ; le mettre en vente
    // reviendrait à en afficher le prix, donc à le désigner.
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        if (item.hidden !== true) continue;
        expect(item.unlock.kind, `« ${item.label} » est caché ET en vente`).not.toBe("purchase");
      }
    }
  });

  it("garde au moins un objet gratuit par famille — c'est lui qu'on porte au départ", () => {
    // Au MOINS un, pas exactement un : les Cadres de Navire en ont deux, et
    // c'est voulu. Ce qui compte, c'est qu'une famille ne puisse pas se
    // retrouver sans repli — `buildView` équipe le gratuit tant qu'aucune
    // ligne ne l'est, et sans gratuit il n'équiperait rien.
    for (const family of COLLECTABLE_FAMILIES) {
      expect(family.items.filter(isFree).length, family.label).toBeGreaterThanOrEqual(1);
    }
  });
});
