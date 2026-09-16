"use client";

import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

/**
 * Ligne "libellé + interrupteur" des Options. L'interrupteur est celui du
 * design system (`game.toggle`) : capsule bleu nuit au repos, cyan allumé
 * quand actif — la même matière dans le dialogue des Options et dans le
 * menu de pause en partie.
 *
 * Toute la ligne est le bouton (`role="switch"`) : on bascule en visant le
 * libellé comme le curseur.
 */
export function ToggleSwitch({ checked, onChange, label, description }: ToggleSwitchProps) {
  function handleClick() {
    onChange(!checked);
    // Après la bascule : couper les effets reste donc silencieux, les
    // rallumer se confirme immédiatement par un clic audible.
    playButtonClick();
  }

  return (
    <button type="button" role="switch" aria-checked={checked} onClick={handleClick} className={game.controlRow}>
      <span style={{ minWidth: 0 }}>
        <span className={game.controlRowLabel}>{label}</span>
        {description && <span className={game.controlRowText}>{description}</span>}
      </span>
      {/* Le curseur est décoratif : l'état est porté par le `role="switch"` de la ligne. */}
      <span className={game.toggle} data-checked={checked ? "true" : "false"} aria-hidden />
    </button>
  );
}
