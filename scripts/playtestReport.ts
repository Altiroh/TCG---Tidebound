/**
 * Banc d'essai des decks v4 — passe de stabilisation (21/09/2026), relevé
 * élargi le 22/09/2026.
 *
 * Trois relevés :
 *   1. les cinq affrontements nommés par le cadrage (swarm vs défense,
 *      Abysses vs Raison stable, Structures vs aggro, Marionnettes vs
 *      contrôle, Un Dead vs midrange) ;
 *   2. le RYTHME, toutes parties confondues : durée, Raison, coûts joués,
 *      corps posés, budget de dégâts par source ;
 *   3. un tournoi toutes rondes entre les listes compétitives.
 *
 * Chaque paire est jouée dans LES DEUX SENS, moitié-moitié : le premier
 * joueur a un avantage structurel (il pose avant), et le masquer fausserait
 * tout classement.
 *
 * AVERTISSEMENT — c'est un bot, pas un joueur. Son évaluation a été réglée
 * sur l'ANCIENNE économie de Raison : il surdépense et s'endette là où un
 * humain temporiserait. Ces chiffres disent le RYTHME et les écarts
 * GROSSIERS entre decks, pas la qualité d'un archétype.
 *
 *   npx tsx scripts/playtestReport.ts [partiesParPaire]
 *   npx tsx scripts/playtestReport.ts 60 --duel "Deck A" "Deck B"
 *   npx tsx scripts/playtestReport.ts 20 --rythme     (saute le tournoi)
 */
import { RULES } from "@/game/rules/constants";
import { DECKS } from "@/scripts/decks";
import {
  COUTS_SUIVIS,
  cumulerInvocations,
  f2,
  mesurerPartie,
  moy,
  moyenneAuTour,
  type Mesures,
} from "@/scripts/metrics";

const N = Number(process.argv[2] ?? 20);

/** Joue `n` parties, moitié dans un sens moitié dans l'autre. */
function duel(nomA: string, nomB: string, n: number) {
  const res: Mesures[] = [];
  let victoiresA = 0;
  let victoiresB = 0;
  let nuls = 0;
  for (let i = 0; i < n; i++) {
    const inverse = i % 2 === 1;
    const m = inverse ? mesurerPartie(DECKS[nomB]!, DECKS[nomA]!, 1000 + i) : mesurerPartie(DECKS[nomA]!, DECKS[nomB]!, 1000 + i);
    const gagnantEstA = inverse ? m.vainqueur === "b" : m.vainqueur === "a";
    const gagnantEstB = inverse ? m.vainqueur === "a" : m.vainqueur === "b";
    if (gagnantEstA) victoiresA += 1;
    else if (gagnantEstB) victoiresB += 1;
    else nuls += 1;
    res.push(m);
  }
  return { res, victoiresA, victoiresB, nuls };
}

const AFFRONTEMENTS: [string, string, string][] = [
  // Les cinq affrontements demandés pour la première vague de pièges.
  ["swarm Cra-Poiscail vs Structures défensives", "Grenouilles au Canon", "La Ligne Tenue"],
  ["Courlis aggro vs Structures", "Bec dans la Brume", "La Ligne Tenue"],
  ["Goliath artillerie vs Structures", "À Portée", "La Ligne Tenue"],
  ["Abysses vs Structures de contrôle de Marée", "Sous la Ligne", "La Ligne Tenue"],
  ["Structures/Sabordage miroir", "Tout Récupérer", "La Ligne Tenue"],
];

// Mode duel ciblé : `npx tsx scripts/playtestReport.ts 60 --duel "Deck A" "Deck B"`
// Sert à confirmer un signal sur un grand échantillon sans payer le tournoi.
if (process.argv.includes("--duel")) {
  const i = process.argv.indexOf("--duel");
  const [nomA, nomB] = [process.argv[i + 1]!, process.argv[i + 2]!];
  const { res, victoiresA, victoiresB, nuls } = duel(nomA, nomB, N);
  console.log(`\n${nomA}  ${victoiresA} — ${victoiresB}  ${nomB}${nuls ? ` (${nuls} nuls)` : ""}  sur ${N} parties → ${((victoiresA / N) * 100).toFixed(1)}%`);
  console.log(`Slots occupés T2/T3/T4 : ${[2, 3, 4].map((t) => f2(moyenneAuTour(res, "slotsFinDeTour", t))).join(" / ")}`);
  console.log(`Déraison : ${f2(moy(res.map((m) => m.deraison)))} pts · durée ${f2(moy(res.map((m) => m.toursParJoueur)))} tours par joueur\n`);
  process.exit(0);
}

