/**
 * AUDIT FONCTIONNEL DU CATALOGUE — ce que le jeu sait faire, et ce qu'il ne
 * sait pas encore.
 *
 * Pas un audit d'équilibrage : un audit de COUVERTURE. La question n'est
 * pas « cette carte est-elle trop forte » mais « ce geste existe-t-il, et
 * combien de cartes le rendent accessible ». Un trou de couverture ne se
 * voit pas au winrate — il se voit quand un joueur cherche une réponse et
 * qu'aucune carte ne la porte.
 *
 * Chaque axe est défini par un CRITÈRE MÉCANIQUE lisible dans la donnée,
 * jamais par une lecture de texte : ce qui compte est ce que le moteur fait,
 * pas ce que la carte raconte. Le seuil qui sépare « correct », « faible »
 * et « trou » est arbitraire et affiché — il est là pour trier, pas pour
 * trancher.
 *
 *   npx tsx scripts/catalogCoverage.ts
 */
import { CORE_SET } from "@/game/cards/sets/core";
import { isPermanentCard, UNIT_CARD_TYPES, type CardDefinition } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { TriggeredAbility } from "@/game/cards/types";

/** Tous les effets d'une carte, d'où qu'ils viennent. */
function tousLesEffets(def: CardDefinition): EffectDefinition[] {
  return [
    ...(def.onPlayEffects ?? []),
    ...(def.onBreakEffects ?? []),
    ...(def.abilities ?? []).flatMap((a) => a.effects),
    ...(def.activatableOncePerTurn?.effects ?? []),
  ];
}

const capacites = (def: CardDefinition): TriggeredAbility[] => def.abilities ?? [];
const aEffet = (def: CardDefinition, type: string) => tousLesEffets(def).some((e) => e.type === type);
const aDeclencheur = (def: CardDefinition, triggers: string[]) => capacites(def).some((a) => triggers.includes(a.trigger));

/** Un axe de couverture : son critère, et ce qu'on en attend. */
interface Axe {
  nom: string;
  /** Ce que l'axe recouvre, en une phrase — le lecteur ne doit pas deviner le critère. */
  critere: string;
  /** Seuil en dessous duquel la couverture est jugée FAIBLE. */
  attendu: number;
  retient: (def: CardDefinition) => boolean;
}

const AXES: Axe[] = [
  {
    nom: "Soin de Marin / Créature",
    critere: "un effet `heal` qui vise une UNITÉ (pas le Navire)",
    attendu: 4,
    retient: (def) =>
      tousLesEffets(def).some(
        (e) => e.type === "heal" && e.target.kind !== "controllerPlayer" && e.target.kind !== "opponentPlayer" && e.target.kind !== "allPlayers"
      ),
  },
  {
    nom: "Soin d'Ancrage (Navire)",
    critere: "un effet `heal` qui vise un JOUEUR",
    attendu: 4,
    retient: (def) =>
      tousLesEffets(def).some(
        (e) => e.type === "heal" && (e.target.kind === "controllerPlayer" || e.target.kind === "opponentPlayer" || e.target.kind === "allPlayers")
      ),
  },
  {
    // ATTENTION au piège de lecture : la plupart des `destroy`/`saborde` du
    // catalogue visent `self` — c'est un piège qui se consume, pas un
    // removal. Ne comptent ici que les effets qui retirent la carte D'UN
    // AUTRE permanent.
    nom: "Removal — retirer un permanent ADVERSE",
    critere: "`destroy`/`saborde` visant autre chose que soi-même ou son propre porteur",
    attendu: 5,
    retient: (def) =>
      tousLesEffets(def).some(
        (e) => (e.type === "destroy" || e.type === "saborde") && e.target.kind !== "self" && e.target.kind !== "equippedUnit"
      ),
  },
  {
    nom: "Removal par les dégâts (pseudo-removal)",
    critere: "`damage` sur une unité DÉSIGNÉE — la seule façon actuelle de retirer un corps hors combat",
    attendu: 8,
    retient: (def) => tousLesEffets(def).some((e) => e.type === "damage" && e.target.kind === "chosenUnit"),
  },
  {
    nom: "Anti-swarm",
    critere: "un effet qui frappe TOUTES les unités adverses, ou dont le montant se compte sur le nombre d'unités",
    attendu: 5,
    retient: (def) =>
      tousLesEffets(def).some(
        (e) =>
          (e.target.kind === "allEnemyUnits" || e.target.kind === "allUnits") ||
          (e.amount?.kind === "unitCount")
      ),
  },
  {
    nom: "Défense réactive (pièges)",
    critere: "une capacité qui répond à une attaque déclarée — fenêtre d'interception",
    attendu: 6,
    retient: (def) => aDeclencheur(def, ["onIncomingDirectAttack", "onUnitAttackDeclared"]),
  },
  {
    nom: "Interaction pendant le tour adverse",
    critere: "une capacité facultative sur un déclencheur qui peut survenir hors de son tour",
    attendu: 8,
    retient: (def) =>
      capacites(def).some(
        (a) =>
          (a.mode ?? "auto") === "optional" &&
          ["onIncomingDirectAttack", "onUnitAttackDeclared", "onCardPlayed", "onEnterPlay", "onTideAnnounced", "onDeath"].includes(a.trigger)
      ),
  },
  {
    nom: "Comeback (récompense d'être en retard)",
    critere: "une capacité conditionnée à un Ancrage/une Raison bas, ou un montant compté sur SON propre plateau",
    attendu: 4,
    retient: (def) =>
      JSON.stringify(def).includes("anchorAtMost") ||
      JSON.stringify(def).includes("reasonAtMost") ||
      tousLesEffets(def).some((e) => e.amount?.kind === "unitCount" && e.amount.of === "controller"),
  },
  {
    nom: "Alternatives de pioche",
    critere: "`draw`, ou une remontée du Cimetière vers la main",
    attendu: 8,
    retient: (def) => aEffet(def, "draw") || aEffet(def, "moveGraveyardCardToHand") || aEffet(def, "moveZone"),
  },
  {
    nom: "Gain de Raison (rampe)",
    critere: "`reasonGain`, ou une réduction de coût",
    attendu: 5,
    retient: (def) => aEffet(def, "reasonGain") || aEffet(def, "discountNextCards"),
  },
  {
    nom: "Contrôle de Marée",
    critere: "un effet qui touche l'état, la durée, l'intensité ou l'orientation de la Marée",
    attendu: 8,
    retient: (def) => tousLesEffets(def).some((e) => e.type.startsWith("tide")),
  },
];

