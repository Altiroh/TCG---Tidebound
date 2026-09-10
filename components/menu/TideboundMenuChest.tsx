"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

/**
 * Configuration centralisée des textures du coffret. `chestBase` est
 * aujourd'hui le seul asset réel (le PNG plat déposé par l'utilisateur,
 * `public/assets/menu/box/menu_box_base.png`) : il contient encore le
 * panneau supérieur, le cadre, l'illustration, les coins métalliques, les
 * cordages, le panneau frontal et la serrure fondus ensemble. Les autres
 * clés existent déjà dans la structure pour que chaque calque puisse
 * recevoir sa propre image dès qu'elle est fournie, sans reprendre
 * l'architecture des composants — seul `ChestRoot` (plus bas) aurait alors
 * à afficher chaque calque séparément au lieu de s'appuyer sur `chestBase`
 * pour tout.
 */
export const TIDEBOUND_MENU_ASSETS = {
  chestBase: "/assets/menu/box/menu_box_base.png",
  topArtwork: undefined as string | undefined,
  logo: undefined as string | undefined,
  cornerMetal: undefined as string | undefined,
  rope: undefined as string | undefined,
  lock: undefined as string | undefined,
  buttonMain: undefined as string | undefined,
  buttonSecondaryA: undefined as string | undefined,
  buttonSecondaryB: undefined as string | undefined,
} satisfies Record<string, string | undefined>;

export interface ChestSlotDef {
  id: "main" | "secondaryA" | "secondaryB";
  label: string;
  href?: Route | string;
  disabled?: boolean;
  variant: "primary" | "secondary";
  /** Position en % relative au coffret entier (mesurée sur menu_box_base.png, 1448×1086). */
  rect: { x: number; y: number; w: number; h: number };
}

// Emplacements mesurés directement sur l'image (grille de repérage en %,
// bords extérieurs du cadre laiton de chaque plaque) — pas les valeurs
// approximatives d'origine, affinées par analyse réelle de l'asset.
const SLOTS: ChestSlotDef[] = [
  { id: "main", label: "Jouer", href: "/partie", variant: "primary", rect: { x: 24, y: 37, w: 52, h: 10 } },
  { id: "secondaryA", label: "Market", disabled: true, variant: "secondary", rect: { x: 15, y: 50, w: 30, h: 11 } },
  { id: "secondaryB", label: "Collection", href: "/collection", variant: "secondary", rect: { x: 55, y: 50, w: 30, h: 11 } },
];

/**
 * ChestRoot — objet racine du menu principal.
 *
 * Décomposition visée (cf. conversation) :
 *   ChestRoot
 *   ├── TopPanel / TopFrame / TopArtwork / MetalCorners / Rope×2 /
 *   │   BottomFrontPanel / CentralLock / DecorativeDetails
 *   │     → fondus dans `chestBase` tant que ces assets n'existent pas
 *   │       séparément (cf. `TIDEBOUND_MENU_ASSETS`)
 *   ├── MenuSurface
 *   │     └── MainButtonSlot / SecondaryButtonSlotLeft / SecondaryButtonSlotRight
 *   │           → objets réels (`ChestButtonSlot`), pas des hotspots
 *   │             invisibles posés sur l'image : chacun porte son propre
 *   │             relief encastré, indépendant du bouton qu'il contient.
 *
 * Le survol/mouvement de souris incline légèrement tout le coffret
 * (±1°/±1.5°, cf. section 9) ; désactivé si `prefers-reduced-motion` ou
 * sur pointeur tactile.
 */
export function TideboundMenuChest() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (matchMedia("(pointer: coarse)").matches) return;

    let raf = 0;
    function onMove(e: PointerEvent) {
      const rect = root!.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root!.style.setProperty("--tilt-x", (ny * -2).toFixed(2)); // rotateX, max ~±1°
        root!.style.setProperty("--tilt-y", (nx * 3).toFixed(2)); //  rotateY, max ~±1.5°
      });
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div
      ref={rootRef}
      className="chest-root relative mx-auto w-full"
      style={{
        // Contraint par la largeur ET la hauteur disponibles (sinon la
        // boîte déborde verticalement sur les écrans larges mais courts,
        // ex : un laptop en paysage) — 1448/1086 = le ratio réel de l'asset.
        width: "min(90vw, 1400px, calc(85vh * 1448 / 1086))",
        aspectRatio: "1448 / 1086",
        perspective: "1400px",
      }}
    >
      <div className="chest-tilt relative h-full w-full">
        <Image
          src={TIDEBOUND_MENU_ASSETS.chestBase}
          alt="Tidebound"
          fill
          priority
          sizes="min(90vw, 1400px)"
          draggable={false}
          className="select-none object-contain drop-shadow-[0_30px_50px_rgba(0,0,0,0.6)]"
        />

        {SLOTS.map((slot) => (
          <ChestButtonSlot key={slot.id} slot={slot} />
        ))}
      </div>
    </div>
  );
}

/**
 * Un emplacement de bouton physique du coffret. Porte son propre relief
 * "encastré" (ombre interne + liseré) indépendamment du `TideboundButton`
 * qu'il contient : le slot existe comme objet visuel même si le bouton
 * change de variante ou de texture plus tard.
 */
function ChestButtonSlot({ slot }: { slot: ChestSlotDef }) {
  const { rect } = slot;
  return (
    <div
      className="absolute"
      style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[10%/28%] shadow-[inset_0_3px_8px_rgba(0,0,0,0.5),inset_0_-1px_0_rgba(255,255,255,0.06)]" />
      <TideboundButton slot={slot} />
    </div>
  );
}

/**
 * Bouton interactif réutilisable — épouse la forme de son `ChestSlotDef`
 * (posé en `inset` dans `ChestButtonSlot`, jamais un rectangle générique
 * flottant par-dessus l'illustration). Normal/hover/pressed/disabled gérés
 * en CSS (pas de state React nécessaire pour un simple bouton de menu).
 */
function TideboundButton({ slot }: { slot: ChestSlotDef }) {
  const { label, href, disabled, variant } = slot;
  const isPrimary = variant === "primary";

  const base =
    "absolute inset-[6%] flex items-center justify-center rounded-[10%/28%] text-center uppercase tracking-[0.12em] " +
    "font-[var(--font-menu)] font-bold transition-[transform,filter,box-shadow] duration-[180ms] ease-out " +
    (isPrimary ? "text-lg sm:text-2xl" : "text-xs sm:text-base");

  if (disabled || !href) {
    return (
      <span className={`${base} cursor-not-allowed text-slate-400/60`} aria-disabled>
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href as Route}
      className={
        base +
        " text-[#e8c988] [text-shadow:0_1px_0_rgba(255,238,200,0.25),0_2px_3px_rgba(0,0,0,0.75)]" +
        " hover:-translate-y-[2px] hover:brightness-125 hover:shadow-[0_0_14px_rgba(201,161,90,0.5)]" +
        " active:translate-y-[1px] active:brightness-90 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.6)]"
      }
    >
      {label}
    </Link>
  );
}
