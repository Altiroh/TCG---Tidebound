/**
 * ILLUSTRATIONS DE CARTE — Collection visuelle V2 (Notion « Boosters &
 * économie de collection », validation du 16/10/2026 ; mise en œuvre du
 * 18/10/2026).
 *
 * Trois dimensions distinctes, que rien ne mélange :
 *  - la CARTE (gameplay, rareté) — jamais touchée par ce module ;
 *  - l'ILLUSTRATION — Classique (toute carte), Styled, Styled Full-Art
 *    (certaines cartes seulement, listées ici) ;
 *  - la FINITION (`finishes.ts`) — un filtre posé sur n'importe laquelle de
 *    ces illustrations.
 *
 * Une Styled et une Styled Full-Art sont des ÉDITIONS à part entière de la
 * carte : elles se collectionnent, portent les finitions, et leurs raretés
 * se cumulent (une Styled Full-Art Star Foil est ultra ultra rare). Le moteur
 * ne lit jamais ce module : c'est une donnée de COLLECTION et d'affichage.
 *
 * Styled Full-Art : nom, coût, type et texte sont PEINTS dans l'image ; seuls
 * Puissance, Résistance et les états de partie sont posés par le code. Le
 * texte peint est donc recopié ici (`textePeint`) : si le texte de la carte
 * change, `tests/game/cardArtworks.test.ts` échoue tant que l'illustration
 * n'est pas repeinte — une Full-Art ne peut pas mentir sur la carte.
 *
 * Fichiers : `public/assets/cards/illustrations/<illustration>/<cardId>.webp`
 * (vignettes dans `illustrations/mini/<illustration>/`), fabriqués par
 * `scripts/optimizeImages.mjs`.
 */
export type CardArtwork = "classique" | "styled" | "styled-fa";

/** Les illustrations ALTERNATIVES, de la moins à la plus rare. */
export type RareCardArtwork = Exclude<CardArtwork, "classique">;

export const CARD_ARTWORKS: readonly CardArtwork[] = ["classique", "styled", "styled-fa"];
export const RARE_CARD_ARTWORKS: readonly RareCardArtwork[] = ["styled", "styled-fa"];

export const CARD_ARTWORK_LABELS: Record<CardArtwork, string> = {
  classique: "Classique",
  styled: "Styled",
  "styled-fa": "Styled Full-Art",
};

export const CARD_ARTWORK_DESCRIPTIONS: Record<CardArtwork, string> = {
  classique: "Illustration originale",
  styled: "Illustration retravaillée, dans le cadre de la carte",
  "styled-fa": "Illustration pleine carte, texte peint dedans",
};

/** Une Full-Art porte elle-même nom, coût, type et texte : le cadre ne les réécrit pas. */
export function isFullArt(artwork: CardArtwork | undefined): boolean {
  return artwork === "styled-fa";
}

interface CardAlternateArt {
  styled?: true;
  /**
   * Illustrations livrées mais PAS ENCORE DISTRIBUÉES, avec leur motif (un
   * arbitrage d'économie en attente, par exemple) : fichiers en place, mais
   * ni Styled ni Full-Art n'existent pour la collection et les boosters tant
   * que le drapeau reste posé.
   */
  enAttente?: string;
  /**
   * `textePeint` : le texte d'effet tel qu'il est PEINT sur la Full-Art
   * (relu sur l'image le 18/10/2026). `aRepeindre` : le texte peint ne dit
   * pas ce que dit la carte — la Full-Art reste hors collection et hors
   * booster tant qu'elle n'est pas repeinte. `ecartMineur` : une différence
   * de ponctuation qui ne change pas le sens, assumée avec son motif (comme
   * les `EXCEPTIONS` de la conformité des cartes).
   */
  fullArt?: { textePeint: string; aRepeindre?: string; ecartMineur?: string };
}

