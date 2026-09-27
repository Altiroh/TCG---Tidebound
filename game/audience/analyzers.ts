import type { AudienceSignal, MatchFacts } from "@/game/audience/types";

/**
 * ANALYSEURS — chacun regarde UN aspect de la partie et rend ses signaux.
 * Ajouter un aspect = ajouter un analyseur à `ANALYZERS` ; rien d'autre à
 * toucher. Poids PROVISOIRES, reportés dans Notion.
 *
 * Règle de robustesse : chaque fait n'est jugé qu'à UN endroit. Les gestes
 * de jeu (coups, réactions, Navire) sont jugés par les moments ; la conduite
 * (tours passés, délais, Déraison, abandon) par l'analyseur `conduite` ; la
 * forme de la partie (rythme, tension, variété) par les autres. Chaque
 * signal répété est plafonné : une seule partie ratée ne peut pas tout
 * emporter, une seule manie ne peut pas tout rapporter.
 */
export type Analyzer = (facts: MatchFacts) => AudienceSignal[];

/** Le rythme d'une partie de `tableTurns` tours de table, une fois finie. */
function tempoSignal(tableTurns: number): AudienceSignal {
  if (tableTurns <= 3) return { id: "tempo.expedited", family: "rythme", label: "Trop vite expédiée", weight: -20, salience: 6 };
  if (tableTurns <= 5) return { id: "tempo.short", family: "rythme", label: "Une partie éclair", weight: 0, salience: 1 };
  if (tableTurns <= 14) return { id: "tempo.full", family: "rythme", label: "Une vraie traversée", weight: 12, salience: 2 };
  return { id: "tempo.long", family: "rythme", label: "Une partie au long cours", weight: 6, salience: 2 };
}

/**
 * Le rythme : une partie expédiée n'intéresse personne, une partie qui
 * s'étire lasse un peu.
 *
 * - EN COURS de partie, seul ce qui est ACQUIS compte : une traversée
 *   entamée (6 tours de table et plus) est déjà là ; une partie encore
 *   courte n'est pas « expédiée » — elle n'est pas finie. L'humeur en
 *   direct ne ment donc ni en montant ni en descendant.
 * - L'ADVERSAIRE A QUITTÉ la table : le gagnant garde le rythme qu'il a
 *   joué, mais la brièveté n'est pas de son fait — pas de sanction (audit du
 *   27/09/2026 : il perdait jusqu'à 17 points de spectacle).
 */
const tempo: Analyzer = (facts) => {
  if (!facts.finished) return facts.tableTurns >= 6 ? [tempoSignal(facts.tableTurns)] : [];
  const signal = tempoSignal(facts.tableTurns);
  if (facts.opponentLeft && signal.weight <= 0) {
    return [{ id: "tempo.forfeit", family: "rythme", label: "L'adversaire a quitté la table", weight: 0, salience: 2 }];
  }
  return [signal];
};

/** La tension : un Navire au bord du naufrage, une avance qui change de camp, une fin serrée. */
const tension: Analyzer = (facts) => {
  const signals: AudienceSignal[] = [];
  // L'Ancrage que la salle a vu PERDRE face à l'adversaire : la Déraison
  // qu'on s'inflige soi-même n'en fait pas partie (`selfInflicted`) — sinon
  // on fabriquait un retournement en se saignant (audit du 27/09/2026).
  const feltFinal = facts.finalAnchor + facts.selfInflicted;
  const nearSinking = facts.lowestAnchor <= Math.ceil(facts.startingAnchor / 4);
  if (facts.finished && facts.won && nearSinking) {
    signals.push({ id: "tension.comeback", family: "tension", label: "Un retournement de haut vol", weight: 25, salience: 10 });
  } else if (facts.finished && facts.won && feltFinal <= Math.ceil(facts.startingAnchor / 3)) {
    signals.push({ id: "tension.narrow", family: "tension", label: "Une victoire arrachée", weight: 15, salience: 8 });
  } else if (nearSinking && (!facts.finished || facts.finalAnchor > 0)) {
    // Au bord du gouffre et toujours à flot : un Navire coulé, lui, n'a tenu le souffle de personne.
    signals.push({ id: "tension.brink", family: "tension", label: "Le public retient son souffle", weight: 8, salience: 5 });
  }
  if (facts.leadChanges >= 2) {
    signals.push({ id: "tension.swings", family: "tension", label: "Un duel indécis jusqu'au bout", weight: Math.min(12, facts.leadChanges * 4), salience: 7 });
  }
  // Une victoire reste une victoire, même quand l'adversaire a quitté la table.
  if (facts.finished && facts.won) {
    signals.push({ id: "tension.victory", family: "tension", label: "Une victoire au bout", weight: 5, salience: 1 });
  }
  if (facts.finished && facts.won && facts.opponentFinalAnchor <= 0 && feltFinal >= facts.startingAnchor * 0.8 && facts.tableTurns <= 6) {
    signals.push({ id: "tension.onesided", family: "tension", label: "Une démonstration sans suspense", weight: -5, salience: 3 });
  }
  return signals;
};

