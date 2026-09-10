"use client";

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
  buttonMain: "/assets/menu/buttons/button_main.png" as string | undefined,
  buttonSecondaryA: "/assets/menu/buttons/button_secondary_a.png" as string | undefined,
  buttonSecondaryB: "/assets/menu/buttons/button_secondary_b.png" as string | undefined,
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

// Emplacements des 3 plaques mesurés par analyse de pixels de
// menu_box_base.png : profil de la fraction de pixels "laiton" (teinte
// dorée distincte) le long de chaque ligne/colonne, pour repérer précisément
// le bord EXTÉRIEUR du cadre peint de chaque panneau (pas à l'oeil, pas le
// remplissage bois intérieur — une plaque calée sur le seul remplissage
// laissait deviner tout le bandeau doré autour, perçu comme "mal
// dimensionné"). Le cadre extérieur des 2 panneaux secondaires n'est PAS
// identique dans l'illustration (largeur ~32.7% à gauche contre ~33.1% à
// droite), d'où des gabarits légèrement différents plutôt qu'un simple
// miroir. `secondaryA`/`secondaryB` sont positionnées sur le panneau dont la
// teinte de fond correspond à leur propre illustration (secondaryA/Market =
// panneau sarcelle à droite, secondaryB/Collection = panneau bordeaux à
// gauche) : elles étaient inversées auparavant, ce qui faisait ressortir un
// liseré de la mauvaise couleur. Comme le gabarit correspond maintenant déjà
// au bord extérieur réel, `OVERSCAN` dans ChestButtons3D est passé à 1.0 —
// le conserver à 1.08 ici ferait déborder la plaque au-delà du cadre peint.
const SLOTS: ChestSlotDef[] = [
  { id: "main", label: "Jouer", href: "/partie", variant: "primary", rect: { x: 27, y: 37.6, w: 44.9, h: 10.5 } },
  { id: "secondaryA", label: "Market", disabled: true, variant: "secondary", rect: { x: 54.1, y: 50.6, w: 33.1, h: 11.8 } },
  { id: "secondaryB", label: "Collection", href: "/collection", variant: "secondary", rect: { x: 12.6, y: 50.6, w: 32.7, h: 11.8 } },
];

// Pas de bouton Options pour l'instant : aucune page Options n'existe encore
// et l'illustration ne montre que les 3 plaques (aucun emplacement dédié) —
// à réintroduire avec un vrai emplacement/href une fois la page prête.
const ICON_SLOTS: ChestIconSlotDef[] = [];

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
 * La boîte ne réagit plus à la souris (le tilt suivant le curseur a été
 * retiré à la demande de l'utilisateur — trop distrayant) ; il ne reste que
 * le léger flottement vertical continu (`chest-float`, cf. globals.css). Un
 * `<nav>` visuellement masqué (`sr-only`) donne un accès clavier/lecteur
 * d'écran réel, le canvas WebGL n'étant pas focusable élément par élément.
 */
export function TideboundMenuChest() {
  return (
    <div
      className="chest-root relative mx-auto w-full"
      style={{
        // Contraint par la largeur ET la hauteur disponibles (sinon la
        // boîte déborde verticalement sur les écrans larges mais courts,
        // ex : un laptop en paysage) — 1448/1086 = le ratio réel de l'asset.
        width: "min(90vw, 1400px, calc(85vh * 1448 / 1086))",
        aspectRatio: "1448 / 1086",
      }}
    >
      <div className="relative h-full w-full">
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
