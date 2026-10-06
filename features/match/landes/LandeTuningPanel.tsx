"use client";

import { useState } from "react";
import { LANDE_TUNING_DEFAULTS, setLandeTuning, useLandeTuning, type LandeTuning } from "@/features/match/landes/landeTuning";

const CURSEURS: Array<{ key: keyof LandeTuning; label: string; min: number; max: number; step: number }> = [
  { key: "floorBrightness", label: "Luminosité du sol", min: 0.5, max: 2.5, step: 0.05 },
  { key: "tintOpacity", label: "Teinte de scène", min: 0, max: 1, step: 0.05 },
  { key: "veilOpacity", label: "Voile haut / bas", min: 0, max: 1, step: 0.05 },
  { key: "deckOpacity", label: "Pont du navire", min: 0, max: 1, step: 0.05 },
  { key: "decorOpacity", label: "Décor du navire (bas, coins)", min: 0, max: 1, step: 0.05 },
  { key: "propScale", label: "Taille des pièces", min: 0.5, max: 3, step: 0.05 },
  { key: "propMax", label: "Taille max (px)", min: 150, max: 700, step: 10 },
  { key: "propFree", label: "Pièces libres (0 / 1)", min: 0, max: 1, step: 1 },
];

/**
 * Panneau « Réglages » du laboratoire des Landes : chaque curseur change la
 * scène en direct (`landeTuning.ts`). « Copier » met les valeurs dans le
 * presse-papiers, à recopier dans `LANDE_TUNING_DEFAULTS`.
 */
export function LandeTuningPanel() {
  const tuning = useLandeTuning();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 9999,
        width: open ? 240 : "auto",
        padding: 10,
        borderRadius: 10,
        background: "rgba(8, 14, 22, 0.88)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        color: "#e8e1cf",
        font: "12px/1.3 system-ui, sans-serif",
        backdropFilter: "blur(6px)",
      }}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", fontWeight: 600 }}>
        {open ? "▾" : "▸"} Réglages de la Lande
      </button>
      {open && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {CURSEURS.map((c) => (
            <label key={c.key} style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{c.label}</span>
                <span style={{ opacity: tuning[c.key] === LANDE_TUNING_DEFAULTS[c.key] ? 0.6 : 1 }}>{tuning[c.key]}</span>
              </span>
              <input
                type="range"
                min={c.min}
                max={c.max}
                step={c.step}
                value={tuning[c.key]}
                onChange={(e) => setLandeTuning({ [c.key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={copy} style={bouton}>
              {copied ? "Copié ✓" : "Copier les valeurs"}
            </button>
            <button type="button" onClick={() => setLandeTuning({ ...LANDE_TUNING_DEFAULTS })} style={bouton}>
              Défaut
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const bouton = {
  flex: 1,
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid rgba(255, 255, 255, 0.2)",
  background: "rgba(255, 255, 255, 0.08)",
  color: "inherit",
  cursor: "pointer",
} as const;