/**
 * La maîtrise d'ensemble : un jeu riche, la Marée domptée. Les réactions et
 * le Navire sont des GESTES : les moments les jugent, pas cet analyseur.
 */
const mastery: Analyzer = (facts) => {
  const signals: AudienceSignal[] = [];
  if (facts.distinctCards >= 10 && facts.distinctTypes >= 3) {
    signals.push({ id: "maitrise.variety", family: "maitrise", label: "Un jeu riche et varié", weight: 10, salience: 6 });
  } else if (facts.distinctCards >= 6) {
    signals.push({ id: "maitrise.solid", family: "maitrise", label: "Un jeu solide", weight: 5, salience: 2 });
  }
  if (facts.tideManipulations >= 2) {
    signals.push({ id: "maitrise.tide", family: "maitrise", label: "La Marée domptée", weight: 5, salience: 4 });
  }
  return signals;
};

/**
 * La conduite : hésiter jusqu'au délai, passer ses tours, abandonner. Chaque
 * manquement est plafonné.
 *
 * La Déraison n'en fait PAS partie : c'est une mécanique du jeu (dépenser
 * au-delà de sa Raison se paie en Ancrage), présente dans presque toutes
 * les parties — relevé `npm run audience` du 26/09/2026 : 86 % des
 * verdicts. Ce qu'elle coûte au Navire, les moments le comptent déjà.
 */
const conduct: Analyzer = (facts) => {
  const signals: AudienceSignal[] = [];
  if (facts.timeouts > 0) {
    signals.push({ id: "erreur.timeout", family: "erreur", label: "Des hésitations qui ont lassé", weight: Math.max(-30, -12 * facts.timeouts), salience: 7 });
  }
  if (facts.idleTurns >= 2) {
    signals.push({ id: "erreur.idle", family: "erreur", label: "Des tours sans rien tenter", weight: Math.max(-16, -4 * facts.idleTurns), salience: 5 });
  }
  if (facts.conceded) {
    signals.push({ id: "erreur.concede", family: "erreur", label: "Un abandon qui a déçu", weight: -25, salience: 9 });
  }
  return signals;
};

/**
 * Le fil des coups (`moments.ts`) : ce que la salle a vécu en direct, bons
 * coups et mauvaises décisions. Compté à moitié et borné — la partie se
 * juge d'abord sur l'ensemble, le détail ne fait que l'infléchir.
 */
export const MOMENTS_CAP = 30;
const moments: Analyzer = (facts) => {
  const total = Math.max(-MOMENTS_CAP, Math.min(MOMENTS_CAP, facts.momentsTotal));
  const weight = Math.round(total / 2);
  if (weight === 0) return [];
  return [
    weight > 0
      ? { id: "moments.brilliant", family: "maitrise", label: "Des coups d'éclat qui ont porté", weight, salience: weight >= 6 ? 6 : 2 }
      : { id: "moments.costly", family: "erreur", label: "Des erreurs qui ont coûté", weight, salience: weight <= -6 ? 6 : 2 },
  ];
};

export const ANALYZERS: readonly Analyzer[] = [tempo, tension, mastery, conduct, moments];
