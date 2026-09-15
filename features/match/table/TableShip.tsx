import styles from "@/features/match/table/Table.module.css";
import {
  SHIP_FRAME_SRC,
  SHIP_ILLUSTRATION_CLIP,
  SHIP_ILLUSTRATION_ZONE,
  shipIllustrationUrl,
} from "@/features/ships/shipFrame";

export interface ShipView {
  /** Nom lisible, pour les lecteurs d'écran uniquement. */
  name: string;
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
export function TableShip({ name, illustration, hull, maxHull, reason, maxReason, deraisonDamage = 0 }: ShipView) {
  return (
    <div
      className={styles.ship}
      role="img"
      aria-label={`${name} — Ancrage ${hull}/${maxHull}, Raison ${reason}/${maxReason}`}
    >
      <div className={styles.shipArt} style={{ ...SHIP_ILLUSTRATION_ZONE, clipPath: SHIP_ILLUSTRATION_CLIP }}>
        {illustration && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, taille pilotée par la grille
          <img src={shipIllustrationUrl(illustration)} alt="" draggable={false} className={styles.fill} />
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- cadre décoratif */}
      <img src={SHIP_FRAME_SRC} alt="" aria-hidden draggable={false} className={styles.shipFrame} />
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
