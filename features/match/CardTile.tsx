"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeEffectiveStats,
  computeStatModifierDelta,
  getCardDefinition,
  hasKeyword,
  STATUS_IMMOBILISE,
  STATUS_MALADE,
  STATUS_SILENCE,
  UNIT_CARD_TYPES,
  type CardDefinition,
  type CardInstance,
  type TideStateName,
} from "@/game";
import { CARD_TYPE_LABELS, THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";
import { StatusBadge } from "@/features/match/StatusBadge";

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
}

/**
 * Registre des icônes de statuts ponctuels (`instance.statuses`) — assets
 * fournis à plat dans `public/assets/` (`effect_malade.png`, etc.), un
 * statut sans entrée ici reste silencieux plutôt que de casser l'affichage
 * (système volontairement générique : ajouter un statut n'importe où dans
 * le moteur n'exige qu'une entrée ici pour être visible).
 */
const STATUS_ICON_INFO: Record<string, { icon: string; label: string; description: string }> = {
  [STATUS_MALADE]: {
    icon: "/assets/effect_malade.png",
    label: "Malade",
    description: "Perd 1 Résistance à chaque tour tant que ce statut reste actif.",
  },
  [STATUS_IMMOBILISE]: {
    icon: "/assets/effect_immobilise.png",
    label: "Immobilisé",
    description: "Ne peut ni attaquer ni utiliser ses capacités tant que ce statut reste actif.",
  },
  [STATUS_SILENCE]: {
    icon: "/assets/effect_silence.png",
    label: "Silence",
    description: "Ses capacités déclenchées et effets d'arrivée sont désactivés tant que ce statut reste actif.",
  },
};

/** Mot-clé Garde (`def.keywords`, permanent — pas un statut à durée) : même registre d'icône que les statuts. */
const GARDE_ICON_INFO = {
  icon: "/assets/effect_garde.png",
  label: "Garde",
  description: "Les attaques adverses visant votre Navire doivent cibler en priorité les permanents portant Garde.",
};

/** Icône du badge "Durée" (Structure/Objet à durée limitée, `instance.turnsRemaining`) — le nombre de tours restants est superposé au centre. */
const TOUR_ICON = "/assets/effect_tour.png";

/** Maladie d'invocation (`instance.summoningSick`) — distincte des statuts à durée (`instance.statuses`). */
const ENGOURDI_ICON_INFO = {
  icon: "/assets/effect_engourdi.png",
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

/**
 * Précharge une image hors du DOM plutôt que de dépendre de l'événement
 * `onError` d'un `<img>` rendu — plus fiable quand beaucoup de cartes se
 * chargent en même temps (ex: la page Collection, 80 cartes), où
 * `onError` s'est révélé peu fiable dans les tests. `false` tant que
 * l'image n'a pas fini de charger OU si elle échoue (404, pas encore
 * fournie) — pas d'état intermédiaire à gérer côté appelant.
 */
function useImageOk(url: string): boolean {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOk(false);
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setOk(true);
    };
    img.onerror = () => {
      if (!cancelled) setOk(false);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return ok;
}

/** `true` le temps d'une animation, chaque fois que `value` diminue par rapport à son appel précédent. */
function useDecreaseFlash(value: number): boolean {
  const previous = useRef(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (value >= previous.current) {
      previous.current = value;
      return undefined;
    }
    setFlashing(true);
    previous.current = value;
    const timeout = setTimeout(() => setFlashing(false), 500);
    return () => clearTimeout(timeout);
  }, [value]);

  return flashing;
}

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
 * la base imprimée (éventuellement ajustée par la Marée), rouge si elle
 * est en-dessous, couleur normale sinon.
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
  const family = def.subtype === "abyssal" ? "ABYSSAL" : "STANDARD";
  const variant = def.attack !== undefined && def.health !== undefined
    ? "POWER_RESISTANCE"
    : def.health !== undefined
      ? "RESISTANCE"
      : "NO_STATS";
  return `/assets/cards/frames/FRAME_${family}_${variant}.png`;
}

/** Le type, lui, se recale carte par carte via une icône dédiée superposée au cadre. */
function getTypeIconUrl(def: CardDefinition): string {
  return `/assets/cards/icons/TYPE_${def.type.toUpperCase()}_STANDARD.png`;
}

