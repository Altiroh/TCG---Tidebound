import { repeat, type DeckList } from "@/game/cards/decks/types";

/**
 * LES TROIS STARTERS — débloqués d'un coup par la PREMIÈRE MISSION
 * (tutoriel terminé OU passé), décision du propriétaire du 15/10/2026.
 *
 * Ils remplacent le choix gratuit d'un préconstruit : un nouveau joueur ne
 * choisit plus un deck à l'aveugle parmi dix-huit, il en reçoit trois,
 * chacun d'une famille de jeu nette — défendre, bloquer, attaquer.
 *
 * Ils ne s'achètent PAS au Jeton (`offer: "starter"` dans `catalog.ts`) :
 * seule la mission les donne, côté serveur (`grant_starter_decks`).
 *
 * Les IDENTIFIANTS sont FIGÉS : ils sont semés en base et notés dans
 * `player_deck_unlocks` dès le premier octroi. Les listes, elles, peuvent
 * changer.
 *
 * Listes MESURÉES au labo le 15/10/2026 (`scripts/preconLab`, bots moyen
 * ET difficile) contre le rayon conservé et entre elles : voir l'en-tête de
 * `scripts/preconLab/libraries/starters.ts`, qui les réexporte.
 */

export const STARTER_LE_REMPART_VIVANT_ID = "le-rempart-vivant";
export const STARTER_LES_SABOTEURS_DU_PONT_ID = "les-saboteurs-du-pont";
export const STARTER_L_ASSAUT_DES_MAREES_ID = "l-assaut-des-marees";

/** Les identifiants des starters, dans l'ordre d'affichage. */
export const STARTER_DECK_IDS: readonly string[] = [
  STARTER_LE_REMPART_VIVANT_ID,
  STARTER_LES_SABOTEURS_DU_PONT_ID,
  STARTER_L_ASSAUT_DES_MAREES_ID,
];

/**
 * MESURES DU LABO (Notion « Préconstruits — Quality Gate », décision du
 * 15/10/2026) — commandes :
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/starters.ts \
 *     --field scripts/preconLab/libraries/starters-champ.ts --games 60
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/starters.ts --games 60
 *   (et les deux avec --bot difficile --games 24)
 *
 * Catalogue actif uniquement (`CORE_SET`), aucune Abyssale, aucune Lande,
 * `maxCopies` respectés, `validateDeckList` passe. Guetteur Méfiant n'est que
 * dans L'Assaut des Marées.
 *
 * Le gabarit « 12–16 unités » est dépassé (17 · 21 · 22) : au labo, chaque
 * unité retirée au profit d'un Objet coûte 5 à 10 points, et tout le rayon
 * joue 21 à 29 unités.
 *
 * MESURE DU 15/10/2026 (bot moyen 60 parties/paire · bot difficile 24) :
 *   contre le rayon conservé — Rempart 61,3 · 39,2 ; Saboteurs 51,8 · 37,2 ;
 *   Assaut 43,6 · 56,4.
 *   entre starters — Rempart/Saboteurs 72 · 46 ; Rempart/Assaut 73 · 33 ;
 *   Saboteurs/Assaut 58 · 33.
 * Les deux bots divergent de 20 à 40 points : le moyen favorise la défense,
 * le difficile l’attaque.
 */

/**
 * 1 — Le Rempart Vivant (La Religieuse). Défense ACTIVE : des corps qui
 * grandissent quand ils encaissent (Matelot Fêlé, Duelliste de Verre,
 * Mouette, Mufle au Fanion, Carcasse Renversée), des ripostes qui
 * renvoient les dégâts (Contre-Harpon, Harpon à Ressort, Cylindre flottant,
 * Le Dernier Rempart), et du soin pour durer. Une seule Mouette : la Garde
 * n'est pas le plan, la riposte l'est.
 */
export const DECK_LE_REMPART_VIVANT: DeckList = {
  id: STARTER_LE_REMPART_VIVANT_ID,
  name: "Le Rempart Vivant",
  shipId: "la-religieuse",
  description:
    "Défense active : chaque coup encaissé rend vos marins plus forts, chaque attaque adverse se paie d'une riposte, et la coque se répare jusqu'à ce que la contre-attaque emporte la partie.",
  cardIds: [
    // Unités (17)
    ...repeat("matelot-fele", 3),
    ...repeat("duelliste-de-verre", 2),
    ...repeat("mouette-du-brise-lames", 1),
    ...repeat("vigie-aux-fissures", 2),
    ...repeat("canonnier-fele", 1),
    ...repeat("pelican-des-cales", 1),
    ...repeat("mufle-au-fanion", 2),
    ...repeat("vieux-harponneur", 1),
    ...repeat("chirurgien-du-bord", 1),
    ...repeat("le-dernier-rempart", 2),
    ...repeat("la-bete-quon-nattend-plus", 1),
    // Structures et Équipements (6)
    ...repeat("cylindre-flottant", 2),
    ...repeat("carcasse-renversee", 2),
    ...repeat("bouclier-fendu", 2),
    // Objets (17)
    ...repeat("bandages-humides", 2),
    ...repeat("encore-debout", 2),
    ...repeat("faire-linventaire", 2),
    ...repeat("mauvaise-main", 1),
    ...repeat("pas-un-pas-de-plus", 2),
    ...repeat("contre-harpon", 2),
    ...repeat("harpon-a-ressort", 2),
    ...repeat("trousse-du-bord", 1),
    ...repeat("bouclier-decume", 1),
    ...repeat("on-flotte-encore", 2),
  ],
};

