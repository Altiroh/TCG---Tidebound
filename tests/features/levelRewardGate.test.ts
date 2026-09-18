import { describe, expect, it } from "vitest";
import { levelForTotalXp } from "@/game/progression";
import { claimableLevelsFor, reachedLevel } from "@/features/progression/levelRewardService";

/**
 * LE NIVEAU STOCKÉ N'EST QU'UN CACHE.
 *
 * `player_progression.level` n'est rafraîchi qu'en fin de partie ; les
 * quêtes, la récompense de connexion, les exploits et le tutoriel ajoutent
 * de l'XP sans y toucher. Tant que les paliers à réclamer se fiaient à
 * cette colonne, un niveau franchi par l'XP d'une quête ne donnait rien —
 * et l'écran affichait pourtant le niveau suivant, puisque lui le calcule
 * depuis l'XP.
 *
 * Cas relevé en base le 2026-09-18 sur le compte du projet : 2300 XP,
 * colonne à 8. Le palier 10 — le Jeton de Préconstruit — n'était proposé
 * nulle part.
 */
describe("paliers à réclamer", () => {
  it("compte le niveau ATTEINT, pas celui de la colonne (2300 XP, colonne à 8)", () => {
    expect(levelForTotalXp(2300)).toBe(10);
    expect(reachedLevel(2300, 8)).toBe(10);

    // Rien de réclamé pour l'instant : le palier 10 doit y être.
    expect(claimableLevelsFor(reachedLevel(2300, 8), [])).toContain(10);
    // Ce que faisait l'ancien code, avec la colonne seule.
    expect(claimableLevelsFor(8, [])).not.toContain(10);
  });

  it("ne rabaisse jamais un niveau déjà accordé", () => {
    // Colonne en AVANCE sur la courbe (palier offert à la main, réglage
    // d'équilibrage qui renchérit la courbe) : on garde le niveau acquis.
    expect(reachedLevel(0, 12)).toBe(12);
    expect(reachedLevel(2300, 12)).toBe(12);
  });

  it("ne propose pas deux fois un palier déjà réclamé", () => {
    const levels = claimableLevelsFor(reachedLevel(2300, 8), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(levels).toEqual([10]);
  });
});
