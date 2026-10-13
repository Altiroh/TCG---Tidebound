"use client";

import { useEffect, useState } from "react";

/**
 * La SILHOUETTE utile d'une image : ses proportions et la boîte de ses
 * pixels opaques, en fractions de l'image. Un cadre de Navire peint sur
 * un fond transparent n'occupe qu'une partie de son fichier ; un halo
 * calé sur le fichier flottait autour du vide (retour du 13/10/2026).
 *
 * Mesure faite une fois par image (cache par URL), sur une copie réduite
 * à 96 px de côté — la précision d'un halo, pas d'un détourage. Image
 * d'une autre origine, ou mesure impossible : `null`, l'appelant garde
 * la boîte entière.
 */
export interface OpaqueBox {
  /** Largeur / hauteur de l'image. */
  ratio: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const cache = new Map<string, Promise<OpaqueBox | null>>();

function measure(src: string): Promise<OpaqueBox | null> {
  const cached = cache.get(src);
  if (cached) return cached;
  const promise = new Promise<OpaqueBox | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onerror = () => resolve(null);
    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      if (!width || !height) return resolve(null);
      const scale = Math.min(1, 96 / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve({ ratio: width / height, left: 0, top: 0, right: 0, bottom: 0 });
        context.drawImage(image, 0, 0, w, h);
        const { data } = context.getImageData(0, 0, w, h);
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (data[(y * w + x) * 4 + 3]! > 24) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return resolve({ ratio: width / height, left: 0, top: 0, right: 0, bottom: 0 });
        resolve({ ratio: width / height, left: minX / w, top: minY / h, right: 1 - (maxX + 1) / w, bottom: 1 - (maxY + 1) / h });
      } catch {
        resolve({ ratio: width / height, left: 0, top: 0, right: 0, bottom: 0 });
      }
    };
    image.src = src;
  });
  cache.set(src, promise);
  return promise;
}

export function useOpaqueBox(src: string | null): OpaqueBox | null {
  const [box, setBox] = useState<OpaqueBox | null>(null);
  useEffect(() => {
    if (!src) return undefined;
    let alive = true;
    void measure(src).then((result) => alive && setBox(result));
    return () => {
      alive = false;
    };
  }, [src]);
  return src ? box : null;
}
