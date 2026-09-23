import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_DOMINANCE_THRESHOLD,
  BOOSTER_EXTENSIONS,
  OFF_SHELF_BOOSTER_IDS,
  SHELF_BOOSTER_IDS,
  boosterExtension,
  boosterExtensionLabel,
} from "@/game/boosters";
import { BOOSTER_POOLS } from "@/game/boosters/pools";
import { ARCHETYPE_LABELS } from "@/game/cards/archetypes";
import { getCardDefinition } from "@/game/cards/sets/core";

/**
 * L'EXTENSION D'UN BOOSTER — ce que le rayon promet au joueur.
 *
 * Ces tests ne jugent pas le texte : ils vérifient que la PROMESSE tient.
 * Un booster qui annonce « Extension · Un Dead » doit réellement en être
 * un, et le jour où sa liste change, c'est ici que ça casse — pas devant
 * le joueur qui a payé.
 */

/** Part du pool qui appartient à un archétype donné. */
function archetypeShare(boosterId: string, archetype: string): number {
  const pool = BOOSTER_POOLS[boosterId] ?? [];
  if (pool.length === 0) return 0;
  const members = pool.filter((cardId) => {
    try {
      return getCardDefinition(cardId).archetype === archetype;
    } catch {
      return false;
    }
  });
  return members.length / pool.length;
}

describe("extensions de boosters", () => {
  it("couvre exactement les boosters qui sont un PRODUIT", () => {
    // Tout pool du jeu est soit sur le rayon, soit explicitement hors
    // rayon. Sans ça, ajouter un booster le rendrait invisible à l'écran
    // sans que rien ne le signale.
    const known = new Set([...SHELF_BOOSTER_IDS, ...OFF_SHELF_BOOSTER_IDS]);
    for (const boosterId of Object.keys(BOOSTER_POOLS)) {
      expect(known.has(boosterId), `« ${boosterId} » n'est ni sur le rayon ni déclaré hors rayon`).toBe(true);
    }
    // Et réciproquement : le rayon ne promet pas un booster qui n'a pas de
    // pool, donc pas de cartes à tirer.
    for (const boosterId of SHELF_BOOSTER_IDS) {
      expect(BOOSTER_POOLS[boosterId], `« ${boosterId} » est au rayon sans pool`).toBeDefined();
    }
  });

  it("donne à chaque extension un texte qui existe vraiment", () => {
    for (const extension of BOOSTER_EXTENSIONS) {
      expect(extension.tagline.length, extension.boosterId).toBeGreaterThan(10);
      // L'accroche tient sur UNE ligne dans une colonne étroite : au-delà,
      // la fiche la termine en points de suspension. C'est le texte qu'on
      // raccourcit, pas la mise en page qu'on relâche.
      expect(extension.tagline.length, `« ${extension.tagline} » ne tiendra pas sur une ligne`).toBeLessThanOrEqual(32);
      // Trois à cinq lignes : assez pour raconter, trop court pour un pavé
      // que personne ne lit dans un panneau latéral.
      expect(extension.lore.length, extension.boosterId).toBeGreaterThan(120);
      expect(extension.lore.length, extension.boosterId).toBeLessThan(600);
      // Le lore raconte, il ne règle rien : un texte qui chiffre des règles
      // deviendrait faux au premier ajustement d'équilibrage.
      expect(extension.lore, extension.boosterId).not.toMatch(/\d+\s*(Raison|Ancrage|Puissance|Résistance)/);
    }
  });

  it("n'annonce un archétype que si le pool le tient vraiment", () => {
    for (const extension of BOOSTER_EXTENSIONS) {
      if (!extension.archetype) continue;
      const share = archetypeShare(extension.boosterId, extension.archetype);
      expect(
        share,
        `« ${extension.boosterId} » annonce ${ARCHETYPE_LABELS[extension.archetype]} mais n'en a que ${Math.round(share * 100)} % du pool`
      ).toBeGreaterThanOrEqual(ARCHETYPE_DOMINANCE_THRESHOLD);
    }
  });

  it("ne TAIT pas un archétype qui domine le pool", () => {
    // L'inverse du test précédent, et le plus utile des deux : le jour où
    // un booster devient celui d'une famille, il doit le dire.
    for (const extension of BOOSTER_EXTENSIONS) {
      // Un libellé de famille TRANCHÉ par le design (`familyLabel`) prime :
      // c'est une décision écrite, pas une promesse tacite (Éclats en Selle).
      if (extension.familyLabel) continue;
      for (const archetype of Object.keys(ARCHETYPE_LABELS)) {
        const share = archetypeShare(extension.boosterId, archetype);
        if (share < ARCHETYPE_DOMINANCE_THRESHOLD) continue;
        expect(
          extension.archetype,
          `« ${extension.boosterId} » est à ${Math.round(share * 100)} % ${ARCHETYPE_LABELS[archetype as keyof typeof ARCHETYPE_LABELS]} sans l'annoncer`
        ).toBe(archetype);
      }
    }
  });

  it("étiquette le rayon : base, extension, extension nommée", () => {
    expect(boosterExtensionLabel("standard")).toBe("Booster de base");
    expect(boosterExtensionLabel("etrangete-sous-marine")).toBe("Booster d'extension");
    expect(boosterExtensionLabel("la-veillee-des-disparus")).toBe("Booster d'extension · Un Dead");
    expect(boosterExtensionLabel("eclats-en-selle")).toBe("Booster d'extension · Éclats en Selle");
    // Un booster inconnu ne fait pas planter la fiche : il reste « Booster ».
    expect(boosterExtensionLabel("booster-qui-nexiste-pas")).toBe("Booster");
  });

  it("garde le Mini Booster de Bienvenue hors du rayon", () => {
    // Il ne s'achète pas, il se reçoit au tutoriel : le poser sur
    // l'étagère en ferait un produit dont le bouton Market resterait
    // éteint sans qu'on sache pourquoi.
    expect(SHELF_BOOSTER_IDS).not.toContain("welcome_tutorial");
    expect(boosterExtension("welcome_tutorial")).toBeUndefined();
  });

  it("ouvre le rayon sur les boosters de base, puis les extensions", () => {
    // Le rayon raconte une progression : ce que tout le monde peut
    // s'offrir d'abord (Défaut, Nécessaire du Marin), les extensions
    // ensuite. Le Lot 14 a ajouté un SECOND booster de base — la règle qui
    // compte n'a jamais été « un seul », mais « les bases devant ».
    expect(BOOSTER_EXTENSIONS[0]?.kind).toBe("base");
    const kinds = BOOSTER_EXTENSIONS.map((entry) => entry.kind);
    const dernierBase = kinds.lastIndexOf("base");
    expect(kinds.slice(0, dernierBase + 1).every((kind) => kind === "base")).toBe(true);
    expect(new Set(SHELF_BOOSTER_IDS).size).toBe(SHELF_BOOSTER_IDS.length);
  });
});
