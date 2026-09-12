import { useEffect, useState } from "react";

/** Retarde la propagation d'une valeur qui change vite (ex: frappe clavier) — évite de refiltrer/trier à chaque caractère tapé. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