/** Calque optionnel, Abyssales uniquement — silhouette à fond transparent qui déborde du cadre, posée par-dessus. */
function getDebordUrl(cardId: string): string {
  return `/assets/cards/illustrations/${cardId}-debord.png`;
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
const STATUS_BADGES_ZONE: Zone = { top: 48, left: 9, width: 82, height: 6 };
const NAME_BANNER_ZONE: Zone = { top: 55, left: 8, width: 84, height: 10 };
const RULES_ZONE_WITH_STATS: Zone = { top: 66, left: 9, width: 82, height: 21 };
const RULES_ZONE_NO_STATS: Zone = { top: 66, left: 9, width: 82, height: 28 };
const ATTACK_ZONE: Zone = { top: 87, left: 43, width: 12, height: 7 };
const RESISTANCE_ZONE: Zone = { top: 87, left: 78, width: 12, height: 7 };
const COST_NUMBER_ZONE: Zone = { top: 3, left: 4, width: 14, height: 16 };
const TYPE_RIBBON_ZONE: Zone = { top: 3.8, left: 64, width: 31, height: 7 };

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
}: CardTileProps) {
  const def = getCardDefinition(instance.cardId);
  const isAbyssal = def.subtype === "abyssal";
  const stats = computeEffectiveStats(instance, tideState);
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  const hasResistance = isUnit || def.health !== undefined;
  const resistanceRemaining = Math.max(0, stats.health - instance.damageMarked);
  const resistanceFlashing = useDecreaseFlash(resistanceRemaining);
  const modifierDelta = computeStatModifierDelta(instance);
  const attackChanged = useChangeFlash(modifierDelta.attack);
  const healthChanged = useChangeFlash(modifierDelta.health);

  const frameUrl = getFrameUrl(def);
  const typeIconUrl = getTypeIconUrl(def);
  const illustrationUrl = `/assets/cards/illustrations/${instance.cardId}.png`;
  const debordUrl = getDebordUrl(instance.cardId);
  const frameOk = useImageOk(frameUrl);
  const typeIconOk = useImageOk(typeIconUrl);
  const illustrationOk = useImageOk(illustrationUrl);
  const debordOk = useImageOk(debordUrl);

  const rulesZone = isUnit || hasResistance ? RULES_ZONE_WITH_STATS : RULES_ZONE_NO_STATS;

  const hoverable = Boolean(onClick) && !disabled;
  const scalesOnHover = hoverable && scaleOnHover;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || disabled}
      title={def.text}
      className={`${widthClassName} rounded-xl text-left transition-shadow duration-200 ${
        selected ? "ring-2 ring-board-accent" : ""
      } ${disabled ? "opacity-40" : ""} ${onClick ? "cursor-pointer" : "cursor-default"} ${
        hoverable ? "hover:shadow-[0_0_35px_rgba(62,166,255,0.6)]" : ""
      }`}
    >
      <div
        className={`relative aspect-[5/7] w-full overflow-hidden rounded-xl transition-transform duration-150 ease-out ${
          scalesOnHover ? "hover:scale-[1.03]" : ""
        }`}
        style={{ containerType: "inline-size" }}
      >
        {/* Couche 1 : illustration, dans la découpe du cadre (ou plein cadre si le cadre est absent) */}
        <div
          className={`absolute overflow-hidden ${frameOk ? "rounded-sm bg-black/30" : (TYPE_BG_CLASSES[def.type] ?? "bg-board-surface")}`}
          style={frameOk ? zoneStyle(ILLUSTRATION_ZONE) : { position: "absolute", inset: 0 }}
        >
          {illustrationOk && (
            // eslint-disable-next-line @next/next/no-img-element -- asset local, une par carte
            <img src={illustrationUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        {/* Couche 2 : le cadre PNG — contour, bandeaux, bloc de règles et découpes de stats déjà peints */}
        {frameOk && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, cadre réutilisé par famille/variante de stats
          <img src={frameUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {/* Couche 2.5 : débord Abyssal — silhouette à fond transparent qui déborde du cadre, posée par-dessus */}
        {isAbyssal && debordOk && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, calque optionnel par carte Abyssale
          <img src={debordUrl} alt="" className="pointer-events-none absolute object-contain object-top" style={zoneStyle(DEBORD_ZONE)} />
        )}

        {/* Couche 3 : icônes, textes et valeurs variables injectés par-dessus le cadre */}
        <div className="absolute inset-0">
          <div
            className="flex items-center justify-center text-center font-bold text-white [font-family:var(--font-card-title)]"
            style={{ ...zoneStyle(COST_NUMBER_ZONE), fontSize: "11cqw", textShadow: THICK_TEXT_OUTLINE }}
          >
            {def.cost}
          </div>

          <div
            className={`flex items-center justify-start overflow-hidden px-[4%] ${frameOk ? "" : "rounded bg-black/50"}`}
            style={zoneStyle(TYPE_RIBBON_ZONE)}
          >
            {typeIconOk && (
              // eslint-disable-next-line @next/next/no-img-element -- asset local, icône + libellé de type déjà réunis dans l'asset
              <img
                src={typeIconUrl}
                alt={CARD_TYPE_LABELS[def.type]}
                className="h-[78%] w-auto object-contain"
                style={isAbyssal ? { filter: "grayscale(1) brightness(0.45)" } : undefined}
              />
            )}
          </div>

          <div
            className="flex items-center justify-start overflow-hidden pl-[4%] pr-[2%] text-left font-semibold uppercase leading-tight text-white [font-family:var(--font-card-title)]"
            style={{ ...zoneStyle(NAME_BANNER_ZONE), textShadow: THICK_TEXT_OUTLINE }}
          >
            <span
              className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ fontSize: `${nameFontSizeCqw(def.name)}cqw` }}
            >
              <span style={{ fontSize: "1.6em" }}>{def.name.charAt(0)}</span>
              {def.name.slice(1)}
            </span>
          </div>

          {(stats.inactive ||
            (instance.summoningSick && isUnit) ||
            instance.turnsRemaining !== undefined ||
            hasKeyword(def, "garde") ||
            (instance.statuses && instance.statuses.length > 0)) && (
            <div
              className="flex flex-wrap items-center justify-center gap-1 overflow-visible"
              style={{ ...zoneStyle(STATUS_BADGES_ZONE), fontSize: "5cqw" }}
            >
              {stats.inactive && <span className="rounded bg-black/60 px-1 text-amber-300">Inactive</span>}
              {instance.summoningSick && isUnit && (
                <StatusBadge
                  icon={ENGOURDI_ICON_INFO.icon}
                  label={ENGOURDI_ICON_INFO.label}
                  description={ENGOURDI_ICON_INFO.description}
                />
              )}
              {hasKeyword(def, "garde") && (
                <StatusBadge icon={GARDE_ICON_INFO.icon} label={GARDE_ICON_INFO.label} description={GARDE_ICON_INFO.description} />
              )}
              {instance.statuses?.map((status) => {
                const info = STATUS_ICON_INFO[status];
                if (!info) return null;
                return <StatusBadge key={status} icon={info.icon} label={info.label} description={info.description} />;
              })}
              {instance.turnsRemaining !== undefined && (
                <StatusBadge
                  icon={TOUR_ICON}
                  label="Durée"
                  description={`${instance.turnsRemaining} tour${instance.turnsRemaining > 1 ? "s" : ""} restant${instance.turnsRemaining > 1 ? "s" : ""} avant expiration.`}
                  overlayText={String(instance.turnsRemaining)}
                />
              )}
            </div>
          )}

          {def.text && (
            <div
              className={`overflow-hidden rounded-sm border px-[3%] text-left leading-snug [font-family:var(--font-card-body)] ${
                frameOk
                  ? `text-slate-800 ${isAbyssal ? "border-slate-600/70" : "border-sky-600/50"}`
                  : "border-transparent bg-black/50 text-slate-100"
              }`}
              style={{ ...zoneStyle(rulesZone), fontSize: `${rulesFontSizeCqw(def.text)}cqw` }}
            >
              {def.text}
            </div>
          )}

          {isUnit && (
            <div
              className={`flex items-center justify-start font-bold [font-family:var(--font-card-title)] ${statColorClass(
                modifierDelta.attack
              )} ${attackChanged ? "animate-stat-buff" : ""}`}
              style={{ ...zoneStyle(ATTACK_ZONE), fontSize: "7.5cqw", textShadow: THICK_TEXT_OUTLINE }}
            >
              {stats.attack}
            </div>
          )}
          {hasResistance && (
            <div
              className={`flex items-center justify-start font-bold [font-family:var(--font-card-title)] ${
                resistanceFlashing ? "animate-stat-hit text-white" : `${statColorClass(modifierDelta.health)} ${healthChanged ? "animate-stat-buff" : ""}`
              }`}
              style={{ ...zoneStyle(RESISTANCE_ZONE), fontSize: "7.5cqw", textShadow: THICK_TEXT_OUTLINE }}
            >
              {resistanceRemaining}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
