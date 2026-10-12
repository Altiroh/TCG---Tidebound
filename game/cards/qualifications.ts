import type { CardDefinition, CardInstance, CardType } from "@/game/cards/types";

/**
 * QUALIFICATIONS DES PERMANENTS (12/10/2026) — des capacités reconnues
 * NATIVEMENT par le moteur, qu'une carte reçoit en les listant dans sa
 * définition (`CardDefinition.qualifications`), sans qu'aucune logique ne
 * soit écrite pour elle :
 *
 *   qualifications: [{ id: "rafale" }, { id: "eclaboussure", value: 1 }]
 *
 * Elles s'ajoutent aux mots-clés existants (Garde, Pied marin) et aux effets
 * déjà écrits sur les cartes, sans les remplacer : une carte peut porter un
 * texte ET des qualifications. Aucune carte existante n'en reçoit ici — leur
 * attribution est une décision de design, carte par carte.
 *
 * Le REGISTRE (`QUALIFICATIONS`) porte tout ce que l'interface et le moteur
 * en savent : nom affiché, description (avec sa valeur X), types de cartes
 * compatibles, glyphe, conditions d'activation, et l'état de ses règles
 * (`rules`) — `"validated"` quand le texte suffit à trancher, `"provisional"`
 * quand une règle de détail attend la validation du propriétaire : elle est
 * alors appliquée telle que PROPOSÉE (`pending`) et signalée comme telle,
 * jamais figée en silence. `"notImplemented"` : le moteur ne l'applique pas
 * encore. Le 12/10/2026, le propriétaire a VALIDÉ toutes les règles
 * proposées : chaque qualification porte ses décisions dans `rulings`.
 *
 * Rejetées, à ne pas ajouter (décision du 12/10/2026) : À l'abordage !,
 * Furie, Dernière charge. Les autres pistes de la phase de réflexion restent
 * en attente de validation.
 *
 * Moteur : `game/rules/qualificationCombat.ts` (attaques autorisées, cibles,
 * effets du coup), lu par `game/actions/attack.ts` et
 * `game/rules/validation.ts`.
 */

export type QualificationId =
  | "rafale"
  | "deluge"
  | "breche"
  | "sangsue"
  | "contournement"
  | "coup-de-grace"
  | "eclaboussure"
  | "entaille"
  | "carnage"
  | "salve"
  | "ponction";

/** Une qualification portée par une carte : son identifiant, et sa valeur X si elle en a une. */
export interface CardQualification {
  id: QualificationId;
  /** Valeur X (Éclaboussure X, Entaille X, Ponction X). Ignorée pour les qualifications sans valeur. */
  value?: number;
}

export interface QualificationRule {
  id: QualificationId;
  /** Nom affiché, en français. */
  name: string;
  /** La qualification porte-t-elle une valeur X ? */
  hasValue: boolean;
  /** Description lisible, valeur comprise (« inflige 2 dégâts… »). */
  describe: (value?: number) => string;
  /** Quand elle agit, en une phrase (affichée à l'inspection). */
  activation: string;
  /** Types de cartes qui peuvent la porter. */
  compatibleTypes: readonly CardType[];
  /**
   * Glyphe : clé de l'asset (`public/assets/qualifications/<glyph>.webp`),
   * transparent, fourni plus tard. Tant qu'il manque, l'interface pose un
   * repère discret (`qualificationGlyphUrl`, `QualificationBadge`).
   */
  glyph: string;
  /** État de ses règles (voir l'en-tête). */
  rules: "validated" | "provisional" | "notImplemented";
  /** Points de règle en attente de validation, et ce qui est appliqué en attendant. */
  pending?: readonly string[];
  /** Points de règle TRANCHÉS (décisions du propriétaire), tels que le moteur les applique. */
  rulings?: readonly string[];
}

const UNITES: readonly CardType[] = ["creature", "marin"];
const x = (value: number | undefined) => Math.max(0, value ?? 1);

