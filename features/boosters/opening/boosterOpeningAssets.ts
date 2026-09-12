/**
 * Assets de la scène d'ouverture. Les fichiers fournis vivent dans
 * `public/assets/boosters/defaut/` (orthographe du dossier conservée telle
 * quelle) — changer de visuel de booster se fait ici et nulle part ailleurs.
 */
export const BOOSTER_OPENING_ASSETS = {
  /** Booster fermé complet. */
  packClosed: "/assets/boosters/defaut/defaut.png",
  /** Bande supérieure arrachée. */
  packOpenTop: "/assets/boosters/defaut/defaut-open-top.png",
  /** Corps du booster ouvert (cartes visibles dans l'ouverture). */
  packOpenBottom: "/assets/boosters/defaut/defaut-open-bottom.png",
  /** Dos de carte. Si absent, la scène dessine un dos de repli en CSS. */
  cardBack: "/assets/cards/card-back.png",
} as const;

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

let preloadPromise: Promise<BoosterOpeningAssetStatus> | null = null;

/**
 * Précharge (une seule fois par session) toutes les images de la scène.
 * Appelée dès l'affichage de la page Boosters pour que le clic sur
 * « Ouvrir » démarre sans attente, puis de nouveau par la scène (mémoïsé).
 */
export function preloadBoosterOpeningAssets(): Promise<BoosterOpeningAssetStatus> {
  if (typeof window === "undefined") return Promise.resolve({ cardBackAvailable: false });
  if (!preloadPromise) {
    preloadPromise = Promise.all([
      preloadImage(BOOSTER_OPENING_ASSETS.packClosed),
      preloadImage(BOOSTER_OPENING_ASSETS.packOpenTop),
      preloadImage(BOOSTER_OPENING_ASSETS.packOpenBottom),
      preloadImage(BOOSTER_OPENING_ASSETS.cardBack),
    ]).then(([, , , cardBack]) => ({ cardBackAvailable: cardBack ?? false }));
  }
  return preloadPromise;
}
