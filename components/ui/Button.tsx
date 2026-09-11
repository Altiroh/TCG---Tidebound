import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { playButtonClick } from "@/lib/sound";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-board-accent text-slate-950 hover:opacity-90",
  secondary: "bg-board-surface text-slate-100 hover:bg-slate-800",
};

/** Bouton générique de l'UI. Composant "bête" : aucune logique de jeu ici. */
export function Button({ variant = "primary", className = "", onClick, ...props }: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    playButtonClick();
    onClick?.(event);
  }

  return (
    <button
      onClick={handleClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