/** Cartes qui ont une illustration alternative. Ordre alphabétique des ids. */
const ALTERNATE_ARTS: Record<string, CardAlternateArt> = {
  "aberration-vorace": { styled: true, fullArt: { textePeint: "À son arrivée — Sabordez une Créature alliée : gagne +2/+2 permanent." } },
  "bretteuse-au-bord": {
    styled: true,
    fullArt: { textePeint: "Après qu'elle attaque, elle subit 1 dégât. La première fois à chaque tour qu'elle survit à des dégâts, elle gagne +1 Puissance." },
  },
  "chirurgien-du-bord": { styled: true, fullArt: { textePeint: "À l'arrivée : restaurez jusqu'à 3 Résistance répartie entre vos unités." } },
  "cylindre-flottant": {
    styled: true,
    enAttente:
      "Sa seule source est le Standard, dont la revente moyenne passerait au-dessus de 95 % du prix avec sa Styled (`obtentionCartes.test.ts`) : arbitrage d'économie en attente (19/10/2026).",
    // Repeinte le 20/10/2026 sur la forme courte validée par le propriétaire.
    fullArt: {
      textePeint:
        "4 tours • Houle/Tempête. À la première attaque directe au navire, vous pouvez annuler ses dégâts et les infliger au navire adverse. Détruisez ensuite ce Cylindre.",
      ecartMineur:
        "Forme courte validée par le propriétaire le 20/10/2026 pour cette Full-Art : même effet que le texte complet (« 4 tours » = 4 tours de table, première attaque directe, dégâts au Navire adverse, puis destruction).",
    },
  },
  "eclaireur-ebreche": {
    styled: true,
    fullArt: { textePeint: "Au début de votre Main Phase, il subit 1 dégât. La première fois à chaque tour qu'il survit à des dégâts, il gagne +2 Puissance." },
  },
  "eidolon-opalin-lv1": {
    styled: true,
    fullArt: {
      textePeint:
        "À la fin de votre tour, si Éidolon Opalin LV1 est toujours en jeu, placez 1 marqueur Niveau sur lui. À 2 marqueurs Niveau, remplacez-le par Éidolon Opalin LV5 depuis votre main ou votre pioche.",
      ecartMineur: "« Éidolon » peint avec un accent : le nom reste reconnaissable, le sens est le même.",
    },
  },
  "eidolon-opalin-lvx": {
    styled: true,
    // Repeinte le 20/10/2026 : « 3 dégâts à une Structure », « récupérez », « ajoutez » rétablis.
    fullArt: {
      textePeint:
        "Ne peut entrer en jeu que par l'effet d'Éidolon Opalin LV5. À l'arrivée, choisissez 2 effets différents : infligez 4 dégâts à une unité ; détruisez un Équipement ; infligez 3 dégâts à une Structure ; récupérez 2 Raison ; gagnez 3 Armure ; ajoutez une carte de votre Cimetière à votre main. Une fois par tour, lorsqu'un autre Opalin que vous contrôlez déclenche un effet, gagnez 1 Armure.",
      ecartMineur: "« Éidolon » peint avec un accent : le nom reste reconnaissable, le sens est le même.",
    },
  },
  "elyor-opalin-du-retour": {
    styled: true,
    fullArt: {
      textePeint:
        "À l'arrivée : renvoyez une unité de coût 2 ou moins dans la main de son propriétaire. Une fois par tour, lorsqu'une carte adverse revient en main, gagnez 1 Armure.",
    },
  },
  "gaston-aventurier-de-ladalle": {
    styled: true,
    fullArt: { textePeint: "À l'arrivée : gagne +?/+0 tant qu'il reste en jeu. Réussite critique : gagne Pied marin ce tour. Échec critique : subit 1 dégât." },
  },
  "il-capitano-naufrage": { styled: true, fullArt: { textePeint: "La première fois qu'il subit des dégâts, il perd définitivement 3 Puissance et 2 Résistance." } },
  "jugement-du-phare": {
    styled: true,
    fullArt: {
      textePeint:
        "Durée : 3 tours de table. Visible pendant Tempête et Abysses. Une fois par tour, si une unité adverse arrive alors que l'adversaire en contrôle au moins 4 : elle subit 2 dégâts.",
    },
  },
  "la-revenante": {
    styled: true,
    // Peint en capitales, « -1 » au tiret simple : la comparaison les tolère.
    fullArt: { textePeint: "ÉVEIL : RÉCUPÉREZ EN MAIN UN ALTÉRÉ DE COÛT ≤3 DU CIMETIÈRE. S'IL COÛTE ≤2, VOUS POUVEZ LE JOUER POUR -1 CE TOUR." },
  },
  "la-taverne-avant-le-donjon": { styled: true, fullArt: { textePeint: "Première unité alliée renvoyée en main pendant votre tour : récupérez 1 Ancrage." } },
  "lampe-de-pont-rouge": { styled: true, fullArt: { textePeint: "Équipez un Marin. Tant que vous êtes en Houle ou Tempête, il gagne +1 Puissance." } },
  "le-brise-ligne": {
    styled: true,
    // Repeinte le 18/10/2026 : « au moins » rétabli.
    fullArt: {
      textePeint: "À l'arrivée : si l'adversaire contrôle au moins 4 unités, infligez 1 dégât, à toutes ses unités.",
      ecartMineur: "Une virgule après « 1 dégât » : le sens est le même.",
    },
  },
  "le-gardien-des-jouets": {
    styled: true,
    fullArt: {
      textePeint: "Garde — Chaque autre Mort-vivant allié détruit ou Sabordé lui donne +1/+1.",
      ecartMineur: "« Garde — » au lieu de « Garde. » : le mot-clé reste en tête, le sens est le même.",
    },
  },
  "le-geant-qui-croyait-etre-discret": {
    styled: true,
    // Repeinte le 18/10/2026 : « infligez » rétabli.
    fullArt: {
      textePeint:
        "À l'arrivée : sur 4+, gagne Pied marin ce tour. Réussite critique : lorsqu'il attaque ce tour, infligez aussi 2 dégâts au Navire adverse.",
    },
  },
  "le-nain-qui-connait-un-raccourci": {
    styled: true,
    fullArt: { textePeint: "À l'arrivée : sur 3-4, votre prochaine carte coûte 1 de moins ce tour. Réussite critique : elle coûte 2 de moins à la place." },
  },
  "le-naufrage-impossible": { styled: true, fullArt: { textePeint: "La première fois qu'il devrait être détruit, il reste en jeu avec 1 Résistance." } },
  lentendant: {
    styled: true,
    fullArt: { textePeint: "Éveil — piochez 1. Si c'est son deuxième Éveil ce tour, piochez-en 2 à la place." },
  },
  "merai-opalin-des-profondeurs": {
    styled: true,
    // Repeinte le 20/10/2026 : « du dessous » rétabli.
    fullArt: {
      textePeint:
        "À l'arrivée : regardez les 4 cartes du dessous de votre pioche. Ajoutez-en une à votre main puis mélangez les autres dans votre pioche. Une fois par tour, lorsqu'une carte est placée sous votre pioche, récupérez 1 Raison.",
    },
  },
  "moucheron-sanguin": { styled: true, fullArt: { textePeint: "Sangsue", ecartMineur: "Sans le point final : le mot-clé seul, le sens est le même." } },
  // Full-Art livrée le 18/10/2026, Styled le même soir.
  "mousse-des-quarts": {
    styled: true,
    // Repeinte le 18/10/2026 : « À » accentué.
    fullArt: { textePeint: "À son arrivée, piochez 1 carte puis défaussez 1 carte." },
  },
  "on-avait-dit-tous-ensemble": {
    styled: true,
    // Repeinte le 20/10/2026 : « qu'une carte Mort-vivant » rétabli.
    fullArt: {
      textePeint:
        "Une fois par tour, lorsqu'un autre Mort-vivant allié est détruit ou qu'une carte Mort-vivant rejoint votre Cimetière depuis votre main ou votre pioche : infligez 1 dégât au Navire adverse.",
    },
  },
  "ptite-fesse-grand-reve": {
    styled: true,
    fullArt: {
      textePeint:
        "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez gagne de la Puissance, P'tite Fesse, Grand Rêve gagne +1 Puissance.",
    },
  },
  "reine-des-charognes": {
    styled: true,
    fullArt: { textePeint: "Quand une autre unité alliée meurt, mettez +1 / +1 sur une autre unité." },
  },
  "relance-j-te-jure": { styled: true, fullArt: { textePeint: "Chaîne — Relancez le dé en cours et gardez le nouveau résultat." } },
  "rita-sorciere-sous-contrat": {
    styled: true,
    fullArt: { textePeint: "À l'arrivée : une unité adverse perd -1/-1. Sur 5+ : -2/-2 à la place. Réussite critique : -3/-3 à la place." },
  },
  "seren-opalin-du-silence": {
    styled: true,
    fullArt: {
      textePeint:
        "À l'arrivée : choisissez une Structure adverse. Son texte est ignoré jusqu'au début de votre prochain tour. Le premier Objet adverse joué chaque tour coûte 1 Raison supplémentaire. Si l'adversaire ne peut pas payer, il ne peut pas le jouer.",
    },
  },
  "signal-de-detresse": {
    styled: true,
    fullArt: { textePeint: "Chaîne — Lorsque votre Navire devrait subir des dégâts directs pendant le tour adverse : réduisez-les de 3." },
  },
  "vigie-aux-fissures": {
    styled: true,
    // Repeinte le 20/10/2026 : « survit à des dégâts » rétabli.
    fullArt: {
      textePeint: "La première fois à chaque tour qu'une autre unité que vous contrôlez survit à des dégâts, piochez 1 carte puis défaussez-en 1.",
      aRepeindre: "Défausse retirée le 27/10/2026 : le texte peint dit encore « puis défaussez-en 1 ».",
    },
  },
};

