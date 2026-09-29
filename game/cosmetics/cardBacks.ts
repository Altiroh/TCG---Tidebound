import type { CosmeticSkin, CosmeticUnlock } from "@/game/cosmetics/unlock";
import { isFree } from "@/game/cosmetics/unlock";

/**
 * Dos de carte — la première famille de Collectables réellement jouable.
 *
 * Source de vérité design : Notion « Dos de carte — Collectables ».
 *
 * Le catalogue vit ICI, en TypeScript, et pas en base : la base ne stocke
 * que l'identifiant débloqué et celui équipé. Ajouter un dos, c'est ajouter
 * une ligne, pas une migration.
 *
 * Chaque dos porte sa CONDITION (`unlock`) plutôt qu'un simple niveau :
 * boutique, collection, statistique de match, maîtrise d'archétype. Elles
 * sont évaluées à partir des compteurs persistés
 * (`game/cosmetics/unlock.ts`), donc rattrapables — ajouter un dos le
 * débloque immédiatement pour qui remplit déjà sa condition.
 */

export interface CardBackSkin extends CosmeticSkin {}

/** Famille de cosmétique en base (`player_cosmetics.cosmetic_kind`). */
export const CARD_BACK_COSMETIC_KIND = "cardBack";

/** Dos par défaut, possédé par tout le monde. */
export const DEFAULT_CARD_BACK_ID = "default";

/** Le dos par défaut, déclaré à part : c'est le repli de `cardBackSrc`. */
const DEFAULT_CARD_BACK: CardBackSkin = {
  id: DEFAULT_CARD_BACK_ID,
  label: "Rose des vents",
  description: "Le dos d'origine : rose des vents dorée sur bleu de nuit.",
  src: "/assets/cards/card-back/default.webp",
  unlock: { kind: "free" },
};

/**
 * Les trois Abyssales de l'archétype Cra-Poiscail.
 *
 * La spec en annonce TROIS ; le catalogue n'en contient que deux à ce jour
 * (`game/cards/sets/core.ts`). La condition porte donc sur celles qui
 * existent : elle reste atteignable, et la troisième s'ajoute ici le jour
 * où la carte est créée — sans toucher au reste.
 */
const CRA_POISCAIL_ABYSSALES: readonly string[] = ["roi-cra-poiscail-abyssal", "chevalier-cra-poiscail-abyssal"];

