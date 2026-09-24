"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHROMATIC_COLOR_LABELS,
  chromaticColorsOf,
  collectAuraContributions,
  computeEffectiveStats,
  getCardDefinition,
  hasKeyword,
  hasKeywordInContext,
  STATUS_IMMOBILISE,
  STATUS_MALADE,
  STATUS_SILENCE,
  UNIT_CARD_TYPES,
  type AuraContext,
  type CardDefinition,
  type CardInstance,
  type ChromaticColor,
  type TideStateName,
  isAbyssalVariant,
} from "@/game";
import { CARD_TYPE_LABELS, THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";
import { useCardBackSrcFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import { StatusBadge } from "@/features/match/StatusBadge";
import { useDecreaseFlash } from "@/features/match/useDecreaseFlash";
import { useImageOk } from "@/features/match/useImageOk";

interface CardTileProps {
  instance: CardInstance;
  tideState: TideStateName;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Classe Tailwind de largeur (ex: "w-28", "w-72") — permet un rendu plus grand (vue détail). Défaut : "w-28". */
  widthClassName?: string;
  /** `false` pour désactiver l'agrandissement léger au survol (ex: cartes de plateau — l'utilisateur clique désormais pour voir le détail plutôt que de survoler). Défaut : `true`. */
  scaleOnHover?: boolean;
  /**
   * `false` retire les badges de statut flottants (Inactive, Mal
   * d'invocation, Garde, Durée…). Ces badges décrivent l'état d'une carte
   * EN PARTIE ; hors partie — fiche de Collection — ils sont calculés à
   * partir d'une Marée arbitraire et racontent donc n'importe quoi (une
   * carte marquée « Inactive » parce que l'aperçu suppose Calme). Défaut :
   * `true`, aucun appelant existant ne change de comportement.
   */
  showStatusBadges?: boolean;
  /** Taille en pixels réels des badges de statut flottants (`StatusBadge`) — indépendante de `widthClassName` puisqu'ils vivent hors du conteneur à requête de conteneur. Défaut : 38 (cartes de plateau). La vue détail (`CardDetailModal`, carte bien plus grande) passe une valeur plus élevée pour rester proportionnée. */
  badgeSize?: number;
  /**
   * Plateau du CONTRÔLEUR de cette carte (+ sa Raison, + l'orientation de
   * Marée). Sans lui, la carte n'affiche que sa valeur propre : tous les
   * bonus venus d'une autre carte — Porte-Étendard, Trône de Bouchon,
   * Destrier, Capitaine Sans Sommeil — restent invisibles alors que le
   * combat, lui, les compte. À fournir dès que la carte est EN JEU.
   */
  auraContext?: AuraContext;
  /**
   * Structure actuellement invisible pour l'adversaire (`visibleDuringTide`) SUR SON PROPRE plateau — même
   * son propriétaire ne voit alors que le dos de carte pour l'illustration/le texte/les stats, mais garde les
   * badges de statut flottants (dont "Durée") ET le bouton de détail "i" externe (`BoardCardTile`) pour
   * pouvoir toujours la consulter. Différent de masquer la carte à l'adversaire (`BoardCardTile.hiddenFromViewer`,
   * qui lui retire aussi ces deux affordances puisqu'il ne peut pas du tout l'identifier).
   */
  faceDown?: boolean;
  /** Active le glisser-déposer HTML natif (ex: piocher une carte de la Collection vers l'éditeur de deck). Défaut : `false`. */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
  /**
   * Survol "premium" à la place du glow bleu plein cadre — pensé pour une
   * grille dense (Collection) où ce glow devient vite criard. La carte se
   * soulève de 8px, grandit de 3,5%, s'incline d'un demi-degré et
   * s'éclaircit très légèrement, avec une ombre portée profonde : elle doit
   * se lire comme un objet physique qu'on décolle de la surface, sans
   * aucune lueur colorée autour. Défaut : `false` (comportement historique
   * inchangé partout ailleurs : plateau, éditeur de deck, fiche détail).
   */
  liftOnHover?: boolean;
}

/**
 * Registre des icônes de statuts ponctuels (`instance.statuses`) — assets
 * fournis à plat dans `public/assets/` (`status/malade.webp`, etc.), un
 * statut sans entrée ici reste silencieux plutôt que de casser l'affichage
 * (système volontairement générique : ajouter un statut n'importe où dans
 * le moteur n'exige qu'une entrée ici pour être visible).
 */
const STATUS_ICON_INFO: Record<string, { icon: string; label: string; description: string }> = {
  [STATUS_MALADE]: {
    icon: "/assets/status/malade.webp",
    label: "Malade",
    description: "Perd 1 Résistance à chaque tour tant que ce statut reste actif.",
  },
  [STATUS_IMMOBILISE]: {
    icon: "/assets/status/immobilise.webp",
    label: "Immobilisé",
    description: "Ne peut ni attaquer ni utiliser ses capacités tant que ce statut reste actif.",
  },
  [STATUS_SILENCE]: {
    icon: "/assets/status/silence.webp",
    label: "Silence",
    description: "Ses capacités déclenchées et effets d'arrivée sont désactivés tant que ce statut reste actif.",
  },
};

/** Mot-clé Garde (`def.keywords`, permanent — pas un statut à durée) : même registre d'icône que les statuts. */
const GARDE_ICON_INFO = {
  icon: "/assets/status/garde.webp",
  label: "Garde",
  description: "Les attaques adverses visant votre Navire doivent cibler en priorité les permanents portant Garde.",
};

/** Pastille de chaque couleur chromatique (Lot 15), lisible sur fond sombre. */
const CHROMATIC_SWATCHES: Record<ChromaticColor, string> = {
  rouge: "#e0483e",
  jaune: "#f2c230",
  bleu: "#3f8fe0",
  vert: "#3fbf6a",
  violet: "#9b59d0",
};

/** Mélange une couleur `#rrggbb` avec une autre, `t` = part de la seconde (0 → 1). */
function mixHex(from: string, to: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Fond du médaillon de couleurs, peint dans le verre de `tour.webp` (qui
 * donne déjà reflet et ombrage). Une couleur seule : un bombé doux, à
 * peine éclairci en haut, assombri en bas — pas de point blanc. Plusieurs :
 * un dégradé qui passe de l'une à l'autre, avec le même bombé par-dessus.
 */
function chromaticFill(colors: readonly ChromaticColor[]): string {
  const relief = "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.22) 100%)";
  if (colors.length === 1) {
    const color = CHROMATIC_SWATCHES[colors[0]!];
    return `radial-gradient(circle at 50% 35%, ${mixHex(color, "#ffffff", 0.22)} 0%, ${color} 55%, ${mixHex(color, "#000000", 0.25)} 100%)`;
  }
  const stops = colors.map((c, i) => `${CHROMATIC_SWATCHES[c]} ${Math.round((i / (colors.length - 1)) * 100)}%`).join(", ");
  return `${relief}, linear-gradient(135deg, ${stops})`;
}

/** Ce que fait le Signal de chaque couleur (texte des émetteurs du Lot 15), pour l'info-bulle du médaillon. */
const CHROMATIC_SIGNAL_TEXT: Record<ChromaticColor, string> = {
  rouge: "Vos autres Sentinelles ont +1 Puissance pendant votre tour.",
  jaune: "Vos autres Sentinelles ont +1 Résistance maximale.",
  bleu: "La première fois à chaque tour qu'une autre Sentinelle que vous contrôlez attaque une unité adverse, cette unité adverse perd 1 Puissance jusqu'à votre prochain tour.",
  vert: "La première fois pendant chacun de vos tours que vous jouez une autre Sentinelle, récupérez 1 Raison.",
  violet: "La première fois à chaque tour qu'une autre Sentinelle que vous contrôlez est ciblée par un effet adverse, piochez 1 carte puis défaussez-en 1.",
};

/** Icône du badge "Durée" (Structure/Objet à durée limitée, `instance.turnsRemaining`) — le nombre de tours restants est superposé au centre. */
const TOUR_ICON = "/assets/status/tour.webp";

/** Maladie d'invocation (`instance.summoningSick`) — distincte des statuts à durée (`instance.statuses`). */
const ENGOURDI_ICON_INFO = {
  icon: "/assets/status/engourdi.webp",
  label: "Engourdi",
  description: "Vient d'être invoquée : ne peut attaquer qu'à partir de votre prochain tour.",
};

/** Repli uniquement pour le cas (rare) où le cadre lui-même n'a pas chargé — pas de bandeaux/découpe peints, juste une teinte par type. */
const TYPE_BG_CLASSES: Record<string, string> = {
  marin: "bg-sky-950",
  creature: "bg-rose-950",
  equipement: "bg-amber-950",
  structure: "bg-emerald-950",
  objet: "bg-violet-950",
  anomalie: "bg-fuchsia-950",
};

/** `true` le temps d'une animation, chaque fois que `value` change (dans n'importe quel sens) par rapport à son appel précédent — pour signaler l'application d'un buff/debuff. */
function useChangeFlash(value: number): boolean {
  const previous = useRef(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (value === previous.current) return undefined;
    previous.current = value;
    setFlashing(true);
    const timeout = setTimeout(() => setFlashing(false), 500);
    return () => clearTimeout(timeout);
  }, [value]);

  return flashing;
}

/**
 * Lisibilité des modificateurs (Notion "Moteur de partie", "Modificateurs
 * de stats & lisibilité visuelle") : vert si la valeur affichée dépasse
 * la base imprimée, rouge si elle est en-dessous (blessure comprise pour
 * la Résistance), couleur normale sinon.
 */
function statColorClass(delta: number): string {
  if (delta > 0) return "text-emerald-300";
  if (delta < 0) return "text-rose-400";
  return "text-white";
}

/**
 * Le cadre ne dépend pas du type de carte mais de la famille (Abyssal via
 * `subtype: "abyssal"`, sinon Standard) et du bloc de stats affiché — voir
 * `public/assets/cards/README.md`.
 */
function getFrameUrl(def: CardDefinition): string {
  // Les jetons (Péons) ont leur propre cadre générique, volontairement
  // indépendant de la famille : il servira aux Péons d'autres archétypes
  // (Notion, Lot 10 — "son cadre doit être générique").
  // Jeton sans Puissance (Éclat Chromatique) : son cadre n'a que la plaque
  // de Résistance — une case d'attaque vide y mentirait.
  if (def.token) return def.attack === undefined ? "/assets/cards/frames/token-no-attack.webp" : "/assets/cards/frames/token.webp";
  const family = isAbyssalVariant(def) ? "abyssal" : "standard";
  const variant = def.attack !== undefined && def.health !== undefined
    ? "power-resistance"
    : def.health !== undefined
      ? "resistance"
      : "no-stats";
  return `/assets/cards/frames/${family}-${variant}.webp`;
}

/** Le type, lui, se recale carte par carte via une icône dédiée superposée au cadre. */
function getTypeIconUrl(def: CardDefinition): string {
  return `/assets/cards/icons/type-${def.type}.webp`;
}

/**
 * Illustration de la carte. Deux écarts avec la règle générale
 * (`illustrations/<cardId>.webp`, cf. `public/assets/cards/README.md`) :
 *
 *  - les JETONS ont leur propre dossier, `assets/token/` ;
 *  - une carte à plusieurs visuels (Péon Cra-Poiscail) prend la variante
 *    tirée à l'invocation et retenue sur l'instance — jamais retirée au
 *    sort ici, sinon le jeton changerait de tête à chaque rendu et
 *    différerait d'un joueur à l'autre.
 */
function getIllustrationUrl(def: CardDefinition, instance: CardInstance): string {
  const directory = def.token ? "/assets/token" : "/assets/cards/illustrations";
  const variant = def.illustrationVariants && instance.illustrationVariant ? `-${instance.illustrationVariant}` : "";
  return `${directory}/${instance.cardId}${variant}.webp`;
}

/** Calque optionnel, Abyssales uniquement — silhouette à fond transparent qui déborde du cadre, posée par-dessus. */
function getDebordUrl(cardId: string): string {
  return `/assets/cards/illustrations/${cardId}-debord.webp`;
}

interface Zone {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Zones du cadre exprimées en % de la carte — mesurées directement sur les
 * pixels des PNG de `frames/` (découpe illustration, bandeau de type, bloc
 * de règles) et sur la carte étalon "Cylindre flottant" pour le reste.
 * Cohérentes à quelques % près entre les 6 cadres Standard/Abyssal. Voir la
 * charte Notion "Bibliothèque visuelle — cohérence verrouillée".
 */
const ILLUSTRATION_ZONE: Zone = { top: 4, left: 7, width: 87, height: 51 };
/**
 * Zone du calque de débord (Abyssales uniquement) — volontairement plus
 * large que `ILLUSTRATION_ZONE` et étendue vers le bas, pour que le sujet
 * déborde du cadre et empiète sur le bandeau de nom, comme sur les exports
 * fournis (ex: Bat-marin Abyssal). Reste dans le cadre clippé de la carte
 * (coins arrondis) — ne déborde jamais sur les cartes voisines.
 */
const DEBORD_ZONE: Zone = { top: 0, left: -4, width: 108, height: 62 };
const NAME_BANNER_ZONE: Zone = { top: 55, left: 8, width: 84, height: 10 };
const RULES_ZONE_WITH_STATS: Zone = { top: 66, left: 9, width: 82, height: 21 };
const RULES_ZONE_NO_STATS: Zone = { top: 66, left: 9, width: 82, height: 28 };
const ATTACK_ZONE: Zone = { top: 87, left: 43, width: 12, height: 7 };
const RESISTANCE_ZONE: Zone = { top: 87, left: 78, width: 12, height: 7 };
const COST_NUMBER_ZONE: Zone = { top: 3, left: 4, width: 14, height: 16 };
const TYPE_RIBBON_ZONE: Zone = { top: 3.8, left: 64, width: 31, height: 7 };

/**
 * Zones propres au cadre de JETON (`token.webp`), mesurées sur ses
 * pixels comme les autres cadres : une grande découpe ovale (5 % / 11,1 %,
 * 78 × 80,3) et deux plaques de stats en pied de cadre, l'épée à gauche
 * (chiffre entre ~22 % et ~35 % en x), le bouclier à droite (~72 % à
 * ~85 %), toutes deux entre ~82 % et ~90 % en y.
 *
 * L'asset est au même format 5:7 que les cadres Standard/Abyssal, donc
 * rendu comme eux. Ce qui reste propre au jeton : ni coût (il ne se joue
 * pas), ni bandeau de type, ni bloc de règles — et une découpe OVALE, que
 * le rectangle de l'illustration déborderait aux quatre coins (le cadre est
 * transparent autour de l'ovale). D'où `TOKEN_ILLUSTRATION_MASK` : la
 * découpe elle-même, légèrement dilatée pour glisser sous le bois du cadre.
 */
const TOKEN_ILLUSTRATION_ZONE: Zone = { top: 3.5, left: 9.5, width: 81, height: 83 };
const TOKEN_ILLUSTRATION_MASK = "/assets/cards/frames/token-mask.webp";
const TOKEN_NAME_ZONE: Zone = { top: 72.5, left: 14, width: 72, height: 8 };
/**
 * Texte d'un jeton (Éclat Chromatique) : le cadre n'a pas de bloc de
 * règles, et la zone des cartes normales tombait sur l'illustration ET sur
 * le nom — illisible. Un cartouche sombre, dans l'ovale, juste au-dessus du
 * nom.
 */
const TOKEN_RULES_ZONE: Zone = { top: 53, left: 17, width: 66, height: 18.5 };

/**
 * Cadre de jeton SANS Puissance (`token-no-attack.webp`, Éclat
 * Chromatique) : ovale plus large, une seule plaque — la Résistance, en bas
 * à droite. Il a sa propre découpe (`token-no-attack-mask.webp`, tirée de
 * la transparence du cadre) ; nom et texte remontent un peu pour laisser
 * la plaque dégagée.
 */
const TOKEN_NO_ATTACK_MASK = "/assets/cards/frames/token-no-attack-mask.webp";
const TOKEN_NO_ATTACK_ILLUSTRATION_ZONE: Zone = { top: 2, left: 4, width: 92, height: 88 };
const TOKEN_NO_ATTACK_NAME_ZONE: Zone = { top: 68.5, left: 14, width: 72, height: 8 };
const TOKEN_NO_ATTACK_RULES_ZONE: Zone = { top: 49, left: 15, width: 70, height: 18.5 };
const TOKEN_NO_ATTACK_RESISTANCE_ZONE: Zone = { top: 81, left: 71, width: 15, height: 8.5 };
const TOKEN_ATTACK_ZONE: Zone = { top: 82.5, left: 21.5, width: 14, height: 7.5 };
const TOKEN_RESISTANCE_ZONE: Zone = { top: 82.5, left: 71.5, width: 14, height: 7.5 };

/**
 * Adapte la taille du nom à sa longueur plutôt qu'une taille fixe — sur un
 * bandeau de largeur fixe, un nom long doit rétrécir plutôt que déborder
 * verticalement de sa zone (débordement observé sur des noms à 2 mots
 * longs comme "Chose des Hauts-Fonds").
 */
function nameFontSizeCqw(name: string): number {
  if (name.length <= 14) return 6.2;
  if (name.length <= 20) return 5.1;
  if (name.length <= 26) return 4.2;
  if (name.length <= 32) return 3.6;
  return 3.2;
}

/** Même logique que `nameFontSizeCqw`, mais pour le texte de règles — on rétrécit plutôt que de faire apparaître une scrollbar. */
function rulesFontSizeCqw(text: string): number {
  if (text.length <= 60) return 5.2;
  if (text.length <= 110) return 4.5;
  if (text.length <= 170) return 3.9;
  return 3.4;
}

function zoneStyle(zone: Zone): React.CSSProperties {
  return {
    position: "absolute",
    top: `${zone.top}%`,
    left: `${zone.left}%`,
    width: `${zone.width}%`,
    height: `${zone.height}%`,
  };
}

/**
 * Une carte, composée en couches plutôt qu'affichée comme une image finie
 * par carte (abandonné — pas réaliste à 80 cartes) :
 * illustration (dans la découpe du cadre) → cadre PNG (contour, bandeaux,
 * bloc de règles, découpes Puissance/Résistance déjà peints) → icône de
 * type, nom, coût, règles et statistiques posés par-dessus aux coordonnées
 * du cadre — jamais gravés dans un asset. Tant qu'un cadre n'existe pas,
 * un aplat de couleur par type le remplace ; tant qu'une illustration
 * n'existe pas pour une carte, sa zone reste neutre plutôt que d'inventer
 * un visuel. Typographie verrouillée dans Notion : Cinzel (nom, type,
 * valeurs) + Crimson Pro (texte de règles).
 */
export function CardTile({
  instance,
  tideState,
  selected,
  disabled,
  onClick,
  widthClassName = "w-28",
  scaleOnHover = true,
  faceDown = false,
  badgeSize = 38,
  showStatusBadges = true,
  auraContext,
  draggable = false,
  onDragStart,
  liftOnHover = false,
}: CardTileProps) {
  // Face cachée : le dos est celui du PROPRIÉTAIRE de la carte (hors partie,
  // « booster » ou « preview » n'ont pas de contexte : dos local).
  const cardBack = useCardBackSrcFor(instance.ownerId);
  const def = getCardDefinition(instance.cardId);
  const isAbyssal = isAbyssalVariant(def);
  const stats = computeEffectiveStats(instance, tideState, auraContext);
  // Bonus actuellement reçus du plateau — alimente la puce du bloc de règles.
  const boardBonuses = auraContext ? collectAuraContributions(instance, tideState, auraContext) : [];
  const hasActiveBoardBonus = boardBonuses.length > 0;
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  // Garde EFFECTIF : imprimé, conditionnel (Chose des Hauts-Fonds), transmis
  // par un Équipement ou temporaire. Hors partie (pas de contexte de
  // plateau), seul le mot-clé imprimé est connu.
  const hasGarde = auraContext
    ? hasKeywordInContext(instance, "garde", {
        tideState,
        controllerBoard: auraContext.controllerBoard,
        controllerReason: auraContext.controllerReason,
      })
    : hasKeyword(def, "garde");
  // Garde tout juste gagnée : son badge arrive en surgissant, pas en apparaissant.
  const gardeGained = useChangeFlash(hasGarde ? 1 : 0) && hasGarde;
  // Pied marin (effectif, même logique que Garde) : l'unité agit dès son
  // arrivée — la marquer « Engourdie » mentirait.
  const hasPiedMarin = auraContext
    ? hasKeywordInContext(instance, "pied-marin", {
        tideState,
        controllerBoard: auraContext.controllerBoard,
        controllerReason: auraContext.controllerReason,
      })
    : hasKeyword(def, "pied-marin");
  const engourdi = instance.summoningSick && isUnit && !hasPiedMarin;
  // Couleurs chromatiques EN JEU (Lot 15) : celle qu'un Émissaire a choisie,
  // qu'un Héraut a prise, qu'un Bracelet prête — rien ne les montrait.
  const couleursChromatiques = auraContext ? chromaticColorsOf(instance, auraContext.controllerBoard) : [];
  const hasResistance = isUnit || def.health !== undefined;
  const resistanceRemaining = Math.max(0, stats.health - instance.damageMarked);
  const resistanceFlashing = useDecreaseFlash(resistanceRemaining);
  // Couleur des chiffres : la valeur AFFICHÉE comparée à la base IMPRIMÉE.
  // Une unité blessée voit donc sa Résistance passer au rouge, une unité
  // renforcée — modificateur, aura de plateau, Signal — passer au vert.
  // Avant, seuls les modificateurs comptaient : une unité à 1/3 restante
  // de Résistance restait blanche.
  const attackDelta = def.attack !== undefined ? stats.attack - def.attack : 0;
  const resistanceDelta = def.health !== undefined ? resistanceRemaining - def.health : 0;
  const attackChanged = useChangeFlash(stats.attack);
  const healthChanged = useChangeFlash(stats.health);

  const frameUrl = getFrameUrl(def);
  const typeIconUrl = getTypeIconUrl(def);
  const illustrationUrl = getIllustrationUrl(def, instance);
  // Le débord n'existe que pour les Abyssales (`public/assets/cards/README.md`) :
  // inutile d'aller le chercher pour toutes les autres cartes.
  const debordUrl = isAbyssal ? getDebordUrl(instance.cardId) : null;
  const frameOk = useImageOk(frameUrl);
  const typeIconOk = useImageOk(typeIconUrl);
  const illustrationOk = useImageOk(illustrationUrl);
  const debordOk = useImageOk(debordUrl);

  const rulesZone = isUnit || hasResistance ? RULES_ZONE_WITH_STATS : RULES_ZONE_NO_STATS;
  const isToken = def.token === true;
  const tokenNoAttack = isToken && def.attack === undefined;
  const illustrationZone = tokenNoAttack ? TOKEN_NO_ATTACK_ILLUSTRATION_ZONE : isToken ? TOKEN_ILLUSTRATION_ZONE : ILLUSTRATION_ZONE;
  const nameZone = tokenNoAttack ? TOKEN_NO_ATTACK_NAME_ZONE : isToken ? TOKEN_NAME_ZONE : NAME_BANNER_ZONE;
  const attackZone = isToken ? TOKEN_ATTACK_ZONE : ATTACK_ZONE;
  const resistanceZone = tokenNoAttack ? TOKEN_NO_ATTACK_RESISTANCE_ZONE : isToken ? TOKEN_RESISTANCE_ZONE : RESISTANCE_ZONE;
  const tokenRulesZone = tokenNoAttack ? TOKEN_NO_ATTACK_RULES_ZONE : TOKEN_RULES_ZONE;
  const tokenMask = tokenNoAttack ? TOKEN_NO_ATTACK_MASK : TOKEN_ILLUSTRATION_MASK;

  const hoverable = Boolean(onClick) && !disabled;
  const scalesOnHover = hoverable && scaleOnHover;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || disabled}
      title={def.text}
      draggable={draggable}
      onDragStart={onDragStart}
      className={`${widthClassName} relative rounded-xl text-left ${
        liftOnHover
          ? "transition-[transform,box-shadow,filter] duration-[160ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:z-10 hover:-translate-y-2 hover:scale-[1.035] hover:-rotate-[0.7deg] hover:brightness-[1.06] hover:shadow-[0_22px_44px_-10px_rgba(0,0,0,0.78),0_6px_14px_-6px_rgba(0,0,0,0.5)]"
          : "transition-shadow duration-200"
      } ${selected ? "ring-2 ring-board-accent" : ""} ${disabled ? "opacity-40" : ""} ${
        onClick ? "cursor-pointer" : "cursor-default"
      } ${hoverable && !liftOnHover ? "hover:shadow-[0_0_35px_rgba(62,166,255,0.6)]" : ""}`}
    >
      <div
        className={`relative aspect-[5/7] w-full overflow-hidden rounded-xl transition-transform duration-150 ease-out ${
          scalesOnHover ? "hover:scale-[1.03]" : ""
        } ${resistanceFlashing ? "animate-card-impact" : ""}`}
        style={{ containerType: "inline-size" }}
      >
        {faceDown ? (
          // Structure invisible pour la Marée courante, mais posée par SON PROPRIÉTAIRE (voir `faceDown` sur
          // `CardTileProps`) : dos de carte à la place de l'illustration/cadre/stats — les badges flottants
          // (dont "Durée") et le bouton "i" externe restent accessibles, contrairement à `hiddenFromViewer`
          // (adversaire) qui masque tout.
          // eslint-disable-next-line @next/next/no-img-element -- asset local unique, pas de variation par carte
          <img
            src={cardBack}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="h-full w-full select-none object-cover"
          />
        ) : (
        <>
        {/* Couche 1 : illustration, dans la découpe du cadre (ou plein cadre si le cadre est absent).
            Jeton : le calque couvre toute la carte et porte le masque de la découpe ovale. */}
        <div
          className="absolute inset-0"
          style={
            isToken && frameOk
              ? {
                  maskImage: `url(${tokenMask})`,
                  WebkitMaskImage: `url(${tokenMask})`,
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                }
              : undefined
          }
        >
          <div
            className={`absolute overflow-hidden ${
              frameOk ? (isToken ? "bg-black/30" : "rounded-sm bg-black/30") : (TYPE_BG_CLASSES[def.type] ?? "bg-board-surface")
            }`}
            style={frameOk ? zoneStyle(illustrationZone) : { position: "absolute", inset: 0 }}
          >
            {illustrationOk && (
              // eslint-disable-next-line @next/next/no-img-element -- asset local, une par carte
              <img src={illustrationUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            )}
          </div>
        </div>

        {/* Couche 2 : le cadre PNG — contour, bandeaux, bloc de règles et découpes de stats déjà peints */}
        {frameOk && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, cadre réutilisé par famille/variante de stats
          <img src={frameUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {/* Couche 2.5 : débord Abyssal — silhouette à fond transparent qui déborde du cadre, posée par-dessus */}
        {isAbyssal && debordOk && debordUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, calque optionnel par carte Abyssale
          <img
            src={debordUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute object-contain object-top"
            style={zoneStyle(DEBORD_ZONE)}
          />
        )}

        {/* Couche 3 : icônes, textes et valeurs variables injectés par-dessus le cadre */}
        <div className="absolute inset-0">
          {/* Un jeton ne se joue jamais depuis la main : pas de coût à afficher. */}
          {!isToken && (
            <div
              className="flex items-center justify-center text-center font-bold text-white [font-family:var(--font-card-title)]"
              style={{ ...zoneStyle(COST_NUMBER_ZONE), fontSize: "11cqw", textShadow: THICK_TEXT_OUTLINE }}
            >
              {def.cost}
            </div>
          )}

          {/* Le cadre de jeton n'a pas d'emplacement pour le bandeau de type. */}
          <div
            className={`flex items-center justify-start overflow-hidden px-[4%] ${frameOk ? "" : "rounded bg-black/50"} ${
              isToken ? "hidden" : ""
            }`}
            style={zoneStyle(TYPE_RIBBON_ZONE)}
          >
            {typeIconOk && (
              // eslint-disable-next-line @next/next/no-img-element -- asset local, icône + libellé de type déjà réunis dans l'asset
              <img
                src={typeIconUrl}
                alt={CARD_TYPE_LABELS[def.type]}
                loading="lazy"
                decoding="async"
                className="h-[78%] w-auto object-contain"
                style={isAbyssal ? { filter: "grayscale(1) brightness(0.45)" } : undefined}
              />
            )}
          </div>

          {/* Jeton : pas de bandeau, le nom est posé centré sur le bas de l'illustration. */}
          <div
            className={`flex items-center overflow-hidden font-semibold uppercase leading-tight text-white [font-family:var(--font-card-title)] ${
              isToken ? "justify-center px-[2%] text-center" : "justify-start pl-[4%] pr-[2%] text-left"
            }`}
            style={{ ...zoneStyle(nameZone), textShadow: THICK_TEXT_OUTLINE }}
          >
            <span
              className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ fontSize: `${nameFontSizeCqw(def.name)}cqw` }}
            >
              <span style={{ fontSize: "1.6em" }}>{def.name.charAt(0)}</span>
              {def.name.slice(1)}
            </span>
          </div>

          {def.text && (
            <div
              className={`overflow-hidden border px-[3%] leading-snug [font-family:var(--font-card-body)] ${
                isToken
                  ? "flex items-center justify-center rounded-md border-white/25 bg-slate-950/70 text-center text-slate-50"
                  : frameOk
                    ? `rounded-sm text-left text-slate-800 ${isAbyssal ? "border-slate-600/70" : "border-sky-600/50"}`
                    : "rounded-sm border-transparent bg-black/50 text-left text-slate-100"
              }`}
              style={{ ...zoneStyle(isToken ? tokenRulesZone : rulesZone), fontSize: `${rulesFontSizeCqw(def.text)}cqw` }}
            >
              {/* Puce discrète : une condition de plateau est REMPLIE en ce
                  moment (banc assez grand, Destrier présent, Marée dans le
                  bon sens…). Volontairement muette — elle signale qu'il se
                  passe quelque chose, la fiche de carte dit quoi. */}
              {hasActiveBoardBonus && (
                <span
                  aria-hidden
                  title="Un effet de plateau est actif sur cette carte"
                  className="mr-[0.35em] inline-block align-middle"
                  style={{
                    width: "0.5em",
                    height: "0.5em",
                    borderRadius: "9999px",
                    background: "var(--accent)",
                    boxShadow: "0 0 0.35em var(--accent)",
                  }}
                />
              )}
              {def.text}
            </div>
          )}

          {isUnit && (
            <div
              // Repère des pastilles de gain (`EffectFxLayer`) : elles viennent se ranger ICI.
              data-stat="attack"
              className={`flex items-center font-bold [font-family:var(--font-card-title)] ${
                isToken ? "justify-center" : "justify-start"
              } ${statColorClass(attackDelta)} ${attackChanged ? "animate-stat-buff" : ""}`}
              style={{ ...zoneStyle(attackZone), fontSize: "7.5cqw", textShadow: THICK_TEXT_OUTLINE }}
            >
              {stats.attack}
            </div>
          )}
          {hasResistance && (
            <div
              data-stat="resistance"
              className={`flex items-center font-bold [font-family:var(--font-card-title)] ${
                isToken ? "justify-center" : "justify-start"
              } ${
                resistanceFlashing ? "animate-stat-hit text-white" : `${statColorClass(resistanceDelta)} ${healthChanged ? "animate-stat-buff" : ""}`
              }`}
              style={{ ...zoneStyle(resistanceZone), fontSize: "7.5cqw", textShadow: THICK_TEXT_OUTLINE }}
            >
              {resistanceRemaining}
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* Badges de statut/mot-clé — EN DEHORS du conteneur `overflow-hidden` (le cadre/l'illustration),
          flottant juste au-dessus de la carte : trop petits pour être vus "à l'œil nu" quand ils étaient
          incrustés dans le cadre en cqw (rapetissant avec la carte). Taille fixe désormais (`StatusBadge`
          n'utilise plus `cqw`), toujours lisible même sur la plus petite carte de plateau. */}
      {showStatusBadges &&
        (stats.inactive ||
        engourdi ||
        instance.turnsRemaining !== undefined ||
        hasGarde ||
        couleursChromatiques.length > 0 ||
        (instance.statuses && instance.statuses.length > 0)) && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex flex-wrap items-center justify-center px-1"
          style={{ top: -(badgeSize / 2 + 12), gap: badgeSize / 16 + 1.5 }}
        >
          {stats.inactive && (
            <span
              className="pointer-events-auto rounded-full border border-amber-400/60 bg-black/90 font-semibold uppercase text-amber-300 shadow-md"
              style={{ padding: `${badgeSize / 38}px ${(badgeSize / 38) * 2.5}px`, fontSize: badgeSize / 3.2 }}
            >
              Inactive
            </span>
          )}
          {engourdi && (
            <StatusBadge
              icon={ENGOURDI_ICON_INFO.icon}
              label={ENGOURDI_ICON_INFO.label}
              description={ENGOURDI_ICON_INFO.description}
              size={badgeSize}
            />
          )}
          {hasGarde && (
            <span className={gardeGained ? "animate-badge-arrive" : undefined} style={{ display: "inline-flex" }}>
              <StatusBadge
                icon={GARDE_ICON_INFO.icon}
                label={GARDE_ICON_INFO.label}
                description={GARDE_ICON_INFO.description}
                size={badgeSize}
              />
            </span>
          )}
          {instance.statuses?.map((status) => {
            const info = STATUS_ICON_INFO[status];
            if (!info) return null;
            return <StatusBadge key={status} icon={info.icon} label={info.label} description={info.description} size={badgeSize} />;
          })}
          {couleursChromatiques.length > 0 && (
            // Même médaillon que les autres badges (le vierge, `tour.webp`),
            // la ou les couleurs peintes dans son verre.
            <StatusBadge
              icon={TOUR_ICON}
              fill={chromaticFill(couleursChromatiques)}
              label={`${
                def.chromatic?.emitsSignal
                  ? couleursChromatiques.length > 1
                    ? "Signaux"
                    : "Signal"
                  : couleursChromatiques.length > 1
                    ? "Couleurs"
                    : "Couleur"
              } : ${couleursChromatiques
                .map((c) => CHROMATIC_COLOR_LABELS[c])
                .join(", ")}`}
              description={
                <>
                  <p className="mb-1.5">
                    {def.chromatic?.emitsSignal
                      ? "Cette Sentinelle émet le Signal de sa couleur :"
                      : "Couleur de cette carte — elle compte pour les Signaux et les effets qui lisent la couleur :"}
                  </p>
                  {couleursChromatiques.map((color) => (
                    <p key={color} className="mt-1 flex gap-1.5">
                      <span
                        aria-hidden
                        className="mt-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: chromaticFill([color]) }}
                      />
                      <span>
                        <strong className="text-white">Signal {CHROMATIC_COLOR_LABELS[color]}</strong> — {CHROMATIC_SIGNAL_TEXT[color]}
                      </span>
                    </p>
                  ))}
                </>
              }
              size={badgeSize}
            />
          )}
          {instance.turnsRemaining !== undefined && (
            <StatusBadge
              icon={TOUR_ICON}
              label="Durée"
              description={`${instance.turnsRemaining} tour${instance.turnsRemaining > 1 ? "s" : ""} restant${instance.turnsRemaining > 1 ? "s" : ""} avant expiration.`}
              overlayText={String(instance.turnsRemaining)}
              size={badgeSize}
            />
          )}
        </div>
      )}
    </button>
  );
}
