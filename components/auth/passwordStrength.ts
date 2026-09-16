export interface PasswordStrength {
  /** 0 (vide/très faible) à 4 (très fort). */
  score: number;
  label: string;
  barColorClass: string;
}

const LEVELS: Array<{ label: string; barColorClass: string }> = [
  { label: "Très faible", barColorClass: "bg-[var(--tb-danger)]" },
  { label: "Faible", barColorClass: "bg-[var(--tb-danger)]" },
  { label: "Moyen", barColorClass: "bg-[var(--tb-gold)]" },
  { label: "Fort", barColorClass: "bg-[var(--tb-success)]" },
  { label: "Très fort", barColorClass: "bg-[var(--tb-success)]" },
];

/** Heuristique simple (longueur + diversité de caractères) — pas de vérification contre une liste de mots de passe compromis, hors périmètre côté client. */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  score = Math.min(score, 4);

  return { score, ...LEVELS[score]! };
}

/** Seuil minimum exigé à la création de compte — "Moyen", la moitié du barème 0-4. */
export const MIN_SIGNUP_PASSWORD_SCORE = 2;
