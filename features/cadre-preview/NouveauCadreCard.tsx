"use client";

import { isAbyssalVariant, type CardDefinition } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { useImageOk } from "@/features/match/useImageOk";
import styles from "@/features/cadre-preview/NouveauCadreCard.module.css";

/**
 * NOUVEAU CADRE — test (03/10/2026). En jeu, il remplace la carte complète
 * de `CardTile` quand le joueur l'active dans les Options (« Nouveau cadre
 * de carte », `lib/settings.ts`) ; sinon l'ancien rendu reste en place.
 * La tuile de plateau, les jetons et les dos ne changent pas.
 *
 * Parti pris de la maquette : l'illustration couvre TOUTE la carte, le cadre
 * n'est plus qu'un liseré posé par-dessus, et tout le reste est écrit sur
 * l'image (un voile sombre en pied garantit la lecture) :
 *  - haut-gauche : coût + cerveau de Raison ;
 *  - haut-droite : pictogramme de type + son libellé ;
 *  - pied : nom, texte de règles, puis Puissance (sur l'éclaboussure rouge)
 *    et Résistance.
 *
 * Une Abyssale porte son sujet dans un calque de DÉBORD (l'illustration n'est
 * que le décor), posé par-dessus le liseré, et un reflet irisé ; une
 * légendaire scintille (`NouveauCadreCard.module.css`).
 *
 * Assets : `public/assets/cards/frames/nouveau/` (cadre, cadre légendaire, cadre abyssal, cerveau, épée, bouclier,
 * fond de Puissance, `types/<type>.webp`).
 * Toutes les icônes (type, cerveau, épée, bouclier) sont fournies, blanches.
 */
const ASSETS = "/assets/cards/frames/nouveau";
/**
 * Version des icônes (type, cerveau, épée, bouclier) : une icône remplacée
 * sous le même nom resterait un jour en cache (service worker + HTTP).
 * À monter à chaque nouvelle livraison d'icônes.
 */
const ICONES_REV = 2;

export interface NouveauCadreFaceProps {
  def: CardDefinition;
  /** Cadre doré et scintillement (rareté `legendary`). Sans effet sur une Abyssale, qui a le sien. */
  legendaire?: boolean;
  /** Valeurs AFFICHÉES en partie (modificateurs, blessures) ; à défaut, celles imprimées. */
  attack?: number;
  health?: number;
  /** Classes du chiffre (couleur de bonus/malus, animation), fournies par `CardTile`. */
  attackClassName?: string;
  healthClassName?: string;
}

/** Enveloppe à largeur fixe de la page de test : la face y compose tout en `cqw`. */
export function NouveauCadreCard({ widthClassName = "w-64", ...props }: NouveauCadreFaceProps & { widthClassName?: string }) {
  return (
    <div className={`${widthClassName} relative aspect-[5/7]`}>
      <NouveauCadreFace {...props} />
    </div>
  );
}

