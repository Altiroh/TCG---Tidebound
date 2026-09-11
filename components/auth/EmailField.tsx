interface EmailFieldProps {
  name: string;
  placeholder: string;
  autoComplete?: string;
  className: string;
  defaultValue?: string;
}

/** Champ email avec icône enveloppe — même traitement visuel que `PasswordField` (icône dans le champ) pour les formulaires d'auth. */
export function EmailField({ name, placeholder, autoComplete, className, defaultValue }: EmailFieldProps) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth={1.8} />
          <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <input
        type="email"
        name={name}
        required
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className={`${className} pl-9`}
      />
    </div>
  );
}
