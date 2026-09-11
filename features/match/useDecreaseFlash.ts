import { useEffect, useRef, useState } from "react";

/** `true` le temps d'une animation, chaque fois que `value` diminue par rapport à son appel précédent. */
export function useDecreaseFlash(value: number): boolean {
  const previous = useRef(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (value >= previous.current) {
      previous.current = value;
      return undefined;
    }
    setFlashing(true);
    previous.current = value;
    const timeout = setTimeout(() => setFlashing(false), 500);
    return () => clearTimeout(timeout);
  }, [value]);

  return flashing;
}
