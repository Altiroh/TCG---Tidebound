import { useEffect, useState } from "react";

/**
 * Précharge une image hors du DOM plutôt que de dépendre de l'événement
 * `onError` d'un `<img>` rendu — plus fiable quand beaucoup de cartes se
 * chargent en même temps (ex: la page Collection, 80 cartes), où
 * `onError` s'est révélé peu fiable dans les tests. `false` tant que
 * l'image n'a pas fini de charger OU si elle échoue (404, pas encore
 * fournie) — pas d'état intermédiaire à gérer côté appelant.
 */
export function useImageOk(url: string): boolean {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOk(false);
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setOk(true);
    };
    img.onerror = () => {
      if (!cancelled) setOk(false);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return ok;
}
