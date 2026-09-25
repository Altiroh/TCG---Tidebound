import type { AudienceSignal, MatchFacts } from "@/game/audience/types";

/**
 * ANALYSEURS — chacun regarde UN aspect de la partie et rend ses signaux.
 * Ajouter un aspect = ajouter un analyseur à `ANALYZERS` ; rien d'autre à
 * toucher. Poids PROVISOIRES, à valider puis reporter dans Notion.
 */
export type Analyzer = (facts: MatchFacts) => AudienceSignal[];

/** Le rythme : une partie expédiée n'intéresse personne, une partie qui s'étire lasse un peu. */
const tempo: Analyzer = (facts) => {
  if (!facts.finished) return [];
  if (facts.tableTurns <= 3) return [{ id: "tempo.expedited", family: "rythme", label: "Trop vite expédiée", weight: -20, salience: 6 }];
  if (facts.tableTurns <= 5) return [{ id: "tempo.short", family: "rythme", label: "Une partie éclair", weight: 0, salience: 1 }];
  if (facts.tableTurns <= 14) return [{ id: "tempo.full", family: "rythme", label: "Une vraie traversée", weight: 15, salience: 2 }];
  return [{ id: "tempo.long", family: "rythme", label: "Une partie au long cours", weight: 8, salience: 2 }];
};

/** La tension : un Navire au bord du naufrage, une avance qui change de camp, une fin serrée. */
const tension: Analyzer = (facts) => {
  const signals: AudienceSignal[] = [];
  const nearSinking = facts.lowestAnchor <= Math.ceil(facts.startingAnchor / 4);
  if (facts.finished && facts.won && nearSinking) {
    signals.push({ id: "tension.comeback", family: "tension", label: "Un retournement de haut vol", weight: 25, salience: 10 });
  } else if (facts.finished && facts.won && facts.finalAnchor <= Math.ceil(facts.startingAnchor / 3)) {
    signals.push({ id: "tension.narrow", family: "tension", label: "Une victoire arrachée", weight: 15, salience: 8 });
  } else if (nearSinking) {
    signals.push({ id: "tension.brink", family: "tension", label: "Le public retient son souffle", weight: 8, salience: 5 });
  }
  if (facts.leadChanges >= 2) {
    signals.push({ id: "tension.swings", family: "tension", label: "Un duel indécis jusqu'au bout", weight: Math.min(12, facts.leadChanges * 4), salience: 7 });
  }
  if (facts.finished && facts.won && facts.opponentFinalAnchor <= 0 && facts.finalAnchor >= facts.startingAnchor * 0.8 && facts.tableTurns <= 6) {
    signals.push({ id: "tension.onesided", family: "tension", label: "Une démonstration sans suspense", weight: -5, salience: 3 });
  }
  return signals;
};

/** La maîtrise : un jeu riche, des réactions au bon moment, le Navire qui parle, la Marée domptée. */
const mastery: Analyzer = (facts) => {
  const signals: AudienceSignal[] = [];
  if (facts.distinctCards >= 8 && facts.distinctTypes >= 3) {
    signals.push({ id: "maitrise.variety", family: "maitrise", label: "Un jeu riche et varié", weight: 12, salience: 6 });
  } else if (facts.distinctCards >= 5) {
    signals.push({ id: "maitrise.solid", family: "maitrise", label: "Un jeu solide", weight: 6, salience: 2 });
  }
  if (facts.reactions > 0) {
    signals.push({ id: "maitrise.reactions", family: "maitrise", label: "Des réactions au bon moment", weight: Math.min(10, facts.reactions * 3), salience: 5 });
  }
  if (facts.shipAbilities > 0) {
    signals.push({ id: "maitrise.ship", family: "maitrise", label: "Le Navire a donné de la voix", weight: Math.min(6, facts.shipAbilities * 3), salience: 3 });
  }
  if (facts.tideManipulations >= 2) {
    signals.push({ id: "maitrise.tide", family: "maitrise", label: "La Marée domptée", weight: 5, salience: 4 });
  }
  return signals;
};

/** Les erreurs : hésiter jusqu'au délai, passer ses tours, sombrer dans la Déraison, abandonner. */
const errors: Analyzer = (facts) => {
  const signals: AudienceSignal[] = [];
  if (facts.timeouts > 0) {
    signals.push({ id: "erreur.timeout", family: "erreur", label: "Des hésitations qui ont lassé", weight: -15 * facts.timeouts, salience: 7 });
  }
  if (facts.idleTurns >= 2) {
    signals.push({ id: "erreur.idle", family: "erreur", label: "Des tours sans rien tenter", weight: -4 * facts.idleTurns, salience: 5 });
  }
  if (facts.deraisons >= 2) {
    signals.push({ id: "erreur.deraison", family: "erreur", label: "Une Raison mal tenue", weight: -3 * facts.deraisons, salience: 4 });
  }
  if (facts.conceded) {
    signals.push({ id: "erreur.concede", family: "erreur", label: "Un abandon qui a déçu", weight: -25, salience: 9 });
  }
  return signals;
};

export const ANALYZERS: readonly Analyzer[] = [tempo, tension, mastery, errors];
