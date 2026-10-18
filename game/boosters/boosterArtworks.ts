import { hasArtwork, type RareCardArtwork } from "@/game/cosmetics/artworks";
import {
  BOOSTER_DUNGEON_ET_LADALLE,
  BOOSTER_ECLATS_EN_SELLE,
  BOOSTER_ETRANGETE_SOUS_MARINE,
  BOOSTER_LA_MUTATION_MONDIALE,
  BOOSTER_NECESSAIRE_DU_MARIN,
} from "@/game/boosters/pools";

/**
 * RÉPARTITION des illustrations Styled / Styled Full-Art entre les boosters
 * (Collection visuelle V2, 18/10/2026).
 *
 * Notion : « chaque booster consigne explicitement les cartes ET les
 * illustrations précises disponibles ; inscrire une carte n'autorise pas
 * automatiquement toutes ses illustrations ». D'où cette table, booster par
 * booster : une illustration n'existe dans un sachet que si elle y est
 * écrite. Une carte n'y figure que si elle est dans le pool du booster
 * (`tests/game/cardArtworks.test.ts` le vérifie) — l'illustration se tire
 * APRÈS la carte.
 *
 * Répartition de départ : chaque illustration dans le(s) booster(s) d'où sa
 * carte sort déjà. Le Défaut, Poissons pas frais et La Veillée des Disparus
 * n'en ont donc aucune tant qu'une de leurs cartes n'a pas été illustrée.
 * Une Full-Art à repeindre (`aRepeindre`) reste écartée même listée.
 */
const STYLED_ET_FULL_ART: readonly RareCardArtwork[] = ["styled", "styled-fa"];

export const BOOSTER_ARTWORKS: Readonly<Record<string, Readonly<Record<string, readonly RareCardArtwork[]>>>> = {
  [BOOSTER_NECESSAIRE_DU_MARIN]: {
    "chirurgien-du-bord": STYLED_ET_FULL_ART,
    "jugement-du-phare": STYLED_ET_FULL_ART,
    "le-brise-ligne": STYLED_ET_FULL_ART,
    "le-naufrage-impossible": STYLED_ET_FULL_ART,
  },
  [BOOSTER_ETRANGETE_SOUS_MARINE]: {
    "il-capitano-naufrage": STYLED_ET_FULL_ART,
  },
  [BOOSTER_ECLATS_EN_SELLE]: {
    "bretteuse-au-bord": STYLED_ET_FULL_ART,
    "eclaireur-ebreche": STYLED_ET_FULL_ART,
    "le-brise-ligne": STYLED_ET_FULL_ART,
  },
  [BOOSTER_LA_MUTATION_MONDIALE]: {
    "aberration-vorace": STYLED_ET_FULL_ART,
    "la-revenante": STYLED_ET_FULL_ART,
  },
  [BOOSTER_DUNGEON_ET_LADALLE]: {
    "elyor-opalin-du-retour": STYLED_ET_FULL_ART,
    "gaston-aventurier-de-ladalle": STYLED_ET_FULL_ART,
    "la-taverne-avant-le-donjon": STYLED_ET_FULL_ART,
    "le-nain-qui-connait-un-raccourci": STYLED_ET_FULL_ART,
    "relance-j-te-jure": STYLED_ET_FULL_ART,
  },
};

/** Illustrations qu'un booster propose pour une carte de son pool (aucune si elle n'est pas répartie là). */
export function boosterArtworksFor(boosterId: string, cardId: string): RareCardArtwork[] {
  return (BOOSTER_ARTWORKS[boosterId]?.[cardId] ?? []).filter((artwork) => hasArtwork(cardId, artwork));
}

/** Toutes les illustrations obtenables dans un booster : la liste « Cartes de l'extension ». */
export function boosterArtworkEntries(boosterId: string): Array<{ cardId: string; artwork: RareCardArtwork }> {
  return Object.keys(BOOSTER_ARTWORKS[boosterId] ?? {}).flatMap((cardId) => boosterArtworksFor(boosterId, cardId).map((artwork) => ({ cardId, artwork })));
}