/**
 * 2 — Les Saboteurs du Pont (Le Brise-Lames, six emplacements pour les
 * Structures). Pièges qui affaiblissent les attaquants (Filet à la Dérive,
 * Chaîne de Travers, Pont Miné, Cale Inondable), emplacements adverses
 * condamnés (Le Barrage des Égarés, Y'a plus de place !), réactions
 * (Harpon à Ressort), et des corps solides pour conclure (Chose des
 * Hauts-Fonds, Le Brise-Ligne, L'Amiral sans Pavillon). Les ouvriers
 * (Bernard-l'Ermite, Charpentier, Charpentière, Treuil Rouillé) tirent
 * profit des Structures qui tombent.
 */
export const DECK_LES_SABOTEURS_DU_PONT: DeckList = {
  id: STARTER_LES_SABOTEURS_DU_PONT_ID,
  name: "Les Saboteurs du Pont",
  shipId: "le-brise-lames",
  description:
    "Blocage : piéger le pont, condamner les emplacements adverses et faire payer chaque attaque, puis laisser les gros bras de l'équipage finir le travail.",
  cardIds: [
    // Unités (21)
    ...repeat("bernard-lermite-dacier", 3),
    ...repeat("contremaitre-des-amarres", 2),
    ...repeat("charpentiere-de-veille", 1),
    ...repeat("charpentier-des-epaves", 2),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("crabe-de-fer", 2),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("vieux-harponneur", 1),
    ...repeat("mange-fer", 1),
    ...repeat("le-brise-ligne", 2),
    ...repeat("lamiral-sans-pavillon", 1),
    // Structures et Équipements (10)
    ...repeat("filet-a-la-derive", 3),
    ...repeat("le-barrage-des-egares", 2),
    ...repeat("pont-mine", 1),
    ...repeat("cale-inondable", 1),
    ...repeat("chaine-de-travers", 1),
    ...repeat("treuil-rouille", 2),
    // Objets et Anomalies (9)
    ...repeat("harpon-a-ressort", 2),
    ...repeat("coup-de-harpon", 2),
    ...repeat("le-pont-est-plein", 2),
    ...repeat("ya-plus-de-place", 1),
    ...repeat("faire-linventaire", 1),
    ...repeat("clous-de-recuperation", 1),
  ],
};

/**
 * 3 — L'Assaut des Marées (Le Courlis : Raison 12, Virage court). Corps
 * rapides (Sterne, Goéland, Albatros en Pied marin ; Chargeur des Écueils),
 * renforts qui se déclenchent à l'attaque (Monture de Brèche, Destrier du
 * Ressac, Harponneur et Albatros en Tempête, Lampe de Pont Rouge), pioche
 * en attaquant (Goéland Chapardeur, Longue-Vue Rayée) et interaction
 * (Guetteur Méfiant, Éclat de Bouteille, Coup de Harpon, Débusquer).
 */
export const DECK_L_ASSAUT_DES_MAREES: DeckList = {
  id: STARTER_L_ASSAUT_DES_MAREES_ID,
  name: "L'Assaut des Marées",
  shipId: "le-courlis",
  description:
    "Attaque : déferler dès les premiers tours, renforcer chaque vague à l'attaque, piocher en frappant et dégager les bloqueurs avant que l'adversaire ne s'installe.",
  cardIds: [
    // Unités (22)
    ...repeat("sterne-des-embruns", 2),
    ...repeat("marin-des-jetees", 2),
    ...repeat("goeland-chapardeur", 3),
    ...repeat("guetteur-mefiant", 2),
    ...repeat("monture-de-breche", 2),
    ...repeat("harponneur-du-dernier-quai", 2),
    ...repeat("destrier-du-ressac", 2),
    ...repeat("pelican-des-cales", 1),
    ...repeat("albatros-de-mauvais-temps", 2),
    ...repeat("chargeur-des-ecueils", 2),
    ...repeat("le-deserteur-gris", 2),
    // Équipements (8)
    ...repeat("longue-vue-rayee", 2),
    ...repeat("selle-de-guerre", 2),
    ...repeat("harpon-de-pont", 2),
    ...repeat("lampe-de-pont-rouge", 2),
    // Objets (10)
    ...repeat("eclat-de-bouteille", 2),
    ...repeat("trinquer-trop-fort", 1),
    ...repeat("coup-de-harpon", 2),
    ...repeat("debusquer", 2),
    ...repeat("faire-linventaire", 2),
    ...repeat("lettre-jamais-ouverte", 1),
  ],
};

/** Les trois starters, dans l'ordre d'affichage (ajoutés EN FIN de `PRECON_DECK_LISTS`). */
export const STARTER_DECK_LISTS: readonly DeckList[] = [
  DECK_LE_REMPART_VIVANT,
  DECK_LES_SABOTEURS_DU_PONT,
  DECK_L_ASSAUT_DES_MAREES,
];

export function isStarterDeckId(deckId: string): boolean {
  return STARTER_DECK_IDS.includes(deckId);
}