export const QUALIFICATIONS: Record<QualificationId, QualificationRule> = {
  rafale: {
    id: "rafale",
    name: "Rafale",
    hasValue: false,
    describe: () => "Ce permanent peut attaquer deux fois pendant une même phase de combat.",
    activation: "Pendant votre phase de combat : deux attaques au lieu d'une.",
    compatibleTypes: UNITES,
    glyph: "rafale",
    rules: "validated",
    rulings: [
      "Deux attaques peuvent viser la même cible.",
      "Cumul avec Déluge : le plus grand des deux nombres d'attaques, et non leur somme.",
    ],
  },
  deluge: {
    id: "deluge",
    name: "Déluge",
    hasValue: false,
    describe: () =>
      "Ce permanent peut attaquer jusqu'à autant de fois qu'il y a de permanents adverses de type Créature ou Marin. Ces attaques ne peuvent jamais cibler directement le Navire adverse.",
    activation: "Pendant votre phase de combat, contre des Créatures et des Marins adverses.",
    compatibleTypes: UNITES,
    glyph: "deluge",
    rules: "validated",
    rulings: [
      "Le nombre d'attaques se recompte à CHAQUE attaque, d'après le plateau du moment : une unité détruite fait baisser le plafond.",
      "Sans Créature ni Marin adverse, il ne peut pas attaquer du tout — et jamais le Navire, même sans Garde.",
      "Plusieurs attaques sur la même cible.",
      "Elle compte les Créatures et Marins adverses, mais ses attaques peuvent aussi viser les autres permanents attaquables (Structures).",
    ],
  },
  breche: {
    id: "breche",
    name: "Brèche",
    hasValue: false,
    describe: () => "Lorsque ce permanent détruit une cible par une attaque, les dégâts excédentaires sont infligés au Navire adverse.",
    activation: "Quand son coup suffit à détruire sa cible.",
    compatibleTypes: UNITES,
    glyph: "breche",
    rules: "validated",
    rulings: [
      "« Détruit » se lit au coup : les dégâts marqués atteignent la Résistance, même si un effet sauve ensuite la cible.",
      "L'excédent passe par l'Armure du Navire, pas par les boucliers d'attaque directe (Garde, Cage de Flottaison…) : ce n'est pas une attaque directe.",
      "Avec Sangsue : l'excédent compte dans les dégâts réellement infligés. Avec Ponction : il déclenche la perte de Raison.",
    ],
  },
  sangsue: {
    id: "sangsue",
    name: "Sangsue",
    hasValue: false,
    describe: () => "Lorsque ce permanent inflige des dégâts, votre Navire récupère autant d'Ancrage que les dégâts réellement infligés.",
    activation: "Chaque fois qu'il inflige des dégâts de combat (coup, riposte, excédent de Brèche, Éclaboussure).",
    compatibleTypes: UNITES,
    glyph: "sangsue",
    rules: "validated",
    rulings: [
      "Le cahier dit « Coque » : le moteur appelle Ancrage les points de vie du Navire. Sans plafond depuis le 12/10/2026 : l'Ancrage peut dépasser l'Ancrage de départ.",
      "Les dégâts de riposte comptent : « inflige des dégâts » ne distingue pas l'attaque de la riposte.",
      "Seuls les dégâts de combat comptent, pas ceux de ses capacités écrites.",
    ],
  },
  contournement: {
    id: "contournement",
    name: "Contournement",
    hasValue: false,
    describe: () => "Ce permanent peut attaquer directement le Navire adverse même si l'adversaire contrôle un permanent disposant de Garde.",
    activation: "Quand il attaque le Navire adverse.",
    compatibleTypes: UNITES,
    glyph: "contournement",
    rules: "validated",
  },
  "coup-de-grace": {
    id: "coup-de-grace",
    name: "Coup de grâce",
    hasValue: false,
    describe: () => "Détruit tout permanent auquel il inflige au moins 1 dégât lors d'une attaque.",
    activation: "Quand son attaque inflige au moins 1 dégât à un permanent.",
    compatibleTypes: UNITES,
    glyph: "coup-de-grace",
    rules: "validated",
    rulings: [
      "La cible de l'attaque seulement, pas les permanents touchés par son Éclaboussure, ni sa riposte.",
      "Un coup ramené à 0 par une réduction ne détruit pas.",
      "« Détruit » passe par la destruction ordinaire : un effet qui empêche la destruction s'applique.",
    ],
  },
  eclaboussure: {
    id: "eclaboussure",
    name: "Éclaboussure",
    hasValue: true,
    describe: (value) => `Lorsque ce permanent attaque un autre permanent, inflige également ${x(value)} dégât${x(value) > 1 ? "s" : ""} aux permanents directement adjacents à sa cible.`,
    activation: "Quand il attaque un permanent : ses voisins d'emplacement, à gauche et à droite.",
    compatibleTypes: UNITES,
    glyph: "eclaboussure",
    rules: "validated",
    rulings: [
      "Adjacents = les emplacements voisins de la cible sur SON rang ; une cible au bord n'a qu'un voisin.",
      "Ce sont des dégâts de combat, sans riposte des voisins ; ils ne déclenchent ni Brèche ni Coup de grâce, mais Sangsue et Entaille oui.",
    ],
  },
  entaille: {
    id: "entaille",
    name: "Entaille",
    hasValue: true,
    describe: (value) => `Lorsqu'il inflige des dégâts à un permanent, celui-ci perd ${x(value)} Attaque.`,
    activation: "Chaque fois qu'il inflige des dégâts de combat à un permanent.",
    compatibleTypes: UNITES,
    glyph: "entaille",
    rules: "validated",
    rulings: [
      "La perte est PERMANENTE (« perd » sans durée).",
      "La Puissance ne descend jamais sous 0 (règle générale des statistiques).",
      "La riposte compte, comme pour Sangsue.",
    ],
  },
  carnage: {
    id: "carnage",
    name: "Carnage",
    hasValue: false,
    describe: () => "Lorsque ce permanent détruit une cible en attaquant, il peut effectuer une attaque supplémentaire.",
    activation: "Quand son coup suffit à détruire sa cible.",
    compatibleTypes: UNITES,
    glyph: "carnage",
    rules: "validated",
    rulings: [
      "Chaque destruction accorde une attaque de plus, sans limite dans le tour.",
      "« Détruit » se lit au coup, comme pour Brèche.",
      "Cumul avec Rafale ou Déluge : l'attaque supplémentaire s'AJOUTE à leur nombre.",
    ],
  },
  salve: {
    id: "salve",
    name: "Salve",
    hasValue: false,
    describe: () => "Ce permanent peut répartir ses dégâts d'attaque entre plusieurs cibles autorisées.",
    activation: "Quand il attaque une unité : le joueur répartit sa Puissance entre la cible et d'autres unités adverses.",
    compatibleTypes: UNITES,
    glyph: "salve",
    rules: "validated",
    rulings: [
      "Le joueur répartit la Puissance entre plusieurs cibles légales, au moins 1 par cible ; la cible déclarée garde le reste (au moins 1).",
      "Les cibles sont des unités adverses (permanents dotés de Résistance), jamais le Navire.",
      "La Garde s'applique à chaque cible : chacune doit être attaquable pour elle-même.",
      "Chaque cible touchée riposte.",
      "Chaque part est un coup : les autres qualifications du porteur (Brèche, Entaille, Coup de grâce…) s'y appliquent.",
    ],
  },
  ponction: {
    id: "ponction",
    name: "Ponction",
    hasValue: true,
    describe: (value) => `Lorsque ce permanent inflige des dégâts au Navire adverse, celui-ci perd également ${x(value)} Raison.`,
    activation: "Quand il touche le Navire adverse (attaque directe, ou excédent de Brèche).",
    compatibleTypes: UNITES,
    glyph: "ponction",
    rules: "validated",
    rulings: [
      "Si l'adversaire n'a pas assez de Raison, il perd quand même tout, et entre en Déraison.",
      "Le bouclier de perte de Raison du défenseur s'applique.",
    ],
  },
};

