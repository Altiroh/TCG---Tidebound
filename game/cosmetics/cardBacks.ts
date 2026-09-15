/**
 * Dos de carte — la première famille de cosmétiques réellement jouable.
 *
 * Les autres familles annoncées par la table de paliers (cadres, titres,
 * avatars, cosmétiques de Navire) sont débloquées et stockées
 * (`player_cosmetics`) mais n'ont pas encore de rendu ; les dos, eux, ont
 * leurs deux visuels et se voient en partie dès le premier tour — c'est
 * donc par eux que la personnalisation commence.
 *
 * Le catalogue vit ICI, en TypeScript, et pas en base : la base ne stocke
 * que l'identifiant débloqué et celui équipé. Ajouter un dos, c'est ajouter
 * une ligne, pas une migration.
 */

export interface CardBackSkin {
  /** Identifiant stocké dans `player_cosmetics.cosmetic_id`. */
  id: string;
  label: string;
  /** Une phrase, affichée sous la vignette dans le sélecteur du profil. */
  description: string;
  src: string;
  /**
   * `true` si tous les joueurs l'ont d'office. Un dos gratuit n'est jamais
   * écrit dans `player_cosmetics` : c'est le repli, il doit rester
   * sélectionnable même sur un compte neuf ou hors ligne.
   */
  free: boolean;
  /** Niveau qui le débloque, pour l'afficher dans le sélecteur. */
  unlockLevel?: number;
}

/** Dos par défaut, possédé par tout le monde. */
export const DEFAULT_CARD_BACK_ID = "default";

/** Le dos par défaut, déclaré à part : c'est le repli de `cardBackSrc`. */
const DEFAULT_CARD_BACK: CardBackSkin = {
  id: DEFAULT_CARD_BACK_ID,
  label: "Rose des vents",
  description: "Le dos d'origine : rose des vents dorée sur bleu de nuit.",
  src: "/assets/cards/card-back/default.webp",
  free: true,
};

export const CARD_BACKS: readonly CardBackSkin[] = [
  DEFAULT_CARD_BACK,
  {
    id: "back-ogee",
    label: "Épave engloutie",
    description: "Bronze vert-de-gris, cordages et bernacles — récupéré par le fond.",
    src: "/assets/cards/card-back/ogee.webp",
    free: false,
    unlockLevel: 25,
  },
];

export function cardBackById(id: string | null | undefined): CardBackSkin | undefined {
  return CARD_BACKS.find((back) => back.id === id);
}

/**
 * Chemin du dos à afficher. Tolérant par construction : un identifiant
 * inconnu (cosmétique retiré du catalogue, valeur corrompue) retombe sur le
 * dos par défaut plutôt que de casser l'affichage d'une partie en cours.
 */
export function cardBackSrc(id: string | null | undefined): string {
  return (cardBackById(id) ?? DEFAULT_CARD_BACK).src;
}

/**
 * Dos ACCORDÉS par la progression mais qui n'ont pas encore leur visuel.
 *
 * Ils sont bien débloqués et stockés (`player_cosmetics`) — le palier n'est
 * pas menteur — mais le sélecteur ne les propose pas, faute d'image. Déclarés
 * ICI plutôt que passés sous silence : le test du catalogue vérifie que tout
 * dos récompensé est soit affichable, soit listé en attente, pour qu'un
 * palier ne crédite jamais un cosmétique fantôme par accident.
 *
 * À vider au fur et à mesure que les visuels arrivent.
 */
export const PENDING_CARD_BACK_IDS: readonly string[] = ["back-prestige-50"];

/** Identifiants déblocables — ceux qui doivent apparaître dans `player_cosmetics`. */
export const UNLOCKABLE_CARD_BACK_IDS: readonly string[] = CARD_BACKS.filter((back) => !back.free).map((back) => back.id);
