/**
 * « L'écran est PRÊT » : ce qu'attend l'ombre de changement de page avant
 * de découvrir (retour du 28/09/2026 — on voyait les images se mettre en
 * place, et même l'écran « Chargement… » d'une route, derrière l'ombre
 * déjà retirée).
 *
 * Prêt veut dire :
 *  1. plus d'écran de chargement de route (`[data-screen-loading]`, posé par
 *     `ScreenLoading`) : le vrai contenu est arrivé ;
 *  2. chaque image VISIBLE — `<img>` comme fond ou masque CSS, pseudo-
 *     éléments compris — est téléchargée ET décodée : elle s'affiche d'un
 *     bloc à la première peinture, sans se construire à vue.
 *
 * Toujours borné par `maxMs` : une image perdue ne doit jamais laisser
 * l'écran couvert.
 */

const decoded = new Map<string, Promise<void>>();

/** Nombre maximal d'éléments inspectés : au-delà, le reste attendra sa peinture. */
const MAX_ELEMENTS = 4000;
const URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/g;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Télécharge et décode une image — une seule fois par adresse pour toute la visite. */
function decodeImage(url: string): Promise<void> {
  const known = decoded.get(url);
  if (known) return known;
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  const done = image.decode().catch(() => undefined);
  decoded.set(url, done);
  return done;
}

function inViewport(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function urlsOf(value: string, into: Set<string>) {
  if (!value || value === "none" || !value.includes("url(")) return;
  for (const match of value.matchAll(URL_PATTERN)) {
    const url = match[2];
    if (url && !url.startsWith("data:")) into.add(new URL(url, window.location.href).href);
  }
}

/** Les images qu'on VERRA à la première peinture : `<img>`, fonds et masques CSS, pseudo-éléments. */
function visibleImageUrls(): string[] {
  const urls = new Set<string>();
  const elements = document.body.getElementsByTagName("*");
  const count = Math.min(elements.length, MAX_ELEMENTS);
  for (let index = 0; index < count; index += 1) {
    const element = elements[index]!;
    if (!inViewport(element.getBoundingClientRect())) continue;
    if (element instanceof HTMLImageElement) {
      if (element.loading !== "lazy" || element.complete) urls.add(element.currentSrc || element.src);
      continue;
    }
    for (const pseudo of [null, "::before", "::after"] as const) {
      const style = window.getComputedStyle(element, pseudo);
      if (pseudo && style.content === "none") continue;
      urlsOf(style.backgroundImage, urls);
      urlsOf(style.maskImage || style.getPropertyValue("-webkit-mask-image"), urls);
    }
  }
  urls.delete("");
  return [...urls];
}

/** Avancement du chargement : images décodées sur images attendues. */
export type ReadyProgress = (done: number, total: number) => void;

/**
 * Résout quand l'écran affiché est prêt à être montré, ou au plus tard après
 * `maxMs`. `onProgress` suit le décodage des images (l'écran d'ouverture en
 * tire sa jauge).
 */
export async function waitForPageReady(maxMs: number, onProgress?: ReadyProgress): Promise<void> {
  const deadline = performance.now() + maxMs;
  const left = () => Math.max(0, deadline - performance.now());

  // Laisser React peindre la nouvelle route.
  await nextFrame();
  await nextFrame();
  while (document.querySelector("[data-screen-loading]") && left() > 0) await sleep(40);
  await nextFrame();

  const urls = visibleImageUrls();
  let done = 0;
  onProgress?.(0, urls.length);
  const pending = urls.map((url) =>
    decodeImage(url).then(() => {
      done += 1;
      onProgress?.(done, urls.length);
    })
  );
  if (pending.length > 0) await Promise.race([Promise.all(pending), sleep(left())]);
}
