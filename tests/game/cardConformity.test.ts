/**
 * Conformité du catalogue : le TEXTE d'une carte est la source de vérité
 * (Notion « Catalogue de cartes »), et sa définition (`abilities`,
 * `onPlayEffects`, `onBreakEffects`, champs de données) doit le réaliser.
 *
 * Ces règles lisent chaque `text` et vérifient que la structure de la
 * définition y répond : un « Une fois par tour » a bien une clé
 * `oncePerTurnKey`, un « Sabordage : » a bien un déclencheur `onSaborde`,
 * une « Durée : 3 tours » a bien `durationTurns: 3`, etc. Elles ne
 * remplacent pas un test de comportement par carte, mais elles arrêtent
 * les oublis les plus fréquents au moment où une carte est ajoutée.
 *
 * Une carte peut s'écarter d'une règle pour une raison de design ou de
 * moteur DOCUMENTÉE : elle est alors listée dans `EXCEPTIONS` avec le motif.
 * Ajouter une exception sans motif est refusé par le test lui-même.
 */
import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game/cards/sets/core";
import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { TriggerType } from "@/game/triggers/types";

type RuleId =
  | "once-per-turn"
  | "once-ever"
  | "optional"
  | "saborde"
  | "break"
  | "equip"
  | "duration"
  | "visibility"
  | "trigger"
  | "keyword"
  | "amounts"
  | "cost"
  | "cimetiere"
  | "pied-marin"
  | "designation"
  | "observateur";

/**
 * Écarts assumés, avec leur motif. La clé est `${cardId}:${rule}`.
 * Un motif vide fait échouer le test : on documente, on ne contourne pas.
 */
const EXCEPTIONS: Record<string, string> = {
  "cylindre-flottant:optional":
    "Contrecoup résolu d'office (décision du 16/09/2026) : annuler des dégâts et les renvoyer n'est jamais un désavantage.",
  "cylindre-flottant:once-per-turn":
    "« la première fois à chaque tour » est inhérent : la carte se brise après son unique Contrecoup.",
  "ancre-de-derive:optional":
    "Sabordage et report résolus d'office au changement de Marée (décision du 16/09/2026) : la carte n'a pas d'autre usage.",
};

interface Violation {
  cardId: string;
  rule: RuleId;
  detail: string;
}

const TIDE_WORDS: Array<[RegExp, "calme" | "houle" | "tempete" | "abysses"]> = [
  [/\bCalme\b/, "calme"],
  [/\bHoule\b/, "houle"],
  [/\bTemp[êe]te\b/, "tempete"],
  [/\bAbysses\b/, "abysses"],
];

function allEffects(def: CardDefinition): EffectDefinition[] {
  return [
    ...(def.onPlayEffects ?? []),
    ...(def.onBreakEffects ?? []),
    ...(def.abilities ?? []).flatMap((a) => a.effects),
    ...(def.activatableOncePerTurn?.effects ?? []),
  ];
}

function triggers(def: CardDefinition): TriggerType[] {
  return (def.abilities ?? []).map((a) => a.trigger);
}

function hasTrigger(def: CardDefinition, ...wanted: TriggerType[]): boolean {
  return triggers(def).some((t) => wanted.includes(t));
}

/** Un champ de données « une fois par tour » posé directement sur la carte (boucliers, taxes, plafonds…). */
function hasOncePerTurnField(def: CardDefinition): boolean {
  return Object.keys(def).some((key) => /PerTurn/.test(key));
}

/** La carte quitte le board (ou détruit son Équipement) après son unique usage : « la première fois » est alors inhérent. */
function selfConsuming(def: CardDefinition): boolean {
  return Boolean(def.destructionSubstitute) || Object.keys(def).some((key) => /ThenDestroy|contrecoup/i.test(key));
}

/** Tous les nombres portés par la définition, à toute profondeur (tideAffinity, champs composés…). */
function deepNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(Math.abs(value));
  else if (Array.isArray(value)) value.forEach((v) => deepNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => deepNumbers(v, out));
  return out;
}

