"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { ChestButtons3D } from "@/components/menu/ChestButtons3D";

/**
 * Configuration centralisée des textures du coffret. `chestBase` est
 * aujourd'hui le seul asset réel (le PNG plat déposé par l'utilisateur,
 * `public/assets/menu/box/menu_box_base.png`) : il contient encore le
 * panneau supérieur, le cadre, l'illustration, les coins métalliques, les
 * cordages, le panneau frontal et la serrure fondus ensemble. Les autres
 * clés existent déjà dans la structure pour que chaque calque/bouton
 * puisse recevoir sa propre image dès qu'elle est fournie — voir
 * `ChestButtons3D` pour la bascule texture réelle / dégradé procédural de
 * secours, bouton par bouton.
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
  iconOptions: undefined as string | undefined,
  iconQuit: undefined as string | undefined,
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

export interface ChestIconSlotDef {
  id: "options" | "quit";
  label: string;
  icon: "gear" | "power";
  texKey: "iconOptions" | "iconQuit";
  href?: Route | string;
  disabled?: boolean;
  rect: { x: number; y: number; w: number; h: number };
}

// Emplacements mesurés directement sur l'image (grille de repérage en %,
// bords extérieurs du cadre laiton de chaque plaque) — pas des valeurs
// approximatives, affinées par analyse réelle de l'asset.
const SLOTS: ChestSlotDef[] = [
  { id: "main", label: "Jouer", href: "/partie", variant: "primary", rect: { x: 24, y: 37, w: 52, h: 10 } },
  { id: "secondaryA", label: "Market", disabled: true, variant: "secondary", rect: { x: 15, y: 50, w: 30, h: 11 } },
  { id: "secondaryB", label: "Collection", href: "/collection", variant: "secondary", rect: { x: 55, y: 50, w: 30, h: 11 } },
];

// Aucun emplacement dédié pour Options/Quitter n'existe dans l'illustration
// (elle ne montre que les 3 plaques) — positions choisies sous les plaques
// secondaires, sur une zone de bois "neutre". Désactivés pour l'instant :
// aucune page Options n'existe, et "Quitter" n'a pas de sens pour une PWA
// web (fermer un onglet n'est pas déclenchable proprement en JS) — la
// structure est prête, à activer/repositionner dès qu'une vraie
// destination existe.
const ICON_SLOTS: ChestIconSlotDef[] = [
  { id: "options", label: "Options", icon: "gear", texKey: "iconOptions", disabled: true, rect: { x: 27, y: 63, w: 6, h: 6 } },
  { id: "quit", label: "Quitter", icon: "power", texKey: "iconQuit", disabled: true, rect: { x: 67, y: 63, w: 6, h: 6 } },
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
 *   └── ChestButtons3D (Three.js) : les 3 plaques + les 2 icônes sont de
 *       vrais maillages 3D extrudés/biseautés, testés par raycasting — pas
 *       des rectangles HTML posés sur l'image.
 *
 * Le survol/mouvement de souris incline légèrement tout le coffret
 * (±1°/±1.5°, cf. section 9) ; désactivé si `prefers-reduced-motion` ou
 * sur pointeur tactile. Un `<nav>` visuellement masqué (`sr-only`) donne un
 * accès clavier/lecteur d'écran réel, le canvas WebGL n'étant pas
 * focusable élément par élément.
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

        <ChestButtons3D slots={SLOTS} iconSlots={ICON_SLOTS} />

        <nav className="sr-only" aria-label="Menu Tidebound">
          {SLOTS.map((slot) =>
            slot.disabled || !slot.href ? (
              <span key={slot.id} aria-disabled>
                {slot.label}
              </span>
            ) : (
              <Link key={slot.id} href={slot.href as Route}>
                {slot.label}
              </Link>
            )
          )}
          {ICON_SLOTS.map((icon) =>
            icon.disabled || !icon.href ? (
              <span key={icon.id} aria-disabled>
                {icon.label}
              </span>
            ) : (
              <Link key={icon.id} href={icon.href as Route}>
                {icon.label}
              </Link>
            )
          )}
        </nav>
      </div>
    </div>
  );
}