console.log(`\n╔══ BANC D'ESSAI — ${N} parties par affrontement, bot moyen, les deux sens ══╗\n`);
console.log("## Les cinq affrontements du cadrage\n");
const global: Mesures[] = [];
for (const [label, a, b] of AFFRONTEMENTS) {
  const { res, victoiresA, victoiresB, nuls } = duel(a, b, N);
  global.push(...res);
  const pct = ((victoiresA / N) * 100).toFixed(0);
  console.log(`### ${label}`);
  console.log(`    ${a}  ${victoiresA} — ${victoiresB}  ${b}${nuls ? ` (${nuls} sans vainqueur)` : ""}   → ${pct}% pour ${a}`);
  console.log(
    `    durée : ${f2(moy(res.map((m) => m.toursParJoueur)))} tours par joueur · Déraison : ${f2(moy(res.map((m) => m.deraison)))} pts / ${f2(moy(res.map((m) => m.ancrageDeraison)))} Ancrage\n`
  );
}

rythme(global);

/**
 * LE RELEVÉ DE RYTHME. C'est lui qu'on lit pour comprendre le
 * comportement du système — pas le winrate, qui ne dit que qui gagne.
 */
function rythme(parties: Mesures[]): void {
  console.log("## Rythme, toutes parties confondues\n");
  console.log(`    Durée : ${f2(moy(parties.map((m) => m.tours)))} tours de table, soit ${f2(moy(parties.map((m) => m.toursParJoueur)))} tours par joueur`);
  console.log("    Cartes posées      T1 / T2 / T3 / T4 : " + [1, 2, 3, 4].map((t) => f2(moyenneAuTour(parties, "posesParTour", t))).join(" / "));
  console.log("    Permanents posés   T1 / T2 / T3 / T4 : " + [1, 2, 3, 4].map((t) => f2(moyenneAuTour(parties, "permanentsParTour", t))).join(" / "));
  console.log("    Slots occupés      T1 / T2 / T3 / T4 : " + [1, 2, 3, 4].map((t) => f2(moyenneAuTour(parties, "slotsFinDeTour", t))).join(" / "));

  console.log("\n    — Raison —");
  console.log(`    En début de tour, après récupération : ${f2(moy(parties.flatMap((m) => m.raisonDebutTour)))}`);
  console.log(`    Restante en rendant la main          : ${f2(moy(parties.flatMap((m) => m.raisonFinTour)))}`);
  console.log(`    Cartes en main impayables, fin de tour : ${f2(moy(parties.flatMap((m) => m.mainInjouableFinTour)))}`);
  console.log(`    Coût moyen réellement joué           : ${f2(moy(parties.flatMap((m) => m.coutsJoues)))}`);
  console.log(`    Déraison par partie                  : ${f2(moy(parties.map((m) => m.deraison)))} pts, soit ${f2(moy(parties.map((m) => m.ancrageDeraison)))} Ancrage`);

  // LE BURST À CRÉDIT. La Déraison n'a pas de plancher : c'est un emprunt
  // illimité, remboursé en Ancrage. Le total dit combien on emprunte ; ces
  // deux pics-ci disent si on le fait à petites doses ou en une fois — et
  // c'est le second cas qui remplit un plateau d'un coup, irréversiblement
  // faute de removal au catalogue.
  const pics = parties.map((m) => m.deraisonPic);
  const poses = parties.map((m) => m.posesPicUnTour);
  const depenses = parties.flatMap((m) => m.depenseParTour.filter((d) => d !== undefined));
  const part = (xs: number[], seuil: number) => `${((xs.filter((x) => x >= seuil).length / xs.length) * 100).toFixed(0)} %`;
  console.log(`    Dépense réelle par tour              : ${f2(moy(depenses))} pour un revenu de ${RULES.NATURAL_REASON_RECOVERY}`);
  console.log(`      tours à 4+ / 6+ / 8+               : ${part(depenses, 4)} / ${part(depenses, 6)} / ${part(depenses, 8)}`);
  console.log(`    Pire dette en UN tour                : ${f2(moy(pics))} en moyenne, ${Math.max(...pics)} au pire`);
  console.log(`      parties atteignant 6+ / 8+ / 10+   : ${part(pics, 6)} / ${part(pics, 8)} / ${part(pics, 10)}`);
  console.log(`    Poses en UN tour                     : ${f2(moy(poses))} en moyenne, ${Math.max(...poses)} au pire`);
  console.log(`      parties atteignant 4+ / 5+         : ${part(poses, 4)} / ${part(poses, 5)}`);

  console.log("\n    — Premier tour où un coût élevé tombe —");
  for (const c of COUTS_SUIVIS) {
    const tous = parties.flatMap((m) => m.premierCout[c]);
    console.log(`    coût ${c} : ${tous.length === 0 ? "JAMAIS" : `T${f2(moy(tous))} (dans ${tous.length}/${parties.length} parties)`}`);
  }

  console.log("\n    — Corps arrivés sans être joués (invocations) —");
  console.log(`    Par partie : ${f2(moy(parties.map((m) => m.invocations)))}`);
  console.log("    T1 / T2 / T3 / T4 : " + [1, 2, 3, 4].map((t) => f2(moyenneAuTour(parties, "invocationsParTour", t))).join(" / "));
  const sources = cumulerInvocations(parties).slice(0, 8);
  for (const { carte, total } of sources) {
    console.log(`      ${f2(total / parties.length).padStart(6)}  ${carte}`);
  }

  console.log("\n    — Autres gestes —");
  console.log(`    Capacités de Navire activées : ${f2(moy(parties.map((m) => m.capacitesNavire)))} par partie`);
  console.log(`    Réactions activées (pièges compris) : ${f2(moy(parties.map((m) => m.reactionsActivees)))} par partie`);

  // --- Budget de dégâts : la réserve d'Ancrage divisée par son débit ------
  // Une partie dure exactement le temps que met ce débit à vider cette
  // réserve. Tant que la durée moyenne ne convient pas, c'est ce tableau
  // qu'il faut lire, pas le winrate des listes.
  const postes = new Map<string, number>();
  for (const m of parties) for (const [poste, n] of Object.entries(m.ancrageParPoste)) postes.set(poste, (postes.get(poste) ?? 0) + n);
  const totalAncrage = [...postes.values()].reduce((x, y) => x + y, 0);
  console.log(`\n    — Budget de dégâts —`);
  console.log(`    Ancrage au départ, les deux joueurs : ${f2(moy(parties.map((m) => m.ancrageDepart)))}`);
  console.log(`    Ancrage perdu par partie            : ${f2(totalAncrage / parties.length)}`);
  for (const [poste, n] of [...postes.entries()].sort((a, b) => b[1] - a[1])) {
    const part = totalAncrage === 0 ? 0 : Math.round((n / totalAncrage) * 100);
    console.log(`      ${f2(n / parties.length).padStart(6)}  ${String(part).padStart(3)}%  ${poste}`);
  }
  console.log("");
}

