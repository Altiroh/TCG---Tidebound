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

/**
 * Un ÉCHEC ne se retient que ce temps-là. Une image absente peut arriver
 * pendant que l'app est ouverte — un déploiement qui livre des
 * illustrations, un réseau qui flanche une seconde. Retenu à vie, l'échec
 * laissait la carte sans visuel jusqu'au rechargement complet de la page,
 * que la PWA installée ne fait presque jamais (retour du 24/09/2026 : une
 * partie des illustrations livrées le jour même restait invisible).
 */
export const ERROR_RETRY_MS = 30_000;

const settled = new Map<string, { status: "ok" | "error"; at: number }>();
const inFlight = new Map<string, Promise<"ok" | "error">>();

/** Issue connue et encore valable : un succès l'est toujours, un échec pendant `ERROR_RETRY_MS`. */
function valid(url: string, now = Date.now()): "ok" | "error" | undefined {
  const entry = settled.get(url);
  if (!entry) return undefined;
  if (entry.status === "error" && now - entry.at > ERROR_RETRY_MS) {
    settled.delete(url);
    return undefined;
  }
  return entry.status;
}

/** Issue déjà connue d'une URL, ou `"loading"` si elle n'a jamais été résolue (ou si son échec est périmé). */
export function knownImageStatus(url: string): ImageStatus {
  return valid(url) ?? "loading";
}

/** Charge l'URL une seule fois pour toute l'app, quel que soit le nombre de cartes qui la demandent. */
export function loadImageStatus(url: string): Promise<"ok" | "error"> {
  const known = valid(url);
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
      settled.set(url, { status, at: Date.now() });
      inFlight.delete(url);
      return status;
    });
    inFlight.set(url, pending);
  }
  return pending;
}
