import { useEffect, useState } from "react";
import { knownImageStatus, loadImageStatus } from "@/features/match/imageStatusCache";

/**
 * Précharge une image hors du DOM plutôt que de dépendre de l'événement
 * `onError` d'un `<img>` rendu — plus fiable quand beaucoup de cartes se
 * chargent en même temps (ex: la page Collection, 80 cartes), où
 * `onError` s'est révélé peu fiable dans les tests. `false` tant que
 * l'image n'a pas fini de charger OU si elle échoue (404, pas encore
 * fournie) — pas d'état intermédiaire à gérer côté appelant.
 *
 * Une URL déjà résolue ailleurs dans l'app répond `true` dès le premier
 * rendu (`imageStatusCache`), sans nouvelle requête ni second rendu.
 */
export function useImageOk(url: string | null): boolean {
  const [ok, setOk] = useState(() => url !== null && knownImageStatus(url) === "ok");

  useEffect(() => {
    // `null` = calque qui n'a pas lieu d'exister pour cette carte (ex: le
    // débord, réservé aux Abyssales) : ne pas le demander évite un 404 par
    // carte affichée.
    if (url === null) {
      setOk(false);
      return;
    }
    const known = knownImageStatus(url);
    if (known !== "loading") {
      setOk(known === "ok");
      return;
    }
    setOk(false);
    let cancelled = false;
    void loadImageStatus(url).then((status) => {
      if (!cancelled) setOk(status === "ok");
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return ok;
}
