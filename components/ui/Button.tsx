import type { ButtonHTMLAttributes, MouseEvent } from "react";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Les rôles du design system (`GameScreen.module.css` §3). */
const VARIANT_CLASSES: Record<ButtonVariant, string | undefined> = {
  primary: game.primary,
  secondary: game.secondary,
  tertiary: game.tertiary,
  ghost: game.ghost,
  danger: game.danger,
};

/**
 * Bouton générique de l'UI, habillé par le design system : le même
 * primaire cyan que `game.primary` partout ailleurs. Composant "bête" :
 * aucune logique de jeu ici.
 */
export function Button({ variant = "primary", className = "", onClick, ...props }: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    playButtonClick();
    onClick?.(event);
  }

  return <button onClick={handleClick} className={`${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
