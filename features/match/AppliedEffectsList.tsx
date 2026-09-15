"use client";

import type { ReactNode } from "react";
import {
  collectAuraContributions,
  getCardDefinition,
  type AuraContext,
  type CardInstance,
  type StatModifierDuration,
  type TideStateName,
} from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { formatStatDelta } from "@/features/match/formatEvent";
import { CardThumb } from "@/features/match/CardThumb";

interface AppliedEffect {
  key: string;
  /** Miniature carrée à gauche : illustration de la carte source, ou pictogramme quand l'effet ne vient pas d'une carte. */
  thumbnail: { kind: "card"; cardId: string } | { kind: "glyph"; glyph: string };
  source: string;
  delta: ReactNode;
  /** Précision discrète (durée). */
  detail?: string;
  tone: "buff" | "malus" | "neutral";
}

function toneOf(attack: number, health: number): AppliedEffect["tone"] {
  const total = attack + health;
  return total > 0 ? "buff" : total < 0 ? "malus" : "neutral";
}

/**
 * Variation de stats colorée COMPOSANTE PAR COMPOSANTE : une hausse est
 * verte, une baisse rouge, même quand les deux cohabitent sur la même
 * ligne. Une teinte unique tirée de la somme affichait un "+1 Puissance"
 * en rouge dès qu'un "-2 Résistance" l'accompagnait (retour du 15/09 :
 * « l'info d'une augmentation n'est pas forcément en vert »).
 */