export const CARD_BACKS: readonly CardBackSkin[] = [
  DEFAULT_CARD_BACK,
  {
    id: "back-ogee",
    label: "Épave engloutie",
    description: "Bronze vert-de-gris, cordages et bernacles — récupéré par le fond.",
    src: "/assets/cards/card-back/ogee.webp",
    unlock: { kind: "level", level: 25 },
  },
  {
    id: "back-abyssal",
    label: "Abyssal",
    description: "Turquoise et or, la rose des vents portée par la houle. En vente au Market.",
    src: "/assets/cards/card-back/abyssal.webp",
    unlock: { kind: "purchase", priceTides: 2000 },
  },
  {
    id: "back-cra-plage",
    label: "Cra-plage",
    description: "Le Cra-Poiscail en vacances, coquillages compris. Récompense de maîtrise de l'archétype.",
    src: "/assets/cards/card-back/cra-plage.webp",
    unlock: { kind: "ownsCards", cardIds: CRA_POISCAIL_ABYSSALES, label: "Les Abyssales Cra-Poiscail" },
  },
  {
    id: "back-collecteur",
    label: "Collecteur",
    description: "Des cadres dans des cadres, à l'infini. Pour qui a vraiment tout ramassé.",
    src: "/assets/cards/card-back/collecteur.webp",
    unlock: { kind: "distinctCards", count: 100 },
    hidden: true,
  },
  {
    id: "back-chat-noir",
    label: "Chat noir",
    description: "Quatre chats noirs et des croissants de lune. La malchance finit par payer.",
    src: "/assets/cards/card-back/chat-noir.webp",
    unlock: { kind: "losses", count: 200 },
    hidden: true,
  },
  {
    id: "back-attrapez-les-tous",
    label: "Attrapez-les tous",
    description: "La collection complète, ou presque : la houle blanche autour de la rose des vents.",
    src: "/assets/cards/card-back/attrapez-les-tous.webp",
    unlock: { kind: "distinctCards", count: 250 },
  },
  {
    id: "back-prestige-50",
    label: "Prestige",
    description: "Argent bruni, couronne et rose des vents — le dos du niveau 50.",
    src: "/assets/cards/card-back/palier-50.webp",
    unlock: { kind: "level", level: 50 },
  },
  /*
   * Le Collectable du SECRET de la bougie : on le trouve en soufflant la
   * bougie du décor (menu, Collection, Decks). Caché tant qu'il n'est pas
   * trouvé (Notion « Dos de carte — Collectables »).
   */
  {
    id: "back-derniere-chandelle",
    label: "Dernière chandelle",
    description: "Cire coulée et mèche encore fumante. Pour qui a soufflé la bougie du navigateur — et l'a rallumée.",
    src: "/assets/cards/card-back/derniere-chandelle.webp",
    unlock: { kind: "secret", secret: "bougie" },
    hidden: true,
  },
  /*
   * Les six dos du 29/09/2026 — noms validés par la propriétaire. Trois
   * s'achètent (deux en Tides, un en Jetons de Préconstruit), trois se
   * gagnent sur les statistiques à vie (`game/quests/matchStats.ts`), dont
   * deux cachés : on les découvre en réussissant le coup, pas en le lisant.
   */
  {
    id: "back-oeil-du-maelstrom",
    label: "Œil du Maelström",
    description: "L'or tourne autour d'une perle, et la mer entière avec. En vente au Market.",
    src: "/assets/cards/card-back/gold-center.webp",
    unlock: { kind: "purchase", priceTides: 8000 },
  },
  {
    id: "back-cuirasse-du-leviathan",
    label: "Cuirasse du Léviathan",
    description: "Écailles vert-de-gris sous un bouclier de laiton martelé. En vente au Market.",
    src: "/assets/cards/card-back/ruined.webp",
    unlock: { kind: "purchase", priceTides: 10000 },
  },
  {
    id: "back-la-consigne",
    label: "La Consigne",
    description: "Des capsules rouillées à perte de vue. Rendez vos Jetons, on vous rend la monnaie.",
    src: "/assets/cards/card-back/jeton.webp",
    unlock: { kind: "purchaseTokens", priceTokens: 3 },
  },
  {
    id: "back-puits-sans-fond",
    label: "Le Puits sans fond",
    description: "Cinq unités adverses englouties d'un seul coup. Le tourbillon, lui, a encore faim.",
    src: "/assets/cards/card-back/not-yu-gi.webp",
    unlock: {
      kind: "matchRecord",
      stat: "max_destroyed_at_once",
      count: 5,
      label: "Détruire 5 unités adverses en même temps",
    },
    hidden: true,
  },
  {
    id: "back-le-rassemblement",
    label: "Le Rassemblement",
    description: "Cinq pierres autour de la rose des vents : le Navire a tiré, l'autre a coulé.",
    src: "/assets/cards/card-back/so-magique.webp",
    unlock: {
      kind: "lifetimeStat",
      stat: "lethal_by_ship_ability",
      count: 1,
      label: "Couler l'adversaire d'une capacité de Navire",
    },
    hidden: true,
  },
  {
    id: "back-rose-de-jade",
    label: "Rose de jade",
    description: "La rose des vents taillée dans le jade. Froide, lisse, et jamais prise de Déraison.",
    src: "/assets/cards/card-back/jade.webp",
    unlock: {
      kind: "lifetimeStat",
      stat: "win_without_deraison",
      count: 25,
      label: "25 victoires sans jamais passer en Déraison",
    },
  },
];

export function cardBackById(id: string | null | undefined): CardBackSkin | undefined {
  return CARD_BACKS.find((back) => back.id === id);
}

/**
 * Chemin du dos à afficher. Tolérant par construction : un identifiant
 * inconnu (cosmétique retiré du catalogue, valeur corrompue) retombe sur le
 * dos par défaut plutôt que de casser l'affichage d'une partie en cours.
 * Un dos dont le visuel n'est pas produit retombe aussi sur le défaut —
 * il n'est pas équipable, mais rien n'interdit qu'une valeur périmée traîne
 * en base.
 */
export function cardBackSrc(id: string | null | undefined): string {
  const back = cardBackById(id);
  return back && !back.artPending ? back.src : DEFAULT_CARD_BACK.src;
}

/**
 * Dos ACCORDÉS par la progression mais qui n'ont pas encore leur visuel.
 *
 * Vide aujourd'hui : le dos du niveau 50 a reçu le sien, et « Attrapez-les
 * tous » est au catalogue avec son voile plutôt que passé sous silence.
 * Le test du catalogue vérifie que tout dos récompensé est soit affichable,
 * soit listé ici, pour qu'un palier ne crédite jamais un cosmétique
 * fantôme par accident.
 */
export const PENDING_CARD_BACK_IDS: readonly string[] = [];

/** Identifiants déblocables — ceux qui doivent apparaître dans `player_cosmetics`. */
export const UNLOCKABLE_CARD_BACK_IDS: readonly string[] = CARD_BACKS.filter((back) => !isFree(back)).map((back) => back.id);

export type { CosmeticUnlock };
