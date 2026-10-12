"use client";

import { StatusBadge } from "@/features/match/StatusBadge";
import { useImageOk } from "@/features/match/useImageOk";
import type { QualificationChip } from "@/features/match/qualificationDisplay";

/**
 * Médaillon d'une QUALIFICATION sur une carte en jeu : son glyphe
 * (`public/assets/qualifications/<glyphe>.webp`, livré plus tard) ou, tant
 * qu'il manque, un PLACEHOLDER discret — un disque sombre cerclé, avec
 * l'initiale de la qualification. La valeur X se superpose au glyphe.
 * L'info-bulle donne le nom, la description et, s'il y a lieu, la
 * condition (équivalent d'un effet écrit) ou la règle encore provisoire.
 */
export function QualificationBadge({ chip, size = 38 }: { chip: QualificationChip; size?: number }) {
  const glyphOk = useImageOk(chip.glyph);
  const value = chip.value !== undefined ? String(chip.value) : undefined;
  return (
    <StatusBadge
      icon={chip.glyph}
      label={chip.label}
      description={<QualificationDescription chip={chip} />}
      size={size}
      overlayText={glyphOk ? value : undefined}
      overlayTextClassName="text-white [text-shadow:0_0_3px_rgba(0,0,0,0.95)]"
      placeholder={glyphOk ? undefined : <QualificationPlaceholder chip={chip} value={value} size={size} />}
    />
  );
}

/** Le disque d'attente : initiale (et valeur), jamais un glyphe inventé. */
function QualificationPlaceholder({ chip, value, size }: { chip: QualificationChip; value?: string; size: number }) {
  return (
    <span
      data-qualification-placeholder={chip.id}
      className={`flex h-full w-full select-none items-center justify-center rounded-full border bg-slate-900/90 font-bold leading-none text-amber-100 shadow-[0_2px_8px_rgba(0,0,0,0.75)] ${
        chip.equivalent ? "border-dashed border-amber-200/60" : "border-amber-200/80"
      }`}
      style={{ fontSize: Math.round(size * 0.42) }}
    >
      {chip.name.charAt(0)}
      {value && <span style={{ fontSize: "0.75em", marginLeft: "0.05em" }}>{value}</span>}
    </span>
  );
}

export function QualificationDescription({ chip }: { chip: QualificationChip }) {
  return (
    <>
      <span>{chip.description}</span>
      <span className="mt-1 block text-slate-400">{chip.activation}</span>
      {chip.equivalent && <span className="mt-1 block italic text-slate-400">Effet écrit de la carte, montré comme qualification.</span>}
      {chip.rules === "provisional" && <span className="mt-1 block text-amber-300/90">Règle provisoire, en attente de validation.</span>}
      {chip.rules === "notImplemented" && <span className="mt-1 block text-amber-300/90">Pas encore appliquée par le moteur.</span>}
    </>
  );
}