/** Les illustrations d'une carte, Classique en tête (toujours présente). */
export function artworksOf(cardId: string): CardArtwork[] {
  const alt = ALTERNATE_ARTS[cardId];
  const result: CardArtwork[] = ["classique"];
  if (alt?.enAttente) return result;
  if (alt?.styled) result.push("styled");
  if (alt?.fullArt && !alt.fullArt.aRepeindre) result.push("styled-fa");
  return result;
}

export function hasArtwork(cardId: string, artwork: CardArtwork): boolean {
  return artworksOf(cardId).includes(artwork);
}

/** Cartes qui ont au moins une illustration alternative. */
export function cardIdsWithAlternateArt(): string[] {
  return Object.keys(ALTERNATE_ARTS);
}

/** La Full-Art livrée d'une carte (même à repeindre), `undefined` si elle n'en a pas. */
export function paintedFullArt(cardId: string): { textePeint: string; aRepeindre?: string; ecartMineur?: string } | undefined {
  return ALTERNATE_ARTS[cardId]?.fullArt;
}

/**
 * Texte peint et texte de la carte disent-ils la même chose ? La casse et les
 * tirets (−, –, -) sont tolérés : une Full-Art peinte en capitales ou au tiret
 * simple reste juste. Un mot ou un accent de différence, non.
 */