if (process.argv.includes("--rythme")) process.exit(0);

console.log("## Tournoi toutes rondes — les listes v4\n");
const noms = Object.keys(DECKS);
const bilan: Record<string, { v: number; d: number }> = {};
for (const n of noms) bilan[n] = { v: 0, d: 0 };
const parPaire = Math.max(4, Math.round(N / 3));
for (let i = 0; i < noms.length; i++) {
  for (let j = i + 1; j < noms.length; j++) {
    const { victoiresA, victoiresB } = duel(noms[i]!, noms[j]!, parPaire);
    bilan[noms[i]!]!.v += victoiresA;
    bilan[noms[i]!]!.d += victoiresB;
    bilan[noms[j]!]!.v += victoiresB;
    bilan[noms[j]!]!.d += victoiresA;
  }
}
console.log(`    (${parPaire} parties par paire, ${(noms.length * (noms.length - 1)) / 2} paires)\n`);
const classement = noms
  .map((n) => ({ n, ...bilan[n]!, r: bilan[n]!.v / Math.max(1, bilan[n]!.v + bilan[n]!.d) }))
  .sort((x, y) => y.r - x.r);
for (const c of classement) {
  const barre = "█".repeat(Math.round(c.r * 30));
  console.log(`    ${(c.r * 100).toFixed(0).padStart(3)}%  ${barre.padEnd(30)} ${c.n}  (${c.v}V ${c.d}D)`);
}
console.log();
