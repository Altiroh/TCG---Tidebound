export interface PasswordStrength {
  /** 0 (vide/très faible) à 4 (très fort). */
  score: number;
  label: string;
  barColorClass: string;
}

const LEVELS: Array<{ label: string; barColorClass: string }> = [
  { label: "Très faible", barColorClass: "bg-rose-500" },
  { label: "Faible", barColorClass: "bg-orange-500" },
  { label: "Moyen", barColorClass: "bg-amber-400" },
  { label: "Fort", barColorClass: "bg-emerald-400" },
  { label: "Très fort", barColorClass: "bg-emerald-400" },
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
