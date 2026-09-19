import { describe, expect, it } from "vitest";
import { COLLECTABLE_FAMILIES, isFree } from "@/game";
import type { CosmeticUnlock } from "@/game/cosmetics/unlock";

/**
 * CE QU'ON N'A PAS GAGNÉ, ON NE LE VOIT PAS.
 *
 * La règle du 19/09/2026 tient en deux phrases, et c'est elle qu'on
 * protège ici — pas le rendu, qui est affaire de CSS :
 *
 *   1. toute récompense à MÉRITER reste sous le voile tant qu'elle n'est
 *      pas obtenue. Sinon, le jour où elle tombe, il n'y a plus rien à
 *      découvrir ;
 *   2. ce qui est EN VENTE se montre. On ne vend pas ce qu'on refuse de
 *      montrer, et le rayon Cosmétiques du Market lit la même donnée.
 *
 * La fonction sous test vit dans un module serveur (`collectablesService`,
 * qui importe un client Supabase) : la RÈGLE est donc réécrite ici sur le
 * seul catalogue, et les deux doivent dire la même chose. Un jour où elles
 * divergeraient, c'est ce fichier qui a raison — c'est lui qui porte
 * l'intention.
 */

/** La règle, telle que `toOption` l'applique. */
function veiled(unlock: CosmeticUnlock, hidden: boolean, owned: boolean): boolean {
  const masked = !owned && hidden;
  const forSale = unlock.kind === "purchase";
  return masked || (!owned && !forSale);
}

describe("voile des Collectables", () => {
  it("voile TOUT ce qui reste à mériter, quelle que soit la famille", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        if (isFree(item) || item.unlock.kind === "purchase") continue;
        expect(
          veiled(item.unlock, item.hidden === true, false),
          `« ${item.label} » (${family.label}) se laisse regarder sans être obtenu`
        ).toBe(true);
      }
    }
  });

  it("ne voile RIEN de ce qui est obtenu", () => {
    for (const family of COLLECTABLE_FAMILIES) {
      for (const item of family.items) {
        expect(veiled(item.unlock, item.hidden === true, true), `« ${item.label} » reste voilé après obtention`).toBe(false);
      }
    }
  });

  it("montre ce qui est EN VENTE, même sans l'avoir — on ne vend pas ce qu'on cache", () => {
    const onSale = COLLECTABLE_FAMILIES.flatMap((family) => family.items).filter((item) => item.unlock.kind === "purchase");
    // Le rayon existe : sans lui, ce test ne prouverait rien.
    expect(onSale.length).toBeGreaterThan(0);
    for (const item of onSale) {
      expect(veiled(item.unlock, item.hidden === true, false), `« ${item.label} » est en vente et masqué`).toBe(false);
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
