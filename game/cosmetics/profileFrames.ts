import type { CosmeticSkin } from "@/game/cosmetics/unlock";

/**
 * CADRES DE PROFIL — le cadre de la PHOTO du capitaine (profil, fiche des
 * Amis). Troisième famille de Collectables (27/10/2026), créée pour tenir
 * les promesses de la route des paliers : niveaux 5, 35 et 50.
 *
 * Déblocage PAR NIVEAU (`unlock.kind === "level"`) : la synchronisation des
 * Collectables les accorde d'elle-même à quiconque a déjà le niveau —
 * ceux qui avaient réclamé ces paliers avant que le cadre existe le
 * trouvent donc dans leur inventaire sans rien faire.
 *
 * Visuels : `public/assets/profile/frames/<nom>.webp`, au format du cadre
 * d'origine (`photo-frame.webp` : même cadrage, même fenêtre transparente).
 * Tant que l'image n'est pas déposée, le cadre est `artPending` : il se
 * montre, ne s'équipe pas. `tests/game/profileFrames.test.ts` exige de
 * retirer le drapeau dès que le fichier existe.
 */

export interface ProfileFrameSkin extends CosmeticSkin {}

/** Famille de cosmétique en base (`player_cosmetics.cosmetic_kind`) — celle qu'écrivait déjà `claim_level_rewards`. */
export const PROFILE_FRAME_COSMETIC_KIND = "frame";

export const DEFAULT_PROFILE_FRAME_ID = "frame-default";

export const PROFILE_FRAMES: readonly ProfileFrameSkin[] = [
  {
    id: DEFAULT_PROFILE_FRAME_ID,
    label: "Polaroïd du bord",
    description: "Le cadre de papier épinglé de chaque capitaine.",
    src: "/assets/profile/photo-frame.webp",
    unlock: { kind: "free" },
  },
  {
    id: "frame-mousse",
    label: "Mousse",
    description: "Le premier cadre gagné à bord : celui du mousse qui a tenu ses cinq premiers niveaux.",
    src: "/assets/profile/frames/mousse.webp",
    unlock: { kind: "level", level: 5 },
    artPending: true,
  },
  {
    id: "frame-vieux-loup",
    label: "Vieux Loup de Mer",
    description: "Bois usé par le sel et cordages : le cadre de ceux qui ont trente-cinq niveaux de mer.",
    src: "/assets/profile/frames/vieux-loup.webp",
    unlock: { kind: "level", level: 35 },
    artPending: true,
  },
  {
    id: "frame-prestige-50",
    label: "Prestige",
    description: "Le cadre doré du niveau 50.",
    src: "/assets/profile/frames/prestige-50.webp",
    unlock: { kind: "level", level: 50 },
    artPending: true,
  },
];

export function profileFrameById(id: string | null | undefined): ProfileFrameSkin | undefined {
  if (!id) return undefined;
  return PROFILE_FRAMES.find((frame) => frame.id === id);
}

/** Le visuel à poser sur la photo : celui du cadre porté, ou celui d'origine (inconnu, ou pas encore peint). */
export function profileFrameSrc(id: string | null | undefined): string {
  const frame = profileFrameById(id);
  return frame && !frame.artPending ? frame.src : PROFILE_FRAMES[0]!.src;
}