/** La face seule : elle remplit son parent (format 5:7) et y ouvre son propre conteneur de `cqw`. */
export function NouveauCadreFace({ def, legendaire = false, attack, health, attackClassName = "", healthClassName = "" }: NouveauCadreFaceProps) {
  const illustration = `/assets/cards/illustrations/${def.id}.webp`;
  const illustrationOk = useImageOk(illustration);
  const hasPower = def.attack !== undefined;
  const hasResistance = def.health !== undefined;
  const abyssale = isAbyssalVariant(def);
  const debord = abyssale ? `/assets/cards/illustrations/${def.id}-debord.webp` : null;
  const debordOk = useImageOk(debord);

  return (
    <div className="absolute inset-0 select-none" style={{ containerType: "inline-size" }}>
      {/* Couche 1 : l'illustration, plein cadre, coupée à l'arrondi du liseré. */}
      <div className="absolute overflow-hidden bg-slate-900" style={{ inset: "1.2% 4.6% 1.2% 4.6%", borderRadius: "6cqw" }}>
        {illustrationOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={illustration} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full bg-gradient-to-b from-slate-700 to-slate-950" />
        )}
        {/* Voiles : un léger en tête pour le coût et le type, un franc en pied pour le texte. */}
        <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-black/55 to-transparent" />
        <div
          className="absolute inset-x-0 bottom-0 h-[58%]"
          style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 26%, rgba(0,0,0,0.9) 52%, rgba(0,0,0,0.96) 100%)" }}
        />
      </div>

      {/* Couche 2 : le liseré. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${ASSETS}/${frameName(def, legendaire)}.webp`}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full"
        draggable={false}
      />

      {/* Couche 3 (Abyssales) : le sujet, qui déborde du liseré et se fond dans le voile en pied. */}
      {abyssale && debordOk && debord && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={debord}
          alt=""
          className={`pointer-events-none absolute object-contain object-bottom ${styles.debord}`}
          style={{ top: "0%", left: "2%", width: "96%", height: "64%" }}
          draggable={false}
        />
      )}

      {/* Couche 4 : l'effet de rareté, sous les textes. */}
      {abyssale ? <EffetAbyssal /> : legendaire ? <EffetLegendaire /> : null}

      {/* Coût + Raison. */}
      <div
        className="absolute flex items-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
        style={{ top: "4.5%", left: "11%", gap: "2cqw", fontSize: "15cqw", textShadow: TEXT_SHADOW }}
      >
        <span>{def.cost}</span>
        <BrainGlyph />
      </div>

      {/* Type : glyphe blanc + libellé. */}
      <div className="absolute flex flex-col items-center text-white" style={{ top: "5%", right: "10%", width: "20%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ASSETS}/types/${def.type}.webp?v=${ICONES_REV}`}
          alt=""
          className="object-contain"
          style={{ height: "13cqw", width: "auto", filter: "drop-shadow(0 0.4cqw 0.6cqw rgba(0,0,0,0.7))" }}
          draggable={false}
        />
        <span
          className="whitespace-nowrap font-semibold leading-none [font-family:var(--font-card-body)]"
          style={{ fontSize: "5cqw", marginTop: "1.2cqw", textShadow: TEXT_SHADOW }}
        >
          {CARD_TYPE_LABELS[def.type]}
        </span>
      </div>

      {/* Pied : nom, règles, stats — empilés depuis le bas pour qu'un texte long pousse le nom vers le haut. */}
      <div
        className="absolute flex flex-col justify-end text-white"
        style={{ left: "11%", right: "11%", bottom: hasPower || hasResistance ? "16%" : "6%", top: "45%" }}
      >
        <h3
          className="font-bold [font-family:var(--font-card-title)]"
          style={{ fontSize: `${nameSizeCqw(def.name)}cqw`, lineHeight: 1.05, textShadow: TEXT_SHADOW }}
        >
          {def.name}
        </h3>
        {def.text && (
          <p
            // Hauteur plafonnée : un texte long (Le Géant Chromatique…) défile dans sa zone au lieu de recouvrir l'illustration.
            className={`font-semibold [font-family:var(--font-card-body)] ${styles.regles}`}
            style={{ fontSize: `${rulesSizeCqw(def.text)}cqw`, lineHeight: 1.2, marginTop: "3cqw", maxHeight: "36cqw", textShadow: RULES_SHADOW }}
          >
            {def.text}
          </p>
        )}
      </div>

      {/* Puissance sur l'éclaboussure rouge, Résistance à nu. */}
      {hasPower && (
        <div className="absolute" style={{ left: "7%", bottom: "4.5%", width: "44%", height: "12.5%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ASSETS}/fond-puissance.webp`} alt="" className="absolute inset-0 h-full w-full object-fill" draggable={false} />
          <div
            className="absolute inset-0 flex items-center justify-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
            style={{ gap: "2.5cqw", fontSize: "10cqw", textShadow: TEXT_SHADOW }}
          >
            <SwordGlyph />
            <span data-stat="attack" className={attackClassName}>{attack ?? def.attack}</span>
          </div>
        </div>
      )}
      {hasResistance && (
        <div
          className="absolute flex items-center justify-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
          style={{ right: "11%", bottom: "4.2%", height: "13%", gap: "2.5cqw", fontSize: "10cqw", textShadow: TEXT_SHADOW }}
        >
          <ShieldGlyph />
          <span data-stat="resistance" className={healthClassName}>{health ?? def.health}</span>
        </div>
      )}
    </div>
  );
}

const TEXT_SHADOW = "0 0.3cqw 0.8cqw rgba(0,0,0,0.85), 0 0 0.3cqw rgba(0,0,0,0.9)";
/** Texte de règles : petit corps, donc un contour plus serré pour qu'il tienne sur n'importe quelle image. */
const RULES_SHADOW = "0 0 0.4cqw rgba(0,0,0,1), 0 0.2cqw 0.5cqw rgba(0,0,0,0.95), 0 0 1.2cqw rgba(0,0,0,0.7)";

/** Étoiles de la légendaire : position (% de la carte) et décalage, fixes pour que la carte ne change pas d'un rendu à l'autre. */
const ETOILES = [
  { top: 8, left: 30, delai: 0 },
  { top: 18, left: 78, delai: 0.9 },
  { top: 34, left: 14, delai: 1.7 },
  { top: 42, left: 62, delai: 0.4 },
  { top: 27, left: 46, delai: 2.1 },
  { top: 55, left: 86, delai: 1.3 },
  { top: 62, left: 20, delai: 2.4 },
  { top: 12, left: 58, delai: 1.1 },
];

function EffetLegendaire() {
  return (
    <>
      <div className={styles.haloDore} />
      <div className={styles.calque}>
        <div className={styles.eclatDore} />
      </div>
      {ETOILES.map((etoile, index) => (
        <span
          key={index}
          className={styles.etoile}
          style={{ top: `${etoile.top}%`, left: `${etoile.left}%`, animationDelay: `${etoile.delai}s` }}
        />
      ))}
    </>
  );
}

function EffetAbyssal() {
  return (
    <>
      <div className={styles.haloAbyssal} />
      <div className={styles.calque}>
        <div className={styles.irisation} />
        <div className={styles.refletNacre} />
      </div>
    </>
  );
}

function nameSizeCqw(name: string): number {
  if (name.length <= 16) return 8.6;
  if (name.length <= 28) return 7.4;
  return 6.2;
}

function rulesSizeCqw(text: string): number {
  if (text.length <= 90) return 5.2;
  if (text.length <= 150) return 4.8;
  if (text.length <= 220) return 4.3;
  return 4;
}

/** Cerveau de Raison (icône fournie). */
function BrainGlyph() {
  return <StatIcon src={`${ASSETS}/cerveau.webp?v=${ICONES_REV}`} height="0.75em" />;
}

/** Épée de Puissance et bouclier de Résistance : même hauteur, en `em` pour suivre le chiffre. */
function SwordGlyph() {
  return <StatIcon src={`${ASSETS}/epee.webp?v=${ICONES_REV}`} height="1.1em" />;
}

function ShieldGlyph() {
  return <StatIcon src={`${ASSETS}/bouclier.webp?v=${ICONES_REV}`} height="0.9em" />;
}

/** L'épée, fine, monte un peu plus haut que le bouclier pour peser autant que lui. */
function StatIcon({ src, height }: { src: string; height: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className="w-auto shrink-0"
      style={{ height, filter: "drop-shadow(0 0.3cqw 0.6cqw rgba(0,0,0,0.8))" }}
      draggable={false}
    />
  );
}

/** Une Abyssale garde toujours son cadre (c'est sa variante qui le dicte) ; sinon légendaire ou standard. */
function frameName(def: CardDefinition, legendaire: boolean): string {
  if (isAbyssalVariant(def)) return "cadre-abyssal";
  return legendaire ? "cadre-legendaire" : "cadre";
}