/** Ordre d'affichage des qualifications d'une carte. */
export const QUALIFICATION_ORDER: readonly QualificationId[] = [
  "rafale",
  "deluge",
  "carnage",
  "salve",
  "contournement",
  "breche",
  "coup-de-grace",
  "eclaboussure",
  "entaille",
  "sangsue",
  "ponction",
];

export function isQualificationId(value: string): value is QualificationId {
  return value in QUALIFICATIONS;
}

/**
 * Qualifications EFFECTIVES d'une carte en jeu : celles de sa définition,
 * plus celles qu'un modificateur lui accorde (`StatModifier.qualifications`).
 * Une même qualification n'apparaît qu'une fois ; à valeurs différentes, la
 * plus haute l'emporte (deux Éclaboussure 1 ne font pas Éclaboussure 2).
 */
export function effectiveQualifications(unit: Pick<CardInstance, "cardId" | "modifiers">, def: Pick<CardDefinition, "qualifications">): CardQualification[] {
  const all = [...(def.qualifications ?? []), ...unit.modifiers.flatMap((m) => m.qualifications ?? [])];
  const best = new Map<QualificationId, CardQualification>();
  for (const q of all) {
    const known = best.get(q.id);
    if (!known || (q.value ?? 0) > (known.value ?? 0)) best.set(q.id, q);
  }
  return QUALIFICATION_ORDER.flatMap((id) => (best.has(id) ? [best.get(id)!] : []));
}

/** Valeur X d'une qualification portée (1 par défaut), ou `undefined` si la carte ne la porte pas. */
export function qualificationValue(qualifications: readonly CardQualification[], id: QualificationId): number | undefined {
  const q = qualifications.find((item) => item.id === id);
  if (!q) return undefined;
  return QUALIFICATIONS[id].hasValue ? x(q.value) : 1;
}

/** Libellé court affiché sur la carte (« Éclaboussure 2 »). */
export function qualificationLabel(q: CardQualification): string {
  const rule = QUALIFICATIONS[q.id];
  return rule.hasValue ? `${rule.name} ${x(q.value)}` : rule.name;
}

/** Asset du glyphe (fourni plus tard, PNG ou SVG transparent converti en WebP — règle des assets). */
export function qualificationGlyphUrl(id: QualificationId): string {
  return `/assets/qualifications/${QUALIFICATIONS[id].glyph}.webp`;
}
