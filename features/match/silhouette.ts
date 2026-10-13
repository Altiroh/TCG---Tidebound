/**
 * SILHOUETTE d'une unité du plateau, pour les effets qui la recouvrent ou
 * l'entourent (voile de soin, voile de maladie, poussière d'un choc).
 *
 * Une carte est un rectangle aux coins arrondis ; un JETON (Péon, Éclat
 * Chromatique…) a un cadre OVALE, transparent autour (`cards/frames/
 * token.webp`). Un effet qui dessinait le rectangle laissait voir, autour du
 * jeton, le contour d'une carte qui n'existe pas (12/10/2026). Le plateau
 * marque les jetons (`data-token`, `TableBoard`) ; les effets lisent ici
 * quelle forme épouser.
 */
export type Silhouette = "card" | "oval" | "ship";

/**
 * Un NAVIRE n'a pas non plus la forme d'une carte : son cadre est une arche
 * posée sur une plaque (`TableShip`, `data-ship-frame`). Un effet qui le
 * recouvre prend la forme de son cadre (`silhouetteMask`).
 */
export function silhouetteOf(el: Element | null | undefined): Silhouette {
  if (!(el instanceof HTMLElement)) return "card";
  if (el.dataset.token !== undefined) return "oval";
  if (el.dataset.shipFrame !== undefined) return "ship";
  return "card";
}

/**
 * La FACE visible d'une unité du plateau : la carte elle-même (`CardTile`),
 * et non son enveloppe de plateau, un peu plus haute et sans ses coins
 * arrondis — un halo posé sur l'enveloppe laissait un liseré vide entre la
 * carte et sa lumière (13/10/2026). Un Navire est déjà son cadre.
 */
export function faceOf(el: HTMLElement): HTMLElement {
  if (silhouetteOf(el) === "ship") return el;
  return el.querySelector<HTMLElement>(":scope > button") ?? el;
}

/**
 * Masque CSS qui découpe un effet à la forme exacte d'un Navire : l'image de
 * son cadre (opaque partout où il y a du cadre), unie à la fenêtre de
 * l'arche où se voit l'illustration (transparente dans l'image du cadre).
 * `null` pour une carte ou un jeton, que `border-radius` suffit à épouser.
 */
export function silhouetteMask(el: Element | null | undefined): Record<string, string> | null {
  if (silhouetteOf(el) !== "ship") return null;
  const frame = (el as HTMLElement).querySelector<HTMLImageElement>("img[data-ship-frame-img]");
  const art = (el as HTMLElement).querySelector<HTMLElement>("[data-ship-art]");
  if (!frame?.src) return null;
  // En pixels, mesurés : un `mask-position` en % se compte sur la place LIBRE, pas sur le cadre.
  const box = (el as HTMLElement).getBoundingClientRect();
  const window = art?.getBoundingClientRect();
  const layers =
    window && window.width > 0
      ? {
          image: `url("${frame.src}"), ${archLayer(art!)}`,
          size: `100% 100%, ${window.width}px ${window.height}px`,
          position: `0 0, ${window.left - box.left}px ${window.top - box.top}px`,
        }
      : { image: `url("${frame.src}")`, size: "100% 100%", position: "0 0" };
  return {
    maskImage: layers.image,
    WebkitMaskImage: layers.image,
    maskSize: layers.size,
    WebkitMaskSize: layers.size,
    maskPosition: layers.position,
    WebkitMaskPosition: layers.position,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskComposite: "add",
    WebkitMaskComposite: "source-over",
  };
}

/**
 * La fenêtre de l'arche en calque de masque : son contour (`clip-path:
 * polygon(...)` en % de la fenêtre) redessiné en SVG. Un simple rectangle
 * débordait au-dessus de l'arche, dans ses coins.
 */
function archLayer(art: HTMLElement): string {
  const clip = art.style.clipPath;
  const inner = /^polygon\((.*)\)$/.exec(clip.trim())?.[1];
  if (!inner) return "linear-gradient(#000, #000)";
  const points = inner
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).map((v) => parseFloat(v)))
    .filter((xy) => xy.length === 2 && xy.every(Number.isFinite))
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="${points}" fill="black"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
