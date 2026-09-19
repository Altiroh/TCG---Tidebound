import { describe, expect, it } from "vitest";
import { CATALOG_DECKS } from "@/game/cards/decks/catalog";
import { deckProfile } from "@/game/cards/decks/deckProfile";
import { CORE_SET } from "@/game/cards/sets/core";

/**
 * LE PROFIL DÉDUIT d'un deck — ce qui remplit la fiche d'un deck monté par
 * le joueur, qui n'a aucune métadonnée écrite.
 *
 * Ce qu'on vérifie n'est pas qu'il retrouve les libellés du catalogue : il
 * ne le peut pas, et il ne doit pas essayer. « Bec dans la Brume » est
 * écrit « Agressif / Pied marin et tempo » quand « Sous la Ligne » est
 * « Contrôle / Abysses et Déraison » — c'est une intention de design, pas
 * une arithmétique.
 *
 * Ce qu'on vérifie, c'est qu'il DISCRIMINE : deux decks différents doivent
 * obtenir des profils différents. Une déduction qui dit la même chose de
 * tout le monde est pire que pas de déduction du tout, et c'est exactement
 * ce que donnait la première version (quinze listes sur dix-sept
 * « Agressif », toutes avec les deux mêmes mécaniques).
 */

const PROFILES = CATALOG_DECKS.map((deck) => ({ deck, profile: deckProfile(deck.cardIds)! }));

describe("deckProfile", () => {
  it("rend un profil complet pour chaque liste du catalogue", () => {
    for (const { deck, profile } of PROFILES) {
      expect(profile, deck.name).toBeTruthy();
      expect(profile.style.length, deck.name).toBeGreaterThan(0);
      expect(profile.difficulty, deck.name).toBeGreaterThanOrEqual(1);
      expect(profile.difficulty, deck.name).toBeLessThanOrEqual(5);
      expect(profile.mechanics.length, deck.name).toBeGreaterThanOrEqual(1);
      expect(profile.mechanics.length, deck.name).toBeLessThanOrEqual(3);
    }
  });

  it("discrimine : ni un seul rôle, ni une seule difficulté pour tout le monde", () => {
    const styles = new Set(PROFILES.map((entry) => entry.profile.style));
    const difficulties = new Set(PROFILES.map((entry) => entry.profile.difficulty));
    // Les dix listes du catalogue v4 s'étalent de 1,88 à 3,00 de coût
    // moyen : au moins trois rôles doivent sortir.
    expect(styles.size).toBeGreaterThanOrEqual(3);
    // Deux crans de difficulté seulement, et c'est attendu : le catalogue
    // n'est plus un échantillon large de listes hétéroclites, ce sont dix
    // decks tous compétitifs, donc tous à peu près aussi occupants. Ce
    // qu'on exige ici, c'est que la déduction ne dise pas LA MÊME chose de
    // tout le monde — pas qu'elle balaie toute l'échelle sur un
    // échantillon qui ne la contient pas.
    expect(difficulties.size).toBeGreaterThanOrEqual(2);
  });

  it("ne rend jamais la même mécanique à tout le monde", () => {
    const counts = new Map<string, number>();
    for (const { profile } of PROFILES) {
      for (const mechanic of profile.mechanics) counts.set(mechanic, (counts.get(mechanic) ?? 0) + 1);
    }
    // Une mécanique portée par plus des deux tiers des listes ne
    // caractérise plus rien — c'est le seuil qu'il faut alors relever.
    for (const [mechanic, count] of counts) {
      expect(count / PROFILES.length, mechanic).toBeLessThan(0.67);
    }
  });

  it("reconnaît le Sabordage et la Garde là où les listes les revendiquent", () => {
    const sabordage = PROFILES.find((entry) => entry.deck.id === "tout-recuperer");
    expect(sabordage?.profile.mechanics).toContain("Sabordage");
    const garde = PROFILES.find((entry) => entry.deck.id === "grace-sous-pression");
    expect(garde?.profile.mechanics).toContain("Garde");
  });

  it("ne nomme JAMAIS un archétype de moteur", () => {
    // « Aucun archétype ne doit être nommé côté joueur » (game/cards/archetypes.ts).
    const forbidden = ["Cra-Poiscail", "Un Dead", "cra-poiscail", "un-dead"];
    for (const { deck, profile } of PROFILES) {
      for (const mechanic of profile.mechanics) {
        for (const word of forbidden) expect(mechanic, `${deck.name} / ${mechanic}`).not.toContain(word);
      }
    }
  });

  it("tient debout sur les cas limites", () => {
    expect(deckProfile([])).toBeNull();
    expect(deckProfile(["carte-qui-nexiste-pas"])).toBeNull();

    // Une seule carte répétée : profil valide, et la mécanique qu'elle
    // porte doit ressortir plutôt que le repli de courbe.
    const garde = CORE_SET.find((card) => card.keywords?.includes("garde"));
    expect(garde).toBeTruthy();
    const mono = deckProfile(Array.from({ length: 40 }, () => garde!.id));
    expect(mono?.mechanics).toContain("Garde");
  });

  it("est pure : mêmes cartes, même profil, quel que soit l'ordre", () => {
    const deck = CATALOG_DECKS[0]!;
    const shuffled = [...deck.cardIds].reverse();
    expect(deckProfile(shuffled)).toEqual(deckProfile(deck.cardIds));
  });
});
