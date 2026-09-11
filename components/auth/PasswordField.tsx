"use client";

import { useState } from "react";
import { AUTH_INPUT_CLASS } from "@/components/auth/AuthGlassPanel";
import { evaluatePasswordStrength } from "@/components/auth/passwordStrength";

interface PasswordFieldProps {
  name: string;
  placeholder: string;
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  /** Affiche la jauge de force sous le champ (mot de passe principal d'une création/réinitialisation, pas pour confirmer ou se connecter). */
  showStrength?: boolean;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.8} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.36 5.35C10.2 5.12 11.08 5 12 5c6.5 0 10 7 10 7a17.9 17.9 0 0 1-3.16 4.15M6.6 6.6C4.2 8.1 2 12 2 12s3.5 7 10 7c1.3 0 2.47-.28 3.5-.72"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Champ mot de passe partagé par les formulaires d'auth : bascule afficher/masquer (œil) + jauge de force optionnelle. */
export function PasswordField({ name, placeholder, autoComplete, value, onChange, showStrength = false }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = showStrength ? evaluatePasswordStrength(value) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          name={name}
          required
          minLength={8}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${AUTH_INPUT_CLASS} pr-9`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          tabIndex={-1}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-200"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {showStrength && value && strength && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i < strength.score ? strength.barColorClass : "bg-white/10"}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-slate-400">Force du mot de passe : {strength.label}</span>
        </div>
      )}
    </div>
  );
}
