/**
 * REPLAYS D'ÉQUILIBRAGE — ce qu'un changement systémique a réellement
 * changé.
 *
 * Rejouer les mêmes matchups après une modification ne dit rien si les
 * parties ne sont pas reproductibles : l'écart mesuré pourrait venir du
 * changement comme d'un tirage différent. Le banc est donc déterministe à
 * graine donnée, bot compris (`scripts/metrics.ts`).
 *
 * Ce script mesure UN changement à la fois. Il joue chaque matchup deux
 * fois sur LES MÊMES GRAINES — une fois avec, une fois sans — et affiche
 * l'écart. C'est la seule forme de comparaison qui isole le changement :
 * pas deux exécutions à des moments différents du dépôt, mais deux
 * variantes du même instant.
 *
 * Trois variantes mesurables, `--variante` :
 *   - `navires`  : les capacités de Navire câblées le 22/09/2026 ;
 *   - `structures` (défaut) : les dégâts de Marée sur les Structures.
 *   - `deraison` : une ESCALADE de la dette, éteinte dans le dépôt. Le sens
 *     s'inverse ici — le changement n'est pas encore en vigueur, donc AVANT
 *     c'est l'état courant et APRÈS c'est la variante allumée le temps du
 *     relevé. Rien n'est décidé : on regarde ce que ça déplace.
 *
 * Et il ne s'arrête pas au winrate : le cadrage demande de savoir POURQUOI
 * les parties se terminent, donc durée, occupation du plateau, dégâts par
 * source, Raison, invocations, pièges déclenchés et capacités de Navire
 * sont affichés côte à côte.
 *
 *   npx tsx scripts/replayReport.ts [parties] [--variante navires|structures]
 */
import { SHIP_DATABASE } from "@/game/environment/shipData";
import type { ShipDefinition } from "@/game/environment/types";
import { RULES } from "@/game/rules/constants";
import { DECKS, REFERENCE_DEFENSIVE } from "@/scripts/decks";
import { cumulerInvocations, f2, mesurerPartie, moy, moyenneAuTour, type Mesures } from "@/scripts/metrics";

const N = Number(process.argv[2] ?? 20);

/** Navires dont la capacité vient d'être câblée — ceux dont on veut l'effet. */
const NAVIRES_MODIFIES = ["le-brise-lames", "lerrant", "le-courlis", "la-religieuse"];

/** Ce qu'on met de côté pour obtenir l'état « avant ». */
const VARIANTE = process.argv.includes("--variante")
  ? (process.argv[process.argv.indexOf("--variante") + 1] ?? "structures")
  : "structures";

/**
 * L'escalade qu'on met à l'essai. Le 5e point plutôt que le 1er : la mesure
 * du 22/09 dit que 78 % des tours dépensent moins de 4, et ce n'est pas eux
 * qu'on cherche — c'est le tour qui achète un plateau entier d'un coup.
 */
const DERAISON_ESCALADE: ReadonlyArray<{ from: number; perPoint: number }> = [{ from: 5, perPoint: 2 }];

const LIBELLE_AVANT: Record<string, string> = {
  navires: "capacités de Navire non câblées",
  structures: "la Marée n'abîme pas les Structures",
  deraison: "dette plate, 1 Ancrage le point (règle en vigueur)",
};

const LIBELLE_APRES: Record<string, string> = {
  deraison: `dette escaladée, ${DERAISON_ESCALADE.map((t) => `${t.perPoint} à partir du point ${t.from}`).join(", ")}`,
};

/** Matchups rejoués : les mêmes que le banc d'essai, contre la référence défensive. */
const MATCHUPS = Object.keys(DECKS).filter((nom) => nom !== REFERENCE_DEFENSIVE);

interface Bilan {
  victoires: number;
  parties: Mesures[];
}

function jouer(nom: string, graines: number[]): Bilan {
  const parties: Mesures[] = [];
  let victoires = 0;
  for (const [index, graine] of graines.entries()) {
    const inverse = index % 2 === 1;
    const m = inverse
      ? mesurerPartie(DECKS[REFERENCE_DEFENSIVE]!, DECKS[nom]!, graine)
      : mesurerPartie(DECKS[nom]!, DECKS[REFERENCE_DEFENSIVE]!, graine);
    if ((inverse && m.vainqueur === "b") || (!inverse && m.vainqueur === "a")) victoires += 1;
    parties.push(m);
  }
  return { victoires, parties };
}

/**
 * Rejoue `travail` dans l'état « AVANT » de la variante mesurée.
 *
 * `SHIP_DATABASE` et `RULES` sont typées en lecture seule pour le reste du
 * projet ; c'est le seul endroit qui a besoin de les prendre à l'envers, et
 * tout est remis en place aussitôt.
 */
function avantLeChangement<T>(travail: () => T): T {
  // L'escalade est éteinte dans le dépôt : l'état « avant », c'est
  // simplement l'état courant, rien à mettre de côté.
  if (VARIANTE === "deraison") return travail();

  if (VARIANTE === "structures") {
    const regles = RULES as { TIDE_STRUCTURE_DAMAGE: Partial<Record<string, number>> };
    const memoire = regles.TIDE_STRUCTURE_DAMAGE;
    regles.TIDE_STRUCTURE_DAMAGE = {};
    try {
      return travail();
    } finally {
      regles.TIDE_STRUCTURE_DAMAGE = memoire;
    }
  }

  const base = SHIP_DATABASE as Map<string, ShipDefinition>;
  const memoire = new Map<string, ShipDefinition>();
  for (const id of NAVIRES_MODIFIES) {
    const ship = base.get(id);
    if (!ship?.activatableAbility) continue;
    memoire.set(id, ship);
    base.set(id, { ...ship, activatableAbility: undefined });
  }
  try {
    return travail();
  } finally {
    for (const [id, ship] of memoire) base.set(id, ship);
  }
}