function StatDelta({ attack, health }: { attack: number; health: number }) {
  const tone = (value: number) => (value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-slate-200");
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  return (
    <>
      {attack !== 0 && <span className={tone(attack)}>{signed(attack)} Puissance</span>}
      {attack !== 0 && health !== 0 && <span className="text-slate-400"> et </span>}
      {health !== 0 && <span className={tone(health)}>{signed(health)} Résistance</span>}
    </>
  );
}

function knownCardName(source: string): string | null {
  if (source === "unknown") return null;
  try {
    return getCardDefinition(source).name;
  } catch {
    return null;
  }
}

/**
 * Tout ce qui écarte une carte de plateau de sa fiche imprimée : bonus
 * reçus d'autres cartes présentes (`auraContext`, nommés un par un), buffs/
 * malus posés sur elle (`instance.modifiers`, regroupés par source et
 * durée), carte liée par un Équipement, ajustement de la Marée courante
 * (`tideAffinity`) et dégâts marqués.
 */
function collectAppliedEffects(
  instance: CardInstance,
  tideState: TideStateName,
  boardUnits: readonly CardInstance[],
  auraContext?: AuraContext
): AppliedEffect[] {
  const def = getCardDefinition(instance.cardId);
  const effects: AppliedEffect[] = [];

  // Carte liée : l'Équipement attaché à cette carte, ou l'unité que cet Équipement équipe.
  for (const equipment of boardUnits.filter((unit) => unit.attachedToInstanceId === instance.instanceId)) {
    effects.push({
      key: `linked-${equipment.instanceId}`,
      thumbnail: { kind: "card", cardId: equipment.cardId },
      source: "Équipement attaché",
      delta: getCardDefinition(equipment.cardId).name,
      tone: "neutral",
    });
  }
  const equipped = instance.attachedToInstanceId
    ? boardUnits.find((unit) => unit.instanceId === instance.attachedToInstanceId)
    : undefined;
  if (equipped) {
    effects.push({
      key: `linked-${equipped.instanceId}`,
      thumbnail: { kind: "card", cardId: equipped.cardId },
      source: "Unité équipée",
      delta: getCardDefinition(equipped.cardId).name,
      tone: "neutral",
    });
  }

  // Bonus venus du plateau : nommés carte par carte ("+1 Puissance —
  // Cra-Poiscail Porte-Étendard") plutôt que fondus dans le total, pour que
  // le joueur sache QUI renforce sa créature et ce qu'il perd en la perdant.
  if (auraContext) {
    for (const contribution of collectAuraContributions(instance, tideState, auraContext)) {
      if (!formatStatDelta(contribution.attack, contribution.health)) continue;
      const isSelf = contribution.sourceInstanceId === instance.instanceId;
      effects.push({
        key: `aura-${contribution.sourceInstanceId ?? contribution.sourceCardId}-${contribution.attack}-${contribution.health}`,
        thumbnail: { kind: "card", cardId: contribution.sourceCardId },
        source: isSelf ? "Sa propre capacité" : getCardDefinition(contribution.sourceCardId).name,
        delta: <StatDelta attack={contribution.attack} health={contribution.health} />,
        detail: isSelf ? "Tant que la condition tient" : "Tant que cette carte est en jeu",
        tone: toneOf(contribution.attack, contribution.health),
      });
    }
  }

  const grouped = new Map<string, { source: string; duration: StatModifierDuration; attack: number; health: number }>();
  for (const modifier of instance.modifiers) {
    const key = `${modifier.source}|${modifier.duration}`;
    const entry = grouped.get(key) ?? { source: modifier.source, duration: modifier.duration, attack: 0, health: 0 };
    entry.attack += modifier.attack;
    entry.health += modifier.health;
    grouped.set(key, entry);
  }
  for (const [key, entry] of grouped) {
    if (!formatStatDelta(entry.attack, entry.health)) continue;
    const name = knownCardName(entry.source);
    effects.push({
      key,
      thumbnail: name ? { kind: "card", cardId: entry.source } : { kind: "glyph", glyph: "✦" },
      source: name ?? "Effet",
      delta: <StatDelta attack={entry.attack} health={entry.health} />,
      detail: DURATION_LABELS[entry.duration],
      tone: toneOf(entry.attack, entry.health),
    });
  }

  const tideEntry = def.tideAffinity?.[tideState];
  if (tideEntry) {
    const attack = tideEntry.attack !== undefined ? tideEntry.attack - (def.attack ?? 0) : 0;
    const health = tideEntry.health !== undefined ? tideEntry.health - (def.health ?? 0) : 0;
    const delta = formatStatDelta(attack, health);
    if (delta || tideEntry.inactive) {
      effects.push({
        key: "tide",
        thumbnail: { kind: "glyph", glyph: "≋" },
        source: `Marée — ${TIDE_STATE_LABELS[tideState]}`,
        delta: (
          <>
            <StatDelta attack={attack} health={health} />
            {delta && tideEntry.inactive && <span className="text-slate-400">, </span>}
            {tideEntry.inactive && <span className="text-rose-300">Inactive</span>}
          </>
        ),
        detail: "Tant que la Marée reste dans cet état",
        tone: tideEntry.inactive ? "malus" : toneOf(attack, health),
      });
    }
  }

  if (instance.damageMarked > 0) {
    effects.push({
      key: "damage",
      thumbnail: { kind: "glyph", glyph: "✕" },
      source: "Dégâts subis",
      delta: `-${instance.damageMarked} Résistance`,
      tone: "malus",
    });
  }

  return effects;
}

const TONE_CLASSES: Record<AppliedEffect["tone"], string> = {
  buff: "text-emerald-300",
  malus: "text-rose-300",
  neutral: "text-slate-200",
};

const THUMB_BORDER_CLASSES: Record<AppliedEffect["tone"], string> = {
  buff: "border-emerald-400/50",
  malus: "border-rose-400/50",
  neutral: "border-white/20",
};

/**
 * Liste "effets appliqués" posée SOUS la carte agrandie du détail de plateau
 * (`CardDetailModal`) : une ligne par effet, miniature de la source à gauche,
 * variation en toutes lettres à droite. Rien n'est rendu si la carte est
 * telle qu'imprimée.
 */
/** Libellé lisible de chaque durée de modificateur (`StatModifier.duration`). */
const DURATION_LABELS: Record<StatModifierDuration, string> = {
  endOfTurn: "Jusqu'à la fin du tour",
  untilYourNextTurn: "Jusqu'à votre prochain tour",
  permanent: "Permanent",
};

export function AppliedEffectsList({
  instance,
  tideState,
  boardUnits = [],
  auraContext,
}: {
  instance: CardInstance;
  tideState: TideStateName;
  boardUnits?: readonly CardInstance[];
  /** Plateau du contrôleur — sans lui, les bonus reçus d'autres cartes ne peuvent pas être nommés. */
  auraContext?: AuraContext;
}) {
  const effects = collectAppliedEffects(instance, tideState, boardUnits, auraContext);
  if (effects.length === 0) return null;

  return (
    <ul
      aria-label="Effets appliqués"
      className="flex max-h-[30vh] flex-col gap-2 overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-black/60 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl [scrollbar-width:thin] [font-family:var(--font-card-body)]"
    >
      {effects.map((effect) => (
        <li key={effect.key} className="flex items-center gap-3">
          <CardThumb
            cardId={effect.thumbnail.kind === "card" ? effect.thumbnail.cardId : undefined}
            glyph={effect.thumbnail.kind === "glyph" ? effect.thumbnail.glyph : undefined}
            size={44}
            className={THUMB_BORDER_CLASSES[effect.tone]}
            glyphClassName={TONE_CLASSES[effect.tone]}
          />
          <span className="min-w-0 flex-1">
            {/* Pas de teinte globale ici : chaque composante porte la sienne (`StatDelta`) ; seules les lignes non chiffrées (carte liée) retombent sur `tone`. */}
            <span className={`block text-[15px] font-semibold leading-tight ${TONE_CLASSES[effect.tone]}`}>{effect.delta}</span>
            <span className="block truncate text-xs text-slate-400">
              {effect.source}
              {effect.detail ? ` · ${effect.detail}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