export function paintedTextMatches(textePeint: string, texteCarte: string): boolean {
  const norm = (t: string) => t.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
  return norm(textePeint) === norm(texteCarte);
}

/**
 * Illustration à poser sur la TUILE DE PLATEAU, qui écrit elle-même nom et
 * stats par-dessus : une Full-Art, dont le texte est peint, y ferait
 * doublon. Elle cède la place à la Styled de la carte, sinon à la Classique.
 */
export function boardTileArtwork(cardId: string, artwork: CardArtwork | undefined): CardArtwork {
  if (!artwork || artwork === "classique") return "classique";
  if (!isFullArt(artwork)) return hasArtwork(cardId, artwork) ? artwork : "classique";
  return hasArtwork(cardId, "styled") ? "styled" : "classique";
}

/**
 * Illustration choisie pour un AVATAR ou une PLAQUE DE DECK : Classique ou
 * Styled. La Full-Art n'y va pas — son texte peint serait illisible en
 * vignette — mais l'avoir obtenue DÉBLOQUE la Styled de la carte, même
 * sans l'avoir tirée elle-même.
 */
export type ChosenArtwork = "classique" | "styled";

export function isChosenArtwork(value: unknown): value is ChosenArtwork {
  return value === "classique" || value === "styled";
}

/** La Styled de cette carte est-elle débloquée par ces illustrations possédées (Styled ou Full-Art) ? */
export function unlocksStyled(cardId: string, ownedArtworks: Iterable<CardArtwork>): boolean {
  if (!hasArtwork(cardId, "styled")) return false;
  for (const artwork of ownedArtworks) if (artwork === "styled" || artwork === "styled-fa") return true;
  return false;
}

/** L'illustration à MONTRER pour un choix lu en base : Styled seulement si elle est débloquée. */
export function shownChosenArtwork(cardId: string, stored: unknown, styledUnlocked: ReadonlySet<string> | null): ChosenArtwork {
  if (stored !== "styled") return "classique";
  if (styledUnlocked && !styledUnlocked.has(cardId)) return "classique";
  return hasArtwork(cardId, "styled") ? "styled" : "classique";
}

export function isCardArtwork(value: unknown): value is CardArtwork {
  return typeof value === "string" && (CARD_ARTWORKS as readonly string[]).includes(value);
}

/** Motif d'une illustration livrée mais pas encore distribuée (`enAttente`), `undefined` sinon. */
export function alternateArtOnHold(cardId: string): string | undefined {
  return ALTERNATE_ARTS[cardId]?.enAttente;
}
