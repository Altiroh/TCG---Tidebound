import type { CosmeticSkin } from "@/game/cosmetics/unlock";
import { isFree } from "@/game/cosmetics/unlock";

/**
 * Cadres de Navire — la seconde famille de Collectables.
 *
 * Source de vérité design : Notion « Cadres de Navire — Collectables ».
 *
 * Même principe que les dos (`cardBacks.ts`) : le catalogue vit en
 * TypeScript, la base ne stocke que ce qui est débloqué
 * (`player_cosmetics`, famille `shipSkin`), et chaque cadre porte sa
 * condition plutôt qu'un simple niveau.
 *
 * Tous partagent le gabarit de `ship-frame-empty.webp` (fenêtre verticale +
 * plaque de nom vierge) : ils se substituent les uns aux autres sans
 * retouche de code. Le plateau n'affiche encore que le cadre d'origine —
 * un cadre obtenu est montré comme tel dans Collectables, avec la mention
 * qui convient, plutôt que passé sous silence.
 */

export interface ShipFrameSkin extends CosmeticSkin {}

/** Famille de cosmétique en base (`player_cosmetics.cosmetic_kind`). */
export const SHIP_FRAME_COSMETIC_KIND = "shipSkin";

export const DEFAULT_SHIP_FRAME_ID = "ship-frame-default";

export const SHIP_FRAMES: readonly ShipFrameSkin[] = [
  {
    id: DEFAULT_SHIP_FRAME_ID,
    label: "Coque d'origine",
    description: "Le cadre de bois ferré et de cordages qui porte chaque Navire en partie.",
    src: "/assets/ships/ship-frame-empty.webp",
    unlock: { kind: "free" },
  },
  {
    // Second cadre gratuit, et assumé : un sélecteur ouvert sur une seule
    // vignette ne donne envie de rien. Sobre exprès — il ne dévalorise
    // aucun cadre gagné, il offre juste un choix dès la première minute.
    id: "ship-skin-fer",
    label: "Coque de fer",
    description: "Acier nu, cordages gris, aucune dorure. La coque de service.",
    src: "/assets/ships/frames/defaut-metal.webp",
    unlock: { kind: "free" },
  },
  {
    id: "ship-skin-palier-10",
    label: "Quart d'or",
    description: "Laiton clair et arche dorée — le premier cadre qu'on gagne.",
    src: "/assets/ships/frames/niveau-10.webp",
    unlock: { kind: "level", level: 10 },
  },
  {
    id: "ship-skin-palier-25",
    label: "Lanternes",
    description: "Bleu de nuit, lanternes allumées et gemmes serties.",
    src: "/assets/ships/frames/niveau-25.webp",
    unlock: { kind: "level", level: 25 },
  },
  {
    id: "ship-skin-abyssal",
    label: "Coque abyssale",
    description: "Une coque remontée des grands fonds, verdie par le sel.",
    src: "/assets/ships/frames/abyssal.webp",
    unlock: { kind: "level", level: 40 },
  },
  {
    id: "ship-skin-palier-50",
    label: "Grand pavois",
    description: "Or, azur et compas — le cadre du palier cinquante.",
    src: "/assets/ships/frames/niveau-50.webp",
    unlock: { kind: "level", level: 50 },
  },
  {
    // Au-delà du dernier palier récompensé (`MAX_REWARDED_LEVEL`) : la
    // condition est évaluée depuis le NIVEAU, pas depuis la table de
    // récompenses, donc elle tient sans y toucher.
    id: "ship-skin-palier-100",
    label: "Centenaire",
    description: "Cristal bleu et ferronnerie noire. Cent niveaux de mer.",
    src: "/assets/ships/frames/niveau-100.webp",
    unlock: { kind: "level", level: 100 },
  },
  {
    id: "ship-skin-concorde",
    label: "Concorde",
    description: "Drapés bleu marine et cordages clairs, sans ornement inutile.",
    src: "/assets/ships/frames/concord.webp",
    unlock: { kind: "purchase", priceTides: 2000 },
  },
  {
    id: "ship-skin-hermes",
    label: "Hermès",
    description: "Ailes déployées, rubans et compas d'or.",
    src: "/assets/ships/frames/hermes.webp",
    unlock: { kind: "purchase", priceTides: 3500 },
  },
  {
    id: "ship-skin-alice",
    label: "Alice",
    description: "Roses, horloge et cartes à jouer — la pièce de prestige du Market.",
    src: "/assets/ships/frames/alice.webp",
    unlock: { kind: "purchase", priceTides: 5000 },
  },
  {
    id: "ship-skin-cordages",
    label: "Cordages",
    description: "Nœuds, poulies et bois clair. Pour un équipage enfin complet.",
    src: "/assets/ships/frames/cordes.webp",
    unlock: { kind: "decksFullyOwned", count: 1 },
  },
  {
    id: "ship-skin-pavillon-noir",
    label: "Pavillon noir",
    description: "Bannières rouges, piques et ferrures. Cinquante victoires.",
    src: "/assets/ships/frames/gothique.webp",
    unlock: { kind: "wins", count: 50 },
  },
  {
    id: "ship-skin-ossuaire",
    label: "Ossuaire",
    description: "Os blanchis et algues vertes — cent parties au compteur.",
    src: "/assets/ships/frames/skelette.webp",
    unlock: { kind: "matches", count: 100 },
  },
  {
    id: "ship-skin-chapardeur",
    label: "Le Chapardeur",
    description: "Rats, horloge volée et fanions. Il en a ouvert, des sachets.",
    src: "/assets/ships/frames/rat.webp",
    unlock: { kind: "boosters", count: 100 },
    hidden: true,
  },
  {
    id: "ship-skin-ombre",
    label: "L'Ombre",
    description: "Voiles noires et cadenas de laiton. Ce qu'on gagne à force de perdre.",
    src: "/assets/ships/frames/shadow.webp",
    unlock: { kind: "losses", count: 200 },
    hidden: true,
  },
];

export function shipFrameById(id: string | null | undefined): ShipFrameSkin | undefined {
  return SHIP_FRAMES.find((frame) => frame.id === id);
}

/** Identifiants déblocables — ceux qui doivent apparaître dans `player_cosmetics`. */
export const UNLOCKABLE_SHIP_FRAME_IDS: readonly string[] = SHIP_FRAMES.filter((frame) => !isFree(frame)).map((frame) => frame.id);
