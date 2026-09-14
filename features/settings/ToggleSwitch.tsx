"use client";

import { playButtonClick } from "@/lib/sound";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

/**
 * Ligne "libellé + interrupteur" des Options. L'interrupteur lui-même est
 * en verre (fond translucide au repos, laiton allumé quand actif) plutôt
 * qu'une case à cocher système, pour rester dans la matière du reste du
 * menu.
 */
export function ToggleSwitch({ checked, onChange, label, description }: ToggleSwitchProps) {
  function handleClick() {
    onChange(!checked);
    // Après la bascule : couper les effets reste donc silencieux, les
    // rallumer se confirme immédiatement par un clic audible.
    playButtonClick();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleClick}
      className="group flex w-full items-center justify-between gap-4 rounded-[var(--radius-sm)] px-1 py-2 text-left outline-none transition duration-150 ease-out hover:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-[var(--accent)]/60"
    >
      <span className="min-w-0">
        <span className="block text-sm text-[var(--text-primary)]">{label}</span>
        {description && <span className="block text-xs text-[var(--text-secondary)]">{description}</span>}
      </span>

      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full border transition duration-150 ease-out ${
          checked
            ? "border-[var(--accent)]/60 bg-[var(--accent)]/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)]"
            : "border-white/10 bg-white/[0.06]"
        }`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-all duration-150 ease-out ${
            checked ? "left-[calc(100%-1.25rem)] bg-[var(--accent-hover)]" : "left-1 bg-white/50"
          }`}
          style={{ height: "1.125rem", width: "1.125rem" }}
        />
      </span>
    </button>
  );
}
