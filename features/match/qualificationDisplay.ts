import {
  effectiveQualifications,
  getCardDefinition,
  QUALIFICATION_EQUIVALENTS,
  qualificationGlyphUrl,
  qualificationLabel,
  QUALIFICATIONS,
  type CardDefinition,
  type CardInstance,
  type QualificationId,
} from "@/game";

/**
 * Ce que l'interface montre des QUALIFICATIONS d'une carte (« spé. ») : en
 * tête de son effet, en médaillons sur le plateau, et dans sa fiche.
 *
 * Deux sources, distinguées :
 *   - les vraies qualifications (définition + modificateurs), que le moteur
 *     applique (`game/cards/qualifications.ts`) ;
 *   - les ÉQUIVALENTS d'un effet déjà écrit (`qualificationEquivalents.ts`),
 *     montrés avec leur condition (« Contournement (Abysses) ») — affichage
 *     seulement, l'effet reste celui du texte.
 */
export interface QualificationChip {
  key: string;
  id: QualificationId;
  /** « Éclaboussure 2 », « Contournement (Abysses) ». */
  label: string;
  /** Nom seul, sans valeur ni condition. */
  name: string;
  /** Valeur X, si la qualification en porte une. */
  value?: number;
  description: string;
  activation: string;
  glyph: string;
  /** Équivalent d'un effet écrit, sous condition : ce n'est pas une qualification au sens du moteur. */
  equivalent: boolean;
  /** Règles encore provisoires ou non appliquées, et ce qui attend validation. */
  rules: "validated" | "provisional" | "notImplemented";
  pending: readonly string[];
}

function chipOf(id: QualificationId, value: number | undefined, extra: { key: string; equivalent: boolean; condition?: string; activation?: string }): QualificationChip {
  const rule = QUALIFICATIONS[id];
  const base = qualificationLabel({ id, value });
  return {
    key: extra.key,
    id,
    label: extra.condition ? `${base} (${extra.condition})` : base,
    name: rule.name,
    value,
    description: rule.describe(value),
    activation: extra.activation ?? rule.activation,
    glyph: qualificationGlyphUrl(id),
    equivalent: extra.equivalent,
    rules: extra.equivalent ? "validated" : rule.rules,
    pending: extra.equivalent ? [] : (rule.pending ?? []),
  };
}

/**
 * Les qualifications à montrer pour une carte :
 *   - les siennes (définition + modificateurs), puis les équivalents d'un
 *     effet écrit (`QUALIFICATION_EQUIVALENTS`) ;
 *   - pour une unité EN JEU (`board` = plateau de son contrôleur), celles
 *     que lui CONFÈRENT ses Équipements, suivies du nom de l'Équipement
 *     (« Sangsue (Le Cerf-volant) »).
 * Un Équipement n'en montre aucune pour lui-même : il les confère, la spé.
 * et le médaillon vont sur l'unité équipée.
 */
export function qualificationChips(
  def: CardDefinition,
  instance?: Pick<CardInstance, "instanceId" | "cardId" | "modifiers">,
  board?: readonly CardInstance[]
): QualificationChip[] {
  if (def.type === "equipement") return [];
  const chips = effectiveQualifications(instance ?? { cardId: def.id, modifiers: [] }, def).map((q) =>
    chipOf(q.id, q.value, { key: `q-${q.id}`, equivalent: false })
  );
  const seen = new Set(chips.map((chip) => chip.id));
  const push = (chip: QualificationChip) => {
    if (seen.has(chip.id)) return;
    seen.add(chip.id);
    chips.push(chip);
  };
  for (const eq of QUALIFICATION_EQUIVALENTS[def.id] ?? []) {
    push(
      chipOf(eq.id, eq.value, {
        key: `e-${eq.id}`,
        equivalent: true,
        condition: eq.condition,
        activation: eq.condition ? `Seulement pendant ${eq.condition} — l'effet de la carte le précise.` : undefined,
      })
    );
  }
  if (instance && board) {
    for (const equip of board.filter((u) => u.attachedToInstanceId === instance.instanceId)) {
      const equipDef = getCardDefinition(equip.cardId);
      const via = { condition: equipDef.name, activation: `Conférée par ${equipDef.name}, tant qu'il l'équipe.` };
      for (const q of equipDef.equipGrantsQualifications ?? []) push(chipOf(q.id, q.value, { key: `c-${equip.instanceId}-${q.id}`, equivalent: false, ...via }));
      for (const eq of QUALIFICATION_EQUIVALENTS[equipDef.id] ?? []) push(chipOf(eq.id, eq.value, { key: `ce-${equip.instanceId}-${eq.id}`, equivalent: true, ...via }));
    }
  }
  return chips;
}

/** La ligne « spé. » en tête de l'effet : « Rafale · Éclaboussure 2 ». */
export function qualificationLead(chips: readonly QualificationChip[]): string {
  return chips.map((chip) => chip.label).join(" · ");
}

/**
 * Mots-clés écrits EN TÊTE du texte (« Garde. Pied marin. … ») : ils sont
 * de la même famille que les qualifications — une capacité qui se nomme
 * d'un mot — et se rangent donc avec elles dans la « spé. » en gras.
 * Seulement s'ils ouvrent le texte : ailleurs dans une phrase (« ignore
 * Garde »), ils restent où le texte les met.
 */
const LEADING_KEYWORDS = ["Garde", "Pied marin"] as const;

/**
 * La ligne d'effet telle qu'elle s'affiche : la « spé. » (mots-clés de tête,
 * puis qualifications) et le reste du texte. Le texte n'est jamais réécrit —
 * les mots-clés de tête en sont seulement DÉPLACÉS dans la spé., sans leur point.
 */
export function effectLead(text: string | undefined, chips: readonly QualificationChip[]): { lead: string; text: string } {
  let rest = text ?? "";
  const keywords: string[] = [];
  for (;;) {
    const found = LEADING_KEYWORDS.find((kw) => rest.startsWith(`${kw}.`));
    if (!found) break;
    keywords.push(found);
    rest = rest.slice(found.length + 1).trimStart();
  }
  // Une qualification que le texte NOMME en tête (« Sangsue. Carnage. », Lot
  // 19) est déjà dans la spé. par son médaillon : le nom n'y est pas répété.
  for (;;) {
    const named = chips.find((chip) => !chip.equivalent && rest.startsWith(`${chip.label}.`));
    if (!named) break;
    rest = rest.slice(named.label.length + 1).trimStart();
  }
  return { lead: [...keywords, ...chips.map((chip) => chip.label)].join(" · "), text: rest };
}

/** La ligne entière, spé. comprise — ce que mesure le calibrage du texte. */
export function effectLine(text: string | undefined, chips: readonly QualificationChip[]): string {
  const { lead, text: rest } = effectLead(text, chips);
  return lead ? (rest ? `${lead} — ${rest}` : lead) : rest;
}
