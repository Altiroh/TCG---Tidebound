/**
 * Issue du chargement de chaque URL d'image, partagée par toute l'app.
 *
 * `useImageOk` / `useImageLoadStatus` préchargent une image hors du DOM
 * avant de l'afficher. Sans mémoire commune, chaque carte montée repartait
 * de « pas encore chargée » — même pour un cadre déjà affiché cinquante
 * fois : un rendu vide, un `new Image()`, puis un second rendu, et le visuel
 * qui clignote à chaque remontage (changement de filtre, carte qui passe de
 * la main au plateau…). Une URL déjà résolue l'est désormais tout de suite.
 */
export type ImageStatus = "loading" | "ok" | "error";

const settled = new Map<string, "ok" | "error">();
const inFlight = new Map<string, Promise<"ok" | "error">>();

/** Issue déjà connue d'une URL, ou `"loading"` si elle n'a jamais été résolue. */
export function knownImageStatus(url: string): ImageStatus {
  return settled.get(url) ?? "loading";
}

/** Charge l'URL une seule fois pour toute l'app, quel que soit le nombre de cartes qui la demandent. */
export function loadImageStatus(url: string): Promise<"ok" | "error"> {
  const known = settled.get(url);
  if (known) return Promise.resolve(known);
  let pending = inFlight.get(url);
  if (!pending) {
    pending = new Promise<"ok" | "error">((resolve) => {
      const img = new window.Image();
      img.decoding = "async";
      img.onload = () => resolve("ok");
      img.onerror = () => resolve("error");
      img.src = url;
    }).then((status) => {
      settled.set(url, status);
      inFlight.delete(url);
      return status;
    });
    inFlight.set(url, pending);
  }
  return pending;
}
