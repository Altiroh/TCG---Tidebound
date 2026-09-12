import type { BoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";

/**
 * Préchargement des images de la scène. Les chemins des sachets vivent
 * dans `boosterPackVisuals.ts` ; seul le dos de carte, commun à tous les
 * boosters, est déclaré ici.
 */
export const CARD_BACK_ASSET = "/assets/cards/card-back.png";

export interface BoosterOpeningAssetStatus {
  cardBackAvailable: boolean;
}

/** Au-delà, on lance la scène quand même : une image lente ne doit jamais bloquer l'ouverture. */
const PRELOAD_TIMEOUT_MS = 4000;

function preloadImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(ok);
    };
    const timeout = setTimeout(() => finish(img.complete && img.naturalWidth > 0), PRELOAD_TIMEOUT_MS);
    img.onload = () => {
      // `decode()` garantit que l'image est décodée AVANT sa première
      // apparition : pas de frame vide au moment du remplacement des pièces.
      if (typeof img.decode === "function") {
        img.decode().then(
          () => finish(true),
          () => finish(true),
        );
      } else {
        finish(true);
      }
    };
    img.onerror = () => finish(false);
    img.src = src;
  });
}

const preloads = new Map<string, Promise<boolean>>();

/** Une seule requête par image pour toute la session, quel que soit le nombre d'appels. */
function preloadOnce(src: string): Promise<boolean> {
  let promise = preloads.get(src);
  if (!promise) {
    promise = preloadImage(src);
    preloads.set(src, promise);
  }
  return promise;
}

/**
 * Précharge les images d'un sachet et le dos de carte. Appelée dès
 * l'affichage de la page Boosters pour que le clic sur « Ouvrir » démarre
 * sans attente, puis de nouveau par la scène (mémoïsé).
 */
export function preloadBoosterOpeningAssets(visual: BoosterPackVisual): Promise<BoosterOpeningAssetStatus> {
  if (typeof window === "undefined") return Promise.resolve({ cardBackAvailable: false });
  return Promise.all([
    preloadOnce(visual.assets.closed),
    preloadOnce(visual.assets.openTop),
    preloadOnce(visual.assets.openBottom),
    preloadOnce(CARD_BACK_ASSET),
  ]).then(([, , , cardBack]) => ({ cardBackAvailable: cardBack ?? false }));
}