function amountsOf(effects: EffectDefinition[]): number[] {
  const values: number[] = [];
  for (const e of effects) {
    for (const amount of [e.amount, e.attackAmount, e.healthAmount]) {
      if (amount?.value !== undefined) values.push(Math.abs(amount.value));
    }
  }
  return values;
}

/** Nombres cités dans le texte pour une ressource (« récupérez 2 Raison », « perdez 1 Raison », « +2 Puissance »). */
function textAmounts(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((m) => Number(m[1]));
}

function check(def: CardDefinition): Violation[] {
  const out: Violation[] = [];
  const text = def.text ?? "";
  const effects = allEffects(def);
  const abilities: TriggeredAbility[] = def.abilities ?? [];
  const push = (rule: RuleId, detail: string) => out.push({ cardId: def.id, rule, detail });

  // --- Fréquence -----------------------------------------------------------
  if (/(une (seule )?fois par tour|la premi[èe]re fois [àa] chaque tour|maximum 1 fois par tour|1x par tour)/i.test(text)) {
    const inherent = abilities.some((a) => a.trigger === "startOfTurn" || a.trigger === "endOfTurn");
    const ok = abilities.some((a) => a.oncePerTurnKey) || hasOncePerTurnField(def) || Boolean(def.activatableOncePerTurn) || inherent;
    if (!ok) push("once-per-turn", "le texte limite l'effet à une fois par tour, mais aucune capacité n'a `oncePerTurnKey` (ni champ *PerTurn*)");
  }
  if (/la premi[èe]re fois qu/i.test(text) && !/([àa] chaque tour|pendant son tour|chacun de (vos|ses) tours|par tour)/i.test(text)) {
    if (!abilities.some((a) => a.onceEver) && !selfConsuming(def) && !hasOncePerTurnField(def)) push("once-ever", "« la première fois que… » sans « à chaque tour » : il manque `onceEver: true`");
  }

  // --- Facultatif ----------------------------------------------------------
  if (/vous pouvez/i.test(text)) {
    const optional = abilities.some((a) => a.mode === "optional") || Boolean(def.activatableOncePerTurn);
    if (!optional) push("optional", "« vous pouvez » sans capacité `mode: \"optional\"` : l'effet se résout d'office");
  }

  // --- Désignation : jamais d'effet automatique sur une cible choisie ------
  // Décision du 17/09/2026 : « jamais automatique, le joueur choisit, et le
  // joueur peut choisir de ne pas appliquer un effet ». Une capacité
  // DÉCLENCHÉE qui vise une unité désignée (`chosenUnit`) doit donc passer
  // par une fenêtre de réaction (`mode: "optional"`) et non laisser le
  // moteur pointer une cible à la place du joueur. Ne concerne pas les
  // effets de POSE ni `activatableOncePerTurn` : le joueur y désigne déjà
  // sa cible en jouant la carte ou en activant la capacité.
  for (const [index, ability] of abilities.entries()) {
    if ((ability.mode ?? "auto") !== "auto") continue;
    if (!ability.effects.some((e) => e.target.kind === "chosenUnit")) continue;
    push("designation", `capacité #${index} (${ability.trigger}) vise une unité désignée mais se résout d'office : il faut mode: "optional"`);
  }

  // --- Observateurs : un déclencheur qui vise une AUTRE carte ---------------
  // Ces trois déclencheurs portent l'instance de la carte qui vient de
  // partir (l'Objet brisé, la carte défaussée, celle repêchée) : elle n'est
  // plus sur le plateau quand l'événement part, donc le circuit
  // « personnel » de `triggerBus.ts` ne trouve rien. Sans `triggeredBy`, la
  // capacité n'est collectée par AUCUN circuit et ne se déclenche jamais —
  // c'est exactement ce qui rendait les deux Cra-Poiscail Médecin inertes.
  const OBSERVER_ONLY: TriggerType[] = ["onObjectBroken", "onCardDiscardedFromHand", "onCardRecoveredFromGraveyard"];
  for (const [index, ability] of abilities.entries()) {
    if (!OBSERVER_ONLY.includes(ability.trigger) || ability.triggeredBy) continue;
    push("observateur", `capacité #${index} (${ability.trigger}) : un déclencheur d'observateur sans triggeredBy ne se déclenche jamais`);
  }

  // --- Sabordage / Bris ----------------------------------------------------
  if (/\bSabordage\s*:/i.test(text) && !hasTrigger(def, "onSaborde")) {
    push("saborde", "« Sabordage : » sans déclencheur `onSaborde`");
  }
  if (/Brisez cet Objet/i.test(text)) {
    if (def.type !== "objet") push("break", "« Brisez cet Objet » sur une carte qui n'est pas un Objet");
    if (!def.onBreakEffects?.length) push("break", "« Brisez cet Objet » sans `onBreakEffects`");
  }

  // --- Équipement ----------------------------------------------------------
  const equip = /[ÉE]quipez (une?|un) (Marin|Cr[ée]ature|Structure|permanent|unit[ée])/i.exec(text);
  if (equip) {
    if (def.type !== "equipement") push("equip", "« Équipez » sur une carte qui n'est pas un Équipement");
    if (!(def.onPlayEffects ?? []).some((e) => e.type === "attachEquipment")) push("equip", "« Équipez » sans effet `attachEquipment` à la pose");
    const target = equip[2]!.toLowerCase();
    const types = def.equipTargetTypes ?? [];
    if (target === "structure" && !types.includes("structure")) push("equip", "« Équipez une Structure » sans `equipTargetTypes: [\"structure\"]`");
    if (target === "marin" && types.length > 0 && !types.includes("marin")) push("equip", "« Équipez un Marin » mais `equipTargetTypes` exclut les Marins");
    if (/cr[ée]ature/.test(target) && types.length > 0 && !types.includes("creature")) push("equip", "« Équipez une Créature » mais `equipTargetTypes` exclut les Créatures");
  }

  // --- Durée / visibilité --------------------------------------------------
  const duration = /(?:Dur[ée]e\s*:|Pendant)\s*(\d+)\s*tours?/i.exec(text);
  if (duration && def.durationTurns !== Number(duration[1])) {
    push("duration", `« Durée : ${duration[1]} tours » mais durationTurns = ${def.durationTurns ?? "absent"}`);
  }
  if (!duration && def.durationTurns !== undefined) push("duration", `durationTurns = ${def.durationTurns} mais le texte n'annonce aucune durée`);

  const visible = /Visible\s*(?:uniquement\s*)?(?:pendant|:)\s*([^.]+)\./i.exec(text);
  if (visible) {
    const clause = visible[1]!;
    if (/toutes les Mar[ée]es/i.test(clause)) {
      if (def.visibleDuringTide && def.visibleDuringTide.length < 4) push("visibility", "« toutes les Marées » mais `visibleDuringTide` en exclut");
    } else {
      const named = TIDE_WORDS.filter(([re]) => re.test(clause)).map(([, s]) => s);
      const declared = [...(def.visibleDuringTide ?? [])].sort();
      if (named.length > 0 && JSON.stringify([...named].sort()) !== JSON.stringify(declared)) {
        push("visibility", `le texte annonce [${named.join(", ")}] mais visibleDuringTide = [${declared.join(", ")}]`);
      }
    }
  } else if (def.visibleDuringTide && !/visible/i.test(text)) {
    push("visibility", "`visibleDuringTide` posé mais le texte ne parle pas de visibilité");
  }

  // --- Déclencheurs annoncés par le texte ------------------------------------
  const expects: Array<[RegExp, TriggerType[], string]> = [
    [/[ÀA] son arriv[ée]e/i, ["onEnterPlay"], "« À son arrivée »"],
    [/Lorsqu'(elle|il) devient visible/i, ["onBecomeVisible"], "« Lorsqu'elle devient visible »"],
    [/[ÀA] (votre|chaque) d[ée]but de tour/i, ["startOfTurn"], "« À votre début de tour »"],
    [/[ÀA] (chaque )?fin de (votre )?tour/i, ["endOfTurn"], "« À la fin de votre tour »"],
    [/Quand (il|elle) est d[ée]truit/i, ["onDeath"], "« Quand il est détruit »"],
    [/Lorsqu'(il|elle) (expire|quitte le board)/i, ["onExpire", "onDeath", "onSaborde"], "« Lorsqu'il quitte le board »"],
    [/Lorsqu'(il|elle) attaque|Quand (il|elle) attaque/i, ["onAttack"], "« Lorsqu'il attaque »"],
    [/(Lorsqu'|Quand )(il|elle) subit des d[ée]g[âa]ts/i, ["onDamaged"], "« Lorsqu'il subit des dégâts »"],
  ];
  for (const [re, wanted, label] of expects) {
    if (!re.test(text)) continue;
    // « À son arrivée » peut aussi se réaliser par `onPlayEffects` (pose depuis la main) ou `summon` (invocation).
    const byPlay = label === "« À son arrivée »" && (def.onPlayEffects?.length ?? 0) > 0;
    // Les champs de données (bonusDamageVsTargetType, selfDamageOnDirectAttack…) couvrent certains « lorsqu'il attaque ».
    const byField = Object.keys(def).some((k) => /Attack|Damage|WhileVisible|Substitute|Shield|Survives|Garde|TideState/.test(k));
    if (!hasTrigger(def, ...wanted) && !byPlay && !byField) push("trigger", `${label} sans déclencheur ${wanted.join("/")}`);
  }

  // --- Mots-clés -----------------------------------------------------------
  const grants = effects.flatMap((e) => e.grantKeywords ?? []);
  const summonsWithRush = effects.some((e) => e.type === "summon" && e.rush);
  if (/Pied marin/.test(text)) {
    const ok = def.keywords?.includes("pied-marin") || grants.includes("pied-marin") || summonsWithRush;
    if (!ok) push("keyword", "« Pied marin » cité sans `keywords`, `grantKeywords` ni invocation `rush`");
  }
  if (/\bGarde\b/.test(text) && def.type !== "objet" && !Object.keys(def).some((k) => /bypassesGarde/.test(k))) {
    const ok = def.keywords?.includes("garde") || (def.conditionalKeywords ?? []).some((k) => k.keyword === "garde") || def.equipGrantsKeywords?.includes("garde") || grants.includes("garde");
    if (!ok) push("keyword", "« Garde » cité sans mot-clé statique, conditionnel, transmis par Équipement ni accordé");
  }
  if (/\bRu[ée]e\b/.test(text)) push("pied-marin", "« Ruée » est proscrit : le mot-clé s'appelle « Pied marin »");
  if (/d[ée]fausse\b/i.test(text) && !/d[ée]fausse[rz]|d[ée]faussez|d[ée]fausser/i.test(text)) {
    push("cimetiere", "la zone s'appelle « Cimetière » (« défausse » ne désigne que l'action de se défausser)");
  }

  // --- Montants ------------------------------------------------------------
  const declared = amountsOf(effects);
  const costReason = abilities.map((a) => a.cost?.reason ?? 0).concat(def.activatableOncePerTurn?.cost.reason ?? 0);
  const cited = [
    ...textAmounts(text, /r[ée]cup[ée]rez(?:-en)? (\d+) (?:Raison|Ancrage)/gi),
    ...textAmounts(text, /piochez (\d+) carte/gi),
    ...textAmounts(text, /inflige[zr]? (\d+) d[ée]g[âa]t/gi),
    ...textAmounts(text, /\+(\d+) (?:Puissance|R[ée]sistance)/gi),
    ...textAmounts(text, /\+(\d+) \/ \+\d+/gi),
    ...textAmounts(text, /-(\d+) (?:Puissance|R[ée]sistance)/gi),
    ...textAmounts(text, /(?:perd|perdez|perdre|d[ée]penser) (\d+) Raison/gi),
  ];
  // Les variations de Marée (`tideAffinity`) sont des stats ABSOLUES : le texte, lui, parle en delta (« +1 Puissance »).
  const affinityDeltas = Object.values(def.tideAffinity ?? {}).flatMap((entry) => [
    ...(entry.attack !== undefined && def.attack !== undefined ? [Math.abs(entry.attack - def.attack)] : []),
    ...(entry.health !== undefined && def.health !== undefined ? [Math.abs(entry.health - def.health)] : []),
  ]);
  const fieldNumbers = [...deepNumbers(def), ...affinityDeltas];
  for (const n of cited) {
    if (!declared.includes(n) && !costReason.includes(n) && !fieldNumbers.includes(n)) {
      push("amounts", `le texte cite le montant ${n} qu'aucun effet, coût ni champ ne porte`);
    }
  }

  // --- Coût d'une réaction ----------------------------------------------------
  for (const a of abilities) {
    if (a.cost?.reason && !new RegExp(`(perdre|perdez|d[ée]penser|payer) ${a.cost.reason} Raison`, "i").test(text)) {
      push("cost", `une capacité coûte ${a.cost.reason} Raison, mais le texte ne l'annonce pas`);
    }
    if (a.effects.length === 0) push("trigger", "capacité sans effet");
  }

  return out;
}

describe("conformité du catalogue : chaque texte de carte est réalisé par sa définition", () => {
  it("chaque exception est motivée", () => {
    for (const [key, reason] of Object.entries(EXCEPTIONS)) {
      expect(reason.trim().length, `exception ${key} sans motif`).toBeGreaterThan(10);
      const [cardId] = key.split(":");
      expect(CORE_SET.some((c) => c.id === cardId), `exception ${key} : carte inconnue`).toBe(true);
    }
  });

  it("les identifiants sont uniques, en kebab-case, et chaque carte a un texte", () => {
    const ids = new Set<string>();
    for (const def of CORE_SET) {
      expect(def.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(ids.has(def.id), `id en double : ${def.id}`).toBe(false);
      ids.add(def.id);
      const vanilla = !def.abilities?.length && !def.onPlayEffects?.length && !def.onBreakEffects?.length && !def.activatableOncePerTurn && !def.keywords?.length;
      if (!vanilla) expect((def.text ?? "").trim().length, `${def.id} sans texte`).toBeGreaterThan(0);
    }
  });

  it("la variante Abyssale est déclarée par `variant`, jamais par le sous-type, et s'accorde au suffixe d'identifiant", () => {
    for (const def of CORE_SET) {
      const suffixed = def.id.endsWith("-abyssal");
      expect(def.variant === "abyssale", `${def.id} : variant et suffixe d'identifiant divergent`).toBe(suffixed);
      // « abyssal » est une VARIANTE, pas une famille de jeu.
      expect(def.subtype).not.toBe("abyssal");
    }
  });

  it("aucun écart non documenté entre texte et définition", () => {
    const violations = CORE_SET.flatMap(check).filter((v) => !(`${v.cardId}:${v.rule}` in EXCEPTIONS));
    const report = violations.map((v) => `- ${v.cardId} [${v.rule}] : ${v.detail}`).join("\n");
    expect(violations, `\n${report}\n`).toEqual([]);
  });

  it("aucune exception ne vise un écart qui n'existe plus", () => {
    const present = new Set(CORE_SET.flatMap(check).map((v) => `${v.cardId}:${v.rule}`));
    const stale = Object.keys(EXCEPTIONS).filter((key) => !present.has(key));
    expect(stale, "exceptions devenues inutiles, à retirer").toEqual([]);
  });
});
