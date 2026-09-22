/**
 * AUDIT DU SWARM — d'où viennent les corps, et ce qu'ils coûtent vraiment.
 *
 * Question posée (22/09/2026) : ralentir la récupération de Raison ne
 * ralentit pas assez les listes swarm, parce que leurs corps n'arrivent pas
 * par la main mais par des INVOCATIONS. Avant de toucher au catalogue, il
 * faut savoir ce que le catalogue contient réellement.
 *
 * Deux moitiés, et elles se répondent :
 *   1. le RELEVÉ STATIQUE — toutes les cartes qui produisent un corps sans
 *      le payer à la pièce, ce qu'elles produisent, à quel prix, et donc le
 *      coût RÉEL d'un corps pour chacune ;
 *   2. le RELEVÉ MESURÉ — ce que ça donne en partie : invocations par
 *      partie, par tour, Slots occupés T1/T2/T3, contre la référence
 *      défensive.
 *
 *   npx tsx scripts/swarmReport.ts [parties]
 */
import { CORE_SET, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import { DECKS, REFERENCE_DEFENSIVE } from "@/scripts/decks";
import { cumulerInvocations, f2, mesurerPartie, moy, moyenneAuTour, type Mesures } from "@/scripts/metrics";

const N = Number(process.argv[2] ?? 12);

interface SourceDeCorps {
  carte: CardDefinition;
  /** Où l'effet est accroché : arrivée, Bris, capacité déclenchée… */
  ou: string;
  /** Identifiant du corps produit. */
  jeton: string;
  /** Nombre de corps produits par résolution. */
  corps: number;
  /** Les corps arrivent-ils avec Pied marin (capables d'attaquer tout de suite) ? */
  piedMarin: boolean;
  /** L'effet est-il facultatif (le joueur peut refuser) ? */
  facultatif: boolean;
}

/** Toutes les cartes du catalogue dont un effet fait arriver un corps. */
function sourcesDeCorps(): SourceDeCorps[] {
  const trouvees: SourceDeCorps[] = [];

  for (const carte of CORE_SET) {
    const paquets: Array<{ ou: string; effets: readonly EffectDefinition[] | undefined; facultatif: boolean }> = [
      { ou: "arrivée", effets: carte.onPlayEffects, facultatif: false },
      { ou: "Bris", effets: carte.onBreakEffects, facultatif: false },
      ...(carte.abilities ?? []).map((ability) => ({
        ou: ability.trigger,
        effets: ability.effects,
        facultatif: (ability.mode ?? "auto") === "optional",
      })),
    ];

    for (const { ou, effets, facultatif } of paquets) {
      for (const effet of effets ?? []) {
        if (effet.type !== "summon" || !effet.cardId) continue;
        trouvees.push({
          carte,
          ou,
          jeton: effet.cardId,
          corps: effet.count ?? 1,
          piedMarin: Boolean(effet.rush),
          facultatif,
        });
      }
    }
  }

  return trouvees;
}

/**
 * Coût RÉEL d'un corps pour cette carte.
 *
 * Un Objet Brisé DEPUIS LA MAIN ne coûte pas son coût imprimé mais la
 * moitié arrondie au supérieur (règle prototype, `handBreakCost`) : c'est
 * ce prix-là qu'il faut comparer, pas celui de la carte.
 */
function coutParCorps(source: SourceDeCorps): { paye: number; parCorps: number } {
  const brisDepuisLaMain = source.ou === "Bris" && source.carte.type === "objet";
  const paye = brisDepuisLaMain ? Math.max(1, Math.ceil(source.carte.cost / 2)) : source.carte.cost;
  return { paye, parCorps: paye / source.corps };
}

console.log(`\n╔══ AUDIT DU SWARM ══╗\n`);
console.log("## 1. Relevé statique — les sources de corps du catalogue\n");

const sources = sourcesDeCorps();
if (sources.length === 0) console.log("    Aucune carte du catalogue ne produit de corps.\n");

// Regroupées par carte : Le Seau porte DEUX effets d'invocation, il ne doit
// pas compter deux fois comme deux cartes.
const parCarte = new Map<string, SourceDeCorps[]>();
for (const source of sources) {
  const liste = parCarte.get(source.carte.id) ?? [];
  liste.push(source);
  parCarte.set(source.carte.id, liste);
}

const lignes = [...parCarte.entries()].map(([id, liste]) => {
  const carte = liste[0]!.carte;
  const corps = liste.reduce((somme, source) => somme + source.corps, 0);
  const { paye, parCorps } = coutParCorps({ ...liste[0]!, corps });
  return {
    id,
    nom: carte.name,
    type: carte.type,
    cout: carte.cost,
    ou: [...new Set(liste.map((source) => source.ou))].join(" + "),
    jeton: liste[0]!.jeton,
    corps,
    paye,
    parCorps,
    piedMarin: liste.some((source) => source.piedMarin),
    facultatif: liste.every((source) => source.facultatif),
  };
});
lignes.sort((a, b) => a.parCorps - b.parCorps);

console.log("    coût réel / corps · carte · corps produits · où · particularités");
for (const l of lignes) {
  const jeton = getCardDefinition(l.jeton);
  const marques = [l.piedMarin ? "Pied marin" : "", l.facultatif ? "facultatif" : ""].filter(Boolean).join(", ");
  console.log(
    `    ${f2(l.parCorps).padStart(5)}  ${l.nom.padEnd(24)} ${String(l.corps)} × ${jeton.name} (${jeton.attack ?? 0}/${jeton.health ?? 0})` +
      `  [${l.type} ${l.cout}, payé ${l.paye}, ${l.ou}]${marques ? `  — ${marques}` : ""}`
  );
}

// Slots : un corps invoqué occupe un Slot comme n'importe quel permanent.
// C'est la vraie limite du swarm, et elle est déjà dans le moteur.
console.log(`\n    Les corps invoqués occupent un Slot : l'invocation s'arrête aux Slots libres du Navire`);
console.log(`    (4 pour Le Courlis, 5 pour L'Errant/La Religieuse/Le Goliath, 6 pour Le Brise-Lames).`);
console.log(`    Tous les corps produits par le catalogue actuel sont des ${getCardDefinition(lignes[0]?.jeton ?? "peon-cra-poiscail").name}.\n`);

console.log("## 2. Relevé mesuré — ce que ça donne en partie\n");

/** Listes à confronter à la référence défensive, la plus exposée au swarm en premier. */
const A_MESURER = ["Grenouilles au Canon", "Le Banc Déborde", "Les Petits Attendent"].filter((nom) => nom in DECKS);

for (const nom of A_MESURER) {
  const parties: Mesures[] = [];
  let victoires = 0;
  for (let i = 0; i < N; i += 1) {
    const inverse = i % 2 === 1;
    const m = inverse
      ? mesurerPartie(DECKS[REFERENCE_DEFENSIVE]!, DECKS[nom]!, 2000 + i)
      : mesurerPartie(DECKS[nom]!, DECKS[REFERENCE_DEFENSIVE]!, 2000 + i);
    if ((inverse && m.vainqueur === "b") || (!inverse && m.vainqueur === "a")) victoires += 1;
    parties.push(m);
  }

  console.log(`### ${nom} contre ${REFERENCE_DEFENSIVE} — ${victoires}/${N} victoires`);
  console.log(`    Invocations par partie : ${f2(moy(parties.map((m) => m.invocations)))}`);
  console.log(`    Invocations T1/T2/T3   : ${[1, 2, 3].map((t) => f2(moyenneAuTour(parties, "invocationsParTour", t))).join(" / ")}`);
  console.log(`    Permanents posés T1/T2/T3 : ${[1, 2, 3].map((t) => f2(moyenneAuTour(parties, "permanentsParTour", t))).join(" / ")}`);
  console.log(`    Slots occupés T1/T2/T3    : ${[1, 2, 3].map((t) => f2(moyenneAuTour(parties, "slotsFinDeTour", t))).join(" / ")}`);
  console.log(`    Durée : ${f2(moy(parties.map((m) => m.toursParJoueur)))} tours par joueur`);
  const top = cumulerInvocations(parties).slice(0, 4);
  for (const { carte, total } of top) console.log(`      ${f2(total / parties.length).padStart(6)}  ${carte}`);
  console.log("");
}