/**
 * Rejoue `travail` avec la variante ALLUMÉE, pour les leviers qui ne sont
 * pas encore en vigueur. Pour les autres, l'état « après » est le dépôt tel
 * quel et cette fonction ne fait rien.
 */
function apresLeChangement<T>(travail: () => T): T {
  if (VARIANTE !== "deraison") return travail();
  const regles = RULES as { DERAISON_ANCHOR_DAMAGE_TIERS: ReadonlyArray<{ from: number; perPoint: number }> };
  const memoire = regles.DERAISON_ANCHOR_DAMAGE_TIERS;
  regles.DERAISON_ANCHOR_DAMAGE_TIERS = DERAISON_ESCALADE;
  try {
    return travail();
  } finally {
    regles.DERAISON_ANCHOR_DAMAGE_TIERS = memoire;
  }
}

const graines = Array.from({ length: N }, (_, i) => 3000 + i);

function resume(bilan: Bilan) {
  const { parties } = bilan;
  const postes = new Map<string, number>();
  for (const m of parties) for (const [poste, n] of Object.entries(m.ancrageParPoste)) postes.set(poste, (postes.get(poste) ?? 0) + n);
  return {
    winrate: (bilan.victoires / parties.length) * 100,
    tours: moy(parties.map((m) => m.toursParJoueur)),
    slotsT3: moyenneAuTour(parties, "slotsFinDeTour", 3),
    raisonFin: moy(parties.flatMap((m) => m.raisonFinTour)),
    mainBloquee: moy(parties.flatMap((m) => m.mainInjouableFinTour)),
    coutMoyen: moy(parties.flatMap((m) => m.coutsJoues)),
    invocations: moy(parties.map((m) => m.invocations)),
    reactions: moy(parties.map((m) => m.reactionsActivees)),
    navire: moy(parties.map((m) => m.capacitesNavire)),
    combat: (postes.get("Combat") ?? 0) / parties.length,
    maree: (postes.get("Marée") ?? 0) / parties.length,
    deraison: (postes.get("Déraison") ?? 0) / parties.length,
    dettePic: moy(parties.map((m) => m.deraisonPic)),
    posesPic: moy(parties.map((m) => m.posesPicUnTour)),
  };
}

const COLONNES: Array<[string, keyof ReturnType<typeof resume>]> = [
  ["winrate %", "winrate"],
  ["tours/j", "tours"],
  ["slots T3", "slotsT3"],
  ["Raison fin", "raisonFin"],
  ["main bloq.", "mainBloquee"],
  ["coût moy.", "coutMoyen"],
  ["invoc.", "invocations"],
  ["réactions", "reactions"],
  ["cap. Navire", "navire"],
  ["dgt combat", "combat"],
  ["dgt Marée", "maree"],
  ["dgt Déraison", "deraison"],
  ["pic dette", "dettePic"],
  ["pic poses", "posesPic"],
];

console.log(`\n╔══ REPLAYS — ${N} parties par matchup, contre ${REFERENCE_DEFENSIVE}, mêmes graines des deux côtés ══╗\n`);
console.log(`    AVANT = ${LIBELLE_AVANT[VARIANTE] ?? VARIANTE} · APRÈS = ${LIBELLE_APRES[VARIANTE] ?? "état courant du dépôt"}\n`);

const cumulAvant: Mesures[] = [];
const cumulApres: Mesures[] = [];

for (const nom of MATCHUPS) {
  const avant = avantLeChangement(() => jouer(nom, graines));
  const apres = apresLeChangement(() => jouer(nom, graines));
  cumulAvant.push(...avant.parties);
  cumulApres.push(...apres.parties);

  const a = resume(avant);
  const b = resume(apres);
  const bouge = COLONNES.filter(([, cle]) => Math.abs(b[cle] - a[cle]) >= 0.05);

  console.log(`### ${nom}`);
  console.log(`    winrate ${f2(a.winrate)} % → ${f2(b.winrate)} %   ·   durée ${f2(a.tours)} → ${f2(b.tours)} tours par joueur`);
  if (bouge.length === 0) {
    console.log("    aucun écart mesurable sur les autres indicateurs.");
  } else {
    for (const [etiquette, cle] of bouge) {
      const delta = b[cle] - a[cle];
      console.log(`      ${etiquette.padEnd(13)} ${f2(a[cle]).padStart(7)} → ${f2(b[cle]).padStart(7)}   (${delta > 0 ? "+" : ""}${f2(delta)})`);
    }
  }
  console.log("");
}

console.log("## Toutes parties confondues\n");
const a = resume({ victoires: 0, parties: cumulAvant });
const b = resume({ victoires: 0, parties: cumulApres });
for (const [etiquette, cle] of COLONNES) {
  if (cle === "winrate") continue;
  const delta = b[cle] - a[cle];
  const marque = Math.abs(delta) >= 0.05 ? (delta > 0 ? "  ↑" : "  ↓") : "";
  console.log(`    ${etiquette.padEnd(13)} ${f2(a[cle]).padStart(7)} → ${f2(b[cle]).padStart(7)}   (${delta > 0 ? "+" : ""}${f2(delta)})${marque}`);
}

console.log("\n    Invocations par carte, après :");
for (const { carte, total } of cumulerInvocations(cumulApres).slice(0, 6)) {
  console.log(`      ${f2(total / cumulApres.length).padStart(6)}  ${carte}`);
}
console.log("");
