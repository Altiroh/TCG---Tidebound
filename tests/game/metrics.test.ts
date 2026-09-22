import { describe, expect, it } from "vitest";
import { DECK_CHASSE_AU_GROS, DECK_LE_GRAND_BANC } from "@/game/cards/decks/precon";
import { COUTS_SUIVIS, cumulerInvocations, mesurerPartie, moyenneAuTour } from "@/scripts/metrics";

/**
 * L'INSTRUMENTATION elle-même.
 *
 * Le banc d'essai sert à décider de l'équilibrage : une mesure qui se casse
 * en silence ferait prendre des décisions sur des chiffres faux, et rien ne
 * le dirait. Ce test ne juge aucune valeur — il vérifie que chaque compteur
 * est bien relevé, et qu'ils restent cohérents entre eux.
 */
describe("mesures d'une partie", () => {
  const partie = mesurerPartie(DECK_LE_GRAND_BANC, DECK_CHASSE_AU_GROS, 11);

  it("mesure une partie entière, jusqu'à un vainqueur", () => {
    expect(partie.tours).toBeGreaterThan(1);
    expect(partie.toursParJoueur).toBe(partie.tours / 2);
    expect(["a", "b", "nul"]).toContain(partie.vainqueur);
  });

  it("relève la Raison des deux bouts du tour, et ce qui reste impayable en main", () => {
    expect(partie.raisonDebutTour.length).toBeGreaterThan(0);
    expect(partie.raisonFinTour.length).toBeGreaterThan(0);
    // Un relevé par fin de tour, pas un de plus : les deux vont ensemble.
    expect(partie.mainInjouableFinTour).toHaveLength(partie.raisonFinTour.length);
    // La Raison peut être NÉGATIVE : c'est la Déraison, et elle n'a pas de
    // plancher (`game/state/reason.ts`). Le relevé doit la porter telle
    // quelle, sinon la dette disparaîtrait des mesures.
    expect(partie.raisonFinTour.every((r) => Number.isFinite(r))).toBe(true);
  });

  it("relève le coût de chaque carte jouée, et le premier tour de chaque palier suivi", () => {
    expect(partie.coutsJoues.length).toBeGreaterThan(0);
    expect(partie.coutsJoues.every((c) => c >= 0)).toBe(true);
    for (const cout of COUTS_SUIVIS) {
      // Au plus un relevé par palier : « le PREMIER tour où ce coût tombe ».
      expect(partie.premierCout[cout].length).toBeLessThanOrEqual(1);
    }
  });

  it("distingue les permanents posés des cartes jouées", () => {
    const posees = partie.posesParTour.reduce((somme, n) => somme + (n ?? 0), 0);
    const permanents = partie.permanentsParTour.reduce((somme, n) => somme + (n ?? 0), 0);
    expect(posees).toBe(partie.coutsJoues.length);
    // Une Anomalie à résolution immédiate est jouée sans rien occuper.
    expect(permanents).toBeLessThanOrEqual(posees);
  });

  it("compte les corps arrivés SANS être joués, et nomme leur source", () => {
    const parCarte = cumulerInvocations([partie]);
    expect(partie.invocations).toBeGreaterThanOrEqual(0);
    expect(parCarte.reduce((somme, entry) => somme + entry.total, 0)).toBeLessThanOrEqual(partie.invocations);
    expect(moyenneAuTour([partie], "invocationsParTour", 1)).toBeGreaterThanOrEqual(0);
  });

  it("répartit l'Ancrage perdu par source, sans en perdre en route", () => {
    const total = Object.values(partie.ancrageParPoste).reduce((somme, n) => somme + n, 0);
    expect(total).toBeGreaterThan(0);
    // On ne peut pas perdre plus d'Ancrage qu'il n'y en avait, aux dégâts
    // excédentaires du coup fatal près.
    expect(total).toBeLessThanOrEqual(partie.ancrageDepart + 20);
    expect(partie.ancrageParPoste.Déraison ?? 0).toBeLessThanOrEqual(partie.ancrageDeraison);
  });

  it("est déterministe à graine donnée — sinon aucune comparaison avant/après n'aurait de sens", () => {
    const rejoue = mesurerPartie(DECK_LE_GRAND_BANC, DECK_CHASSE_AU_GROS, 11);
    expect(rejoue.tours).toBe(partie.tours);
    expect(rejoue.vainqueur).toBe(partie.vainqueur);
    expect(rejoue.coutsJoues).toEqual(partie.coutsJoues);
    expect(rejoue.ancrageParPoste).toEqual(partie.ancrageParPoste);
  });
});
