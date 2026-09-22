"use client";

import type { CSSProperties } from "react";
import type { PlayerId } from "@/game";
import styles from "@/features/match/table/Table.module.css";
import { useShipFrameGeometryFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import {
  SHIP_ABILITY_PLANKS_URL,
  SHIP_ABILITY_RING_URL,
  shipIllustrationUrl,
} from "@/features/ships/shipFrame";

export interface ShipView {
  /** Nom lisible, pour les lecteurs d'écran uniquement. */
  name: string;
  /** Joueur dont c'est le Navire : le cadre est le SIEN (cosmétique équipé), pas celui du joueur local. Absent (labo) : le cadre local. */
  ownerId?: PlayerId;
  /** Fichier de `public/assets/ships/illu/` — arche vide si absent. */
  illustration?: string;
  /** Ancrage (pastille rouge). */
  hull: number;
  maxHull: number;
  /** Raison (pastille bleue) — peut être négative (Déraison). */
  reason: number;
  /** Plafond de Raison courant (`reasonCeiling`) — réduit pendant les Abysses. */
  maxReason: number;
  /** Dégâts d'Ancrage que la Déraison infligera en fin de tour (0 = rien à annoncer). */
  deraisonDamage?: number;
  /** Capacité activable du Navire, quand il en porte une de câblée (Le Goliath — Canon de proue). */
  ability?: ShipAbilityPanelView;
}

/**
 * Le petit cadre posé sur le cadre du Navire.
 *
 * DEUX SORTES de capacités, deux habillages :
 *   - en DEUX TEMPS (le Canon de proue du Goliath, `planks`) : le hublot est
 *     fermé par des planches qui s'écartent à l'armement et découvrent la
 *     gueule du canon. Les planches DISENT l'armement — c'est leur seul
 *     rôle, d'où leur absence ailleurs ;
 *   - en UN SEUL geste (les quatre autres, une fois par tour ou par partie) :
 *     l'illustration est visible en permanence, rien à découvrir.
 *
 * Le HALO ne décore pas : il dit « ce clic est possible maintenant ». Pas de
 * halo si la capacité est hors de sa phase, trop chère, ou déjà utilisée.
 *
 * `onClick` absent = le panneau est en LECTURE seule : c'est le cas du
 * Navire adverse, dont on doit voir le canon découvert — c'est une
 * information publique, et savoir qu'il est armé change ce qu'on joue.
 */
export interface ShipAbilityPanelView {
  name: string;
  /** Texte imprimé, montré en entier sur la carte de survol. */
  text: string;
  /** Capacité en deux temps : le hublot porte des planches, qui s'écartent une fois armé. */
  planks: boolean;
  /** Planches écartées : la capacité est armée. */
  armed: boolean;
  /** Le panneau appelle un clic maintenant (halo) — activer, armer, ou tirer. */
  actionable: boolean;
  /** URL de l'illustration du hublot — absent : fond de substitution. */
  artUrl?: string;
  /** Ce qui empêche d'agir, dit sur la carte de survol. */
  blockedBy?: string;
  /** Absent : panneau d'observation, non cliquable (Navire adverse). */
  onClick?: () => void;
}

/**
 * Panneau de capacité — le hublot de laiton, ce qu'il cache, les planches,
 * le halo et le clic.
 *
 * Assemblage : l'illustration au fond, les deux planches par-dessus, le tout
 * découpé au rond intérieur du hublot (`.shipAbilityPort`), et le hublot
 * lui-même posé en dernier par-dessus le bord.
 *
 * Les deux planches sont la MÊME image (`planches.webp`, un bardage large),
 * cadrée sur sa moitié haute pour l'une et sa moitié basse pour l'autre : le
 * bois se raccorde donc exactement au milieu quand le panneau est fermé, et
 * les deux moitiés s'écartent vers le haut et vers le bas à l'armement.
 */
function ShipAbilityPanel({ name, text, planks, armed, actionable, artUrl, blockedBy, onClick }: ShipAbilityPanelView) {
  const label = armed ? `${name} — armé` : name;
  const status = actionable ? null : blockedBy;
  const ariaLabel = [label, text, status].filter(Boolean).join(" — ");
  const className = [
    styles.shipAbility,
    armed ? styles.shipAbilityArmed : "",
    actionable ? styles.shipAbilityReady : "",
    onClick ? "" : styles.shipAbilityReadOnly,
  ]
    .filter(Boolean)
    .join(" ");

  const plankStyle = { backgroundImage: `url(${SHIP_ABILITY_PLANKS_URL})` };
  const content = (
    <>
      <span aria-hidden className={styles.shipAbilityPort}>
        <span
          className={styles.shipAbilityArt}
          style={artUrl ? { backgroundImage: `url(${artUrl})` } : undefined}
        />
        {planks && (
          <>
            <span className={`${styles.shipAbilityPlank} ${styles.shipAbilityPlankTop}`} style={plankStyle} />
            <span className={`${styles.shipAbilityPlank} ${styles.shipAbilityPlankBottom}`} style={plankStyle} />
          </>
        )}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- hublot décoratif, taille pilotée par le cadre */}
      <img src={SHIP_ABILITY_RING_URL} alt="" aria-hidden draggable={false} className={styles.shipAbilityRing} />
      {/* La CARTE de survol : un hublot de trente pixels ne dit pas ce que
          fait la capacité. Elle sort au survol et au clavier (`:focus-visible`),
          jamais au doigt — d'où le `title` gardé en repli. */}
      <span aria-hidden className={styles.shipAbilityCard}>
        <span className={styles.shipAbilityCardName}>{label}</span>
        <span className={styles.shipAbilityCardText}>{text}</span>
        {status && <span className={styles.shipAbilityCardStatus}>{status}</span>}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <span className={className} title={ariaLabel} role="img" aria-label={ariaLabel}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={ariaLabel}
      aria-label={ariaLabel}
      // Le cadre du Navire entier est cliquable (fiche, ciblage) : sans ça,
      // le clic sur le panneau ouvrirait aussi la fiche derrière lui.
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onContextMenu={(event) => event.stopPropagation()}
    >
      {content}
    </button>
  );
}

