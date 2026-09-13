"use client";

import { getCardDefinition, type CardInstance, type TideStateName } from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { formatStatDelta } from "@/features/match/formatEvent";
import { useImageOk } from "@/features/match/useImageOk";

interface AppliedEffect {
  key: string;
  /** Miniature carrée à gauche : illustration de la carte source, ou pictogramme quand l'effet ne vient pas d'une carte. */
  thumbnail: { kind: "card"; cardId: string } | { kind: "glyph"; glyph: string };
  source: string;
  delta: string;
  /** Précision discrète (durée). */
  detail?: string;
  tone: "buff" | "malus" | "neutral";
}

function toneOf(attack: number, health: number): AppliedEffect["tone"] {
  const total = attack + health;
  return total > 0 ? "buff" : total < 0 ? "malus" : "neutral";
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
 * Tout ce qui écarte une carte de plateau de sa fiche imprimée : buffs/malus
 * (`instance.modifiers`, regroupés par source et durée), ajustement de la
 * Marée courante (`tideAffinity`) et dégâts marqués. Les auras dynamiques
 * (qui dépendent du reste du plateau) n'y figurent pas — le détail de carte
 * n'a pas ce contexte, cf. `AuraContext`.
 */
function collectAppliedEffects(instance: CardInstance, tideState: TideStateName): AppliedEffect[] {
  const def = getCardDefinition(instance.cardId);
  const effects: AppliedEffect[] = [];

  const grouped = new Map<string, { source: string; duration: "temporary" | "permanent"; attack: number; health: number }>();
  for (const modifier of instance.modifiers) {
    const key = `${modifier.source}|${modifier.duration}`;
    const entry = grouped.get(key) ?? { source: modifier.source, duration: modifier.duration, attack: 0, health: 0 };
    entry.attack += modifier.attack;
    entry.health += modifier.health;
    grouped.set(key, entry);
  }
  for (const [key, entry] of grouped) {
    const delta = formatStatDelta(entry.attack, entry.health);
    if (!delta) continue;
    const name = knownCardName(entry.source);
    effects.push({
      key,
      thumbnail: name ? { kind: "card", cardId: entry.source } : { kind: "glyph", glyph: "✦" },
      source: name ?? "Effet",
      delta,
      detail: entry.duration === "temporary" ? "Jusqu'à la fin du tour" : "Permanent",
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
        delta: [delta, tideEntry.inactive ? "Inactive" : ""].filter(Boolean).join(", "),
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

function Thumbnail({ effect }: { effect: AppliedEffect }) {
  const cardId = effect.thumbnail.kind === "card" ? effect.thumbnail.cardId : null;
  const illustrationUrl = cardId ? `/assets/cards/illustrations/${cardId}.png` : "";
  const illustrationOk = useImageOk(illustrationUrl);
  const glyph = effect.thumbnail.kind === "glyph" ? effect.thumbnail.glyph : effect.source.charAt(0);

  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white/10 ${THUMB_BORDER_CLASSES[effect.tone]}`}
    >
      {cardId && illustrationOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- asset local, illustration de la carte source
        <img src={illustrationUrl} alt="" draggable={false} className="h-full w-full select-none object-cover" />
      ) : (
        <span className={`text-lg font-bold ${TONE_CLASSES[effect.tone]}`}>{glyph}</span>
      )}
    </span>
  );
}

/**
 * Liste "effets appliqués" posée SOUS la carte agrandie du détail de plateau
 * (`CardDetailModal`) : une ligne par effet, miniature de la source à gauche,
 * variation en toutes lettres à droite. Rien n'est rendu si la carte est
 * telle qu'imprimée.
 */
export function AppliedEffectsList({ instance, tideState }: { instance: CardInstance; tideState: TideStateName }) {
  const effects = collectAppliedEffects(instance, tideState);
  if (effects.length === 0) return null;

  return (
    <ul
      aria-label="Effets appliqués"
      className="flex max-h-[30vh] flex-col gap-2 overflow-y-auto rounded-xl border border-white/15 bg-black/60 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl [font-family:var(--font-card-body)]"
    >
      {effects.map((effect) => (
        <li key={effect.key} className="flex items-center gap-3">
          <Thumbnail effect={effect} />
          <span className="min-w-0 flex-1">
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