const f1 = (n: number) => n.toFixed(1);

console.log("\n╔══ AUDIT FONCTIONNEL DU CATALOGUE ══╗\n");
console.log(`    ${CORE_SET.length} cartes, dont ${CORE_SET.filter(isPermanentCard).length} permanents`);
console.log(`    et ${CORE_SET.filter((d) => UNIT_CARD_TYPES.includes(d.type)).length} unités.\n`);

console.log("## Couverture par axe\n");
const verdicts: Array<{ axe: Axe; cartes: CardDefinition[] }> = AXES.map((axe) => ({
  axe,
  cartes: CORE_SET.filter(axe.retient),
}));

for (const { axe, cartes } of verdicts) {
  const verdict = cartes.length === 0 ? "TROU" : cartes.length < axe.attendu ? "FAIBLE" : "correct";
  console.log(`### ${axe.nom} — ${cartes.length} carte(s) · ${verdict} (attendu ≥ ${axe.attendu})`);
  console.log(`    critère : ${axe.critere}`);
  if (cartes.length > 0) {
    console.log(`    ${cartes.map((c) => `${c.name} (${c.cost})`).join(", ")}`);
  }
  console.log("");
}

console.log("## Synthèse\n");
for (const étiquette of ["TROU", "FAIBLE", "correct"] as const) {
  const liste = verdicts.filter(({ axe, cartes }) => (cartes.length === 0 ? "TROU" : cartes.length < axe.attendu ? "FAIBLE" : "correct") === étiquette);
  if (liste.length === 0) continue;
  console.log(`    ${étiquette} : ${liste.map(({ axe }) => axe.nom).join(" · ")}`);
}

// --- Les coûts élevés ont-ils de quoi être joués ? -----------------------
// Le banc d'essai dit qu'aucune carte à 5 et plus n'est jamais jouée. Deux
// causes possibles, et elles n'appellent pas la même réponse : ou bien il
// n'existe pas de carte à ce prix, ou bien il en existe et l'économie de
// Raison ne les atteint pas.
console.log("\n## Distribution des coûts\n");
const parCout = new Map<number, CardDefinition[]>();
for (const def of CORE_SET) {
  const liste = parCout.get(def.cost) ?? [];
  liste.push(def);
  parCout.set(def.cost, liste);
}
const couts = [...parCout.keys()].sort((a, b) => a - b);
for (const cout of couts) {
  const cartes = parCout.get(cout)!;
  const barre = "█".repeat(Math.round((cartes.length / CORE_SET.length) * 60));
  console.log(`    ${String(cout).padStart(2)}  ${String(cartes.length).padStart(3)}  ${f1((cartes.length / CORE_SET.length) * 100).padStart(5)}%  ${barre}`);
}
const chers = CORE_SET.filter((d) => d.cost >= 5);
console.log(`\n    ${chers.length} cartes à 5 Raison ou plus (${f1((chers.length / CORE_SET.length) * 100)} % du catalogue).`);
console.log(`    ${chers.map((c) => `${c.name} (${c.cost})`).join(", ")}`);

// --- Fenêtres rares -----------------------------------------------------
// Une capacité dont le déclencheur ne survient presque jamais est une carte
// morte sans que rien ne le signale : elle passe la conformité, elle passe
// les tests, et elle ne se produit pas.
console.log("\n## Fenêtres d'utilisation potentiellement trop rares\n");
const RARES = new Set([
  "onTideStateExited",
  "onReturnedToHand",
  "onBecomeOnlyCreature",
  "onPowerGained",
  "onCardRecoveredFromGraveyard",
  "onExpire",
]);
const parDeclencheur = new Map<string, CardDefinition[]>();
for (const def of CORE_SET) {
  for (const ability of capacites(def)) {
    const liste = parDeclencheur.get(ability.trigger) ?? [];
    if (!liste.includes(def)) liste.push(def);
    parDeclencheur.set(ability.trigger, liste);
  }
}
for (const [trigger, cartes] of [...parDeclencheur.entries()].sort((a, b) => a[1].length - b[1].length)) {
  const marque = RARES.has(trigger) ? "  ← fenêtre rare par nature" : "";
  console.log(`    ${String(cartes.length).padStart(3)}  ${trigger.padEnd(30)}${marque}`);
  if (RARES.has(trigger)) console.log(`         ${cartes.map((c) => c.name).join(", ")}`);
}
console.log("");