const GAUGE_ASSETS = {
  anchor: "/assets/ships/gauge-anchor.webp",
  reason: "/assets/ships/gauge-reason.webp",
} as const;

const GAUGE_LABELS = { anchor: "Ancrage", reason: "Raison" } as const;

/**
 * Médaillon de ressource du cadre Navire — reprend point pour point le
 * comportement de l'ancien plateau (`features/match/ResourceGauge.tsx`),
 * perdu au passage au nouveau, qui n'affichait plus qu'un chiffre fixe :
 *
 *  - le disque SE VIDE PROGRESSIVEMENT, comme une fiole : l'asset est peint
 *    plein (aucune variante "vide" fournie), on le recouvre donc par le HAUT
 *    d'un voile sombre dont la hauteur suit la ressource, avec un trait de
 *    surface au niveau du liquide, qui ONDULE comme de l'eau (deux vagues
 *    croisées, cf. `.shipGaugeDrain::before/::after`). La hauteur est
 *    animée, donc chaque perte se voit descendre ;
 *  - le MAXIMUM apparaît au survol, sous la valeur courante et séparé d'elle
 *    par un petit trait — la valeur seule le reste du temps, pour ne pas
 *    encombrer un médaillon large de quelques dizaines de pixels ;
 *  - Déraison (Raison négative) : disque entièrement vidé, voile rouge qui
 *    pulse, valeur en rouge.
 */
function ShipGauge({ kind, value, max }: { kind: keyof typeof GAUGE_ASSETS; value: number; max: number }) {
  const level = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const inDebt = value < 0;

  return (
    <span className={styles.shipGauge} title={`${GAUGE_LABELS[kind]} ${value} / ${max}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- médaillon décoratif */}
      <img src={GAUGE_ASSETS[kind]} alt="" aria-hidden draggable={false} className={styles.fill} />
      <span aria-hidden className={styles.shipGaugeBowl}>
        {/* La vague ne se dessine qu'entre les deux extrêmes : à plein il
            n'y a pas de surface, à vide il n'y a plus de liquide à agiter. */}
        <span
          className={`${styles.shipGaugeDrain} ${level >= 1 || level <= 0 ? styles.shipGaugeDrainEmpty : ""}`}
          style={{ height: `${(1 - level) * 100}%` }}
        />
      </span>
      {inDebt && <span aria-hidden className={styles.shipGaugeDebt} />}
      <span className={`${styles.shipGaugeValue} ${inDebt ? styles.shipGaugeValueDebt : ""}`}>{value}</span>
      <span aria-hidden className={styles.shipGaugeMax}>
        <span className={styles.shipGaugeMaxRule} />
        <span className={styles.shipGaugeMaxValue}>{max}</span>
      </span>
    </span>
  );
}

/**
 * Cadre Navire réel (`ship-frame-empty.webp`, illustration dans l'arche,
 * médaillons Ancrage/Raison sur la plaque), à la place qu'il occupait sur
 * l'ancien board : colonne de gauche, calé sur la hauteur de sa rangée.
 *
 * Même assemblage que `ShipInstrumentCluster`, mais dimensionné en
 * pourcentages du cadre plutôt qu'en pixels : il remplit sa cellule
 * (`height: 100%`, ratio du cadre), c'est la grille qui décide de sa taille.
 * La géométrie de l'arche vient de `features/ships/shipFrame.ts` (aucun
 * import de `@/game`).
 */
export function TableShip({ name, ownerId, illustration, hull, maxHull, reason, maxReason, deraisonDamage = 0, ability }: ShipView) {
  const frame = useShipFrameGeometryFor(ownerId);
  return (
    <div
      className={styles.ship}
      style={{ "--frame-aspect": frame.aspect, "--plate-top": frame.plateTop } as CSSProperties}
      role="img"
      aria-label={`${name} — Ancrage ${hull}/${maxHull}, Raison ${reason}/${maxReason}`}
    >
      <div className={styles.shipArt} style={{ ...frame.zone, clipPath: frame.clip }}>
        {illustration && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, taille pilotée par la grille
          <img src={shipIllustrationUrl(illustration)} alt="" draggable={false} className={styles.fill} />
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- cadre décoratif */}
      <img src={frame.src} alt="" aria-hidden draggable={false} className={styles.shipFrame} />
      {ability && <ShipAbilityPanel {...ability} />}
      <div className={styles.shipGauges}>
        <ShipGauge kind="anchor" value={hull} max={maxHull} />
        <ShipGauge kind="reason" value={reason} max={maxReason} />
      </div>
      {/* Dette de Déraison : la conséquence à venir, lisible sans survol (comme `ShipInstrumentCluster`). */}
      {reason < 0 && deraisonDamage > 0 && (
        <span className={styles.shipDebt} title="Déraison : chaque point sous 0 inflige 1 dégât d'Ancrage à la fin du tour si la Raison n'est pas remontée.">
          ⚓ −{deraisonDamage} en fin de tour
        </span>
      )}
    </div>
  );
}
